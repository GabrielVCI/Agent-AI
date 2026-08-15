# WhatsApp Embedded Signup

> Base funcional implementada. **Deshabilitado por defecto**: se activa cuando
> la app de Meta tenga aprobado el *advanced access* de los permisos de
> WhatsApp (ver §9). Documentación de referencia consultada: Embedded Signup v4
> de Meta (julio 2026).

## 1. Qué es Embedded Signup

Es el flujo oficial de Meta para que un cliente conecte su WhatsApp Business a
una plataforma como Sendwary **sin crear una app en Meta Developers ni copiar
tokens**. El cliente pulsa un botón, inicia sesión con Facebook en un popup de
Meta, elige (o crea) su cuenta de WhatsApp Business y su número, y concede
permisos. Meta nos devuelve un código que el backend intercambia por las
credenciales de ese cliente.

Es el mismo mecanismo que usan respond.io, ManyChat y similares.

## 2. Qué necesita Sendwary en Meta

| Requisito | Estado |
|---|---|
| App de Meta con el producto WhatsApp | ⏳ pendiente de configuración externa |
| Facebook Login for Business + Configuration ID | ⏳ pendiente |
| Permisos `whatsapp_business_management` y `whatsapp_business_messaging` con **advanced access** | ⏳ requiere App Review |
| Verificación del negocio Sendwary en Meta Business | ⏳ pendiente |
| Webhook público configurado en la app | ✅ ya existe (`/api/whatsapp/webhook`) |
| Dominio del panel en los dominios permitidos de la app | ⏳ pendiente |

## 3. Variables necesarias

**Backend** (`backend/.env`) — todas server-side:

```
META_EMBEDDED_SIGNUP_ENABLED=false   # true cuando Meta apruebe la app
META_APP_ID=
META_APP_SECRET=                     # SECRETO
META_EMBEDDED_SIGNUP_CONFIG_ID=
META_SYSTEM_USER_ACCESS_TOKEN=       # SECRETO
META_BUSINESS_ID=
META_WEBHOOK_APP_SECRET=             # SECRETO (fallback: META_APP_SECRET)
META_WEBHOOK_VERIFY_TOKEN=           # compat: META_VERIFY_TOKEN
META_GRAPH_API_VERSION=v21.0
ALLOW_GLOBAL_META_TOKEN_FALLBACK=false
```

**Frontend** (`frontend/.env`) — públicas por diseño (van al bundle):

```
VITE_META_APP_ID=
VITE_META_EMBEDDED_SIGNUP_CONFIG_ID=
VITE_META_GRAPH_API_VERSION=v21.0
VITE_META_EMBEDDED_SIGNUP_ENABLED=false
```

> La fuente de verdad es el **backend**: `/api/integrations/whatsapp` devuelve
> `capabilities.embeddedSignup` con `{enabled, appId, configId, graphApiVersion}`.
> Las `VITE_*` solo actúan como respaldo. Así el flujo se activa cambiando una
> variable del servidor, sin reconstruir el frontend.

## 4. Qué debe configurar el admin en Meta

1. **Crear la app** en developers.facebook.com (tipo Business) y agregar el
   producto **WhatsApp**.
2. **Facebook Login for Business** → crear una configuración de Embedded Signup
   y copiar su **Configuration ID**.
3. **Permisos**: solicitar en App Review el *advanced access* de
   `whatsapp_business_management` y `whatsapp_business_messaging`.
4. **Webhook**: en WhatsApp → Configuration, apuntar la Callback URL a
   `https://<tu-backend>/api/whatsapp/webhook` con el verify token, y
   suscribir el campo `messages`.
5. **Dominios permitidos**: agregar el dominio del panel de Sendwary en la
   configuración de Facebook Login (OAuth redirect / allowed domains).
6. **Verificación del negocio** de Sendwary en Meta Business Manager.
7. Copiar App ID, App Secret y Configuration ID a las variables de entorno.

## 5. Qué hace el cliente

1. Entra a **Herramientas externas → WhatsApp**.
2. Pulsa **“Conectar con Meta”**.
3. Inicia sesión con Facebook en el popup **de Meta** (Sendwary nunca ve esa
   contraseña) y sigue los pasos: portfolio de negocio → cuenta de WhatsApp
   Business → número → permisos.
4. Al terminar, el panel confirma la conexión y le pide asignar el número a uno
   de sus agentes IA.

Si algo falla, siempre tiene **“Solicitar asistencia”** y **“Ya tengo WhatsApp
Cloud API”** (configuración manual).

## 6. Qué guarda Sendwary

| Dato | Dónde |
|---|---|
| WABA ID, Business ID, Phone Number ID, número visible | `WhatsAppIntegration` (texto plano: no son secretos) |
| Business token del cliente | `accessTokenEncrypted` — **AES-256-GCM**; solo se expone `tokenLastFour` |
| Fecha de conexión y de suscripción a webhooks | `embeddedSignupCompletedAt`, `webhookSubscribedAt` |
| Evento del flujo (FINISH, FINISH_ONLY_WABA…) e ids | `metadataJson`, **sanitizado** |
| **El `code` de Meta** | ❌ **no se guarda**: vive 30 segundos, es de un solo uso y se descarta tras el intercambio |

## 7. Flujo técnico implementado

```
Navegador                          Backend                        Meta
────────────────────────────────────────────────────────────────────────
loadFacebookSdk() ─ una sola vez
FB.login({config_id,
  response_type:'code',
  override_default_response_type:true,
  extras:{setup:{}}})           ──────────────────────────────▶ popup Meta
   ◀── postMessage WA_EMBEDDED_SIGNUP {waba_id, phone_number_id, business_id}
   ◀── callback: authResponse.code  (TTL 30 s)

POST /api/integrations/whatsapp/embedded-signup/complete
   {code, wabaId, phoneNumberId, businessId, event}
                                   │
                                   ├─ GET /oauth/access_token ──▶ business token
                                   ├─ GET /{waba}/phone_numbers ▶ confirma número
                                   ├─ cifra el token (AES-256-GCM) y guarda
                                   └─ POST /{waba}/subscribed_apps ▶ webhooks
                                   ◀── {status, phoneNumberId, wabaId, nextStep}
```

**Regla de estado**: `CONNECTED` solo si hay `wabaId` **+** `phoneNumberId`
**+** token utilizable. Si falta algo → `REQUIRES_ACTION` con un mensaje
accionable. Nunca se le dice al cliente que está conectado si Meta no confirmó
lo suficiente. Si la suscripción a webhooks falla, la conexión **no se cae**:
queda conectada con aviso y el equipo puede reintentar desde el panel admin.

## 8. Errores posibles

| Error | Qué ve el cliente | Causa |
|---|---|---|
| SDK no carga | “No pudimos cargar el conector de Meta…” | Bloqueador de anuncios, red corporativa, offline |
| Falta `config_id` | “La conexión automática no está disponible” | Variables sin configurar |
| Cliente cancela | “Cancelaste la conexión con Meta…” | Cerró el popup |
| Sin `phone_number_id` | “Meta no devolvió un número conectado…” | No seleccionó/registró número (evento `FINISH_ONLY_WABA`) |
| Code expirado | “No pudimos completar la conexión…” | Tardó más de 30 s en llegar al backend |
| Token insuficiente | “No recibimos las credenciales necesarias…” | Permisos no concedidos o sin advanced access |
| Webhook falla | Conectado **con aviso** | Permisos o WABA no elegible |
| Número de otro tenant | “Ese número ya está registrado por otra empresa” | Conflicto real: revisar con soporte |

## 9. Qué queda pendiente (configuración externa)

**Ninguno de estos puntos se puede resolver desde el código**:

1. **App Review de Meta** con advanced access de `whatsapp_business_management`
   y `whatsapp_business_messaging`. Sin esto, Meta **rechaza el onboarding de
   clientes** — es el bloqueador principal.
2. Verificación del negocio Sendwary en Meta Business.
3. Creación de la configuración de Embedded Signup y su Configuration ID.
4. Registro del dominio del panel en la app de Meta.
5. (Opcional, para volumen) *Access Verification* de Tech Provider: sube el
   límite a 200 clientes onboarded por semana.

Mientras tanto, `META_EMBEDDED_SIGNUP_ENABLED=false` y el panel muestra el
fallback de asistencia; el resto del producto funciona igual.

## 10. Cómo probar

**Con Embedded Signup deshabilitado (estado actual):**
El panel muestra “La conexión automática está en preparación. Puedes solicitar
asistencia o usar configuración avanzada.” — sin errores en consola, con los
dos botones operativos. El endpoint `/embedded-signup/complete` responde 503
con mensaje amigable.

**Con Embedded Signup habilitado:**
1. Poner las variables de la §3 y `META_EMBEDDED_SIGNUP_ENABLED=true`.
2. Reiniciar el backend (las capabilities se leen del entorno).
3. En el panel: WhatsApp → “Conectar con Meta”.
4. Usar una cuenta de prueba de Meta (Business Manager de test) para no tocar
   números reales.
5. Verificar en logs `[EMBEDDED SIGNUP]` que el code se intercambió, la WABA
   respondió números y la suscripción a webhooks fue OK.
6. Comprobar en el panel admin que aparecen WABA ID, Phone Number ID y la fecha
   de suscripción de webhooks — y que **no** aparece ningún token.

**Asignar el número a un agente**: tras conectar, el panel ofrece la lista de
agentes (`POST /api/integrations/whatsapp/assign-agent`). El agente no se
activa automáticamente sin que el usuario lo confirme.

**Health check**: `GET /api/integrations/whatsapp/health` devuelve estado,
checklist, `tokenConfigured` (booleano, nunca el token), WABA, número,
suscripción de webhooks, agente asignado y últimos mensajes entrante/saliente.

## 11. Referencias

- Estrategia y modos de conexión: `WHATSAPP_ONBOARDING_STRATEGY.md`
- Preparación del número: `WHATSAPP_NUMBER_READINESS.md`
- Configuración manual: `WHATSAPP_SETUP.md`
- Soporte: `support-playbooks/whatsapp.md`
