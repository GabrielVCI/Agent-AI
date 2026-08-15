# WhatsApp Embedded Signup — flujo end-to-end

Documento operativo del flujo completo: qué hace el cliente, qué hace Sendwary
y qué hay que configurar en Meta. Complementa `WHATSAPP_EMBEDDED_SIGNUP.md`
(conceptual) y `WHATSAPP_SETUP.md` (configuración manual / modo avanzado).

Verificado contra la documentación de Meta vigente a **julio 2026**
(Embedded Signup **v4**).

> **Aviso de deprecación**: Embedded Signup **v2 deja de funcionar el 15 de
> octubre de 2026**. Sendwary ya usa v4 (`config_id` + Facebook Login for
> Business). No se requiere migración.

---

## 1. Flujo completo

```
Cliente (navegador)                Sendwary backend                 Meta
──────────────────                 ────────────────                 ────
[Conectar con Meta]
   │
   ├─ carga JS SDK ────────────────────────────────────────────────► connect.facebook.net
   │
   ├─ FB.login({config_id, response_type:'code',
   │            override_default_response_type:true,
   │            extras:{setup:{}}})  ──────────────────────────────► popup Meta
   │                                                                    │
   │◄── postMessage WA_EMBEDDED_SIGNUP {waba_id,                        │
   │     phone_number_id, business_id}, event ◄───────────────────────┘
   │◄── callback: authResponse.code  (TTL 30 s)
   │
   └─ POST /api/integrations/whatsapp/embedded-signup/complete
         { code, wabaId, phoneNumberId, businessId, event }
                          │
                          ├─ GET /v21.0/oauth/access_token ──────────► token del cliente
                          │    (client_id + client_secret + code)      (customer-scoped)
                          │
                          ├─ cifra el token (AES-256-GCM) y lo guarda
                          │
                          ├─ GET /v21.0/{waba-id}/phone_numbers ─────► lista de números
                          │
                          ├─ 1 número  → lo selecciona
                          ├─ N números → los devuelve para que el cliente elija
                          │              (status REQUIRES_ACTION)
                          │
                          ├─ POST /v21.0/{waba-id}/subscribed_apps ──► webhooks
                          │
                          └─ status CONNECTED solo si hay
                             wabaId + phoneNumberId + token
```

Si hay varios números, el cliente elige y el frontend llama:

```
POST /api/integrations/whatsapp/embedded-signup/select-phone-number
     { phoneNumberId }
```

El backend **revalida contra la Graph API** que ese número pertenece a la WABA
del tenant antes de guardarlo — no confía en el id que manda el navegador.

### Regla dura

Nunca se marca `CONNECTED` sin `wabaId` **y** `phoneNumberId` **y** credenciales
utilizables. Si falta algo → `REQUIRES_ACTION` con un mensaje accionable.

---

## 2. Variables necesarias

### Backend (`backend/.env`) — contiene los secretos

| Variable | Secreto | Para qué |
|---|---|---|
| `META_APP_ID` | no | id de la app de Meta |
| `META_APP_SECRET` | **sí** | intercambio del `code` |
| `META_GRAPH_API_VERSION` | no | `v21.0` |
| `META_EMBEDDED_SIGNUP_CONFIG_ID` | no | Configuration ID del flujo |
| `META_EMBEDDED_SIGNUP_ENABLED` | no | interruptor del flujo (`false` por defecto) |
| `META_WEBHOOK_VERIFY_TOKEN` | **sí** | verificación GET del webhook |
| `META_WEBHOOK_APP_SECRET` | **sí** | firma `X-Hub-Signature-256` (cae a `META_APP_SECRET`) |
| `META_BUSINESS_ID` | no | Business Portfolio de Sendwary |
| `META_SYSTEM_USER_ACCESS_TOKEN` | **sí** | acciones a nivel plataforma |
| `ALLOW_GLOBAL_META_TOKEN_FALLBACK` | no | `false` en producción |

### Frontend (`frontend/.env`) — solo datos públicos

```
VITE_META_APP_ID=
VITE_META_GRAPH_API_VERSION=v21.0
VITE_META_EMBEDDED_SIGNUP_CONFIG_ID=
VITE_META_EMBEDDED_SIGNUP_ENABLED=false
```

El frontend **jamás** recibe `META_APP_SECRET`, `META_SYSTEM_USER_ACCESS_TOKEN`,
`META_WEBHOOK_APP_SECRET` ni ningún access token de cliente. La config pública
la sirve el backend en `GET /api/integrations/whatsapp` →
`capabilities.embeddedSignup`; las `VITE_*` son solo respaldo.

---

## 3. Configuración en Meta

1. **App**: Meta Developers → crear app tipo *Business*.
2. **Producto**: añadir *WhatsApp*.
3. **Facebook Login for Business**: añadir el producto.
4. **Configuration ID**: en *Facebook Login for Business → Configuraciones*,
   crear una configuración de tipo **WhatsApp Embedded Signup**. El ID que
   genera va en `META_EMBEDDED_SIGNUP_CONFIG_ID` / `VITE_..._CONFIG_ID`.
5. **Permisos** (requieren *Advanced Access*, ver §6):
   - `whatsapp_business_management`
   - `whatsapp_business_messaging`
   - `business_management`
6. **Dominios permitidos**: en *Facebook Login → Configuración*, añadir el
   dominio de la app (`https://app.sendwary.com` y el de staging). El JS SDK
   se niega a abrir el popup desde un origen no listado.
7. **Webhook**: en *WhatsApp → Configuración*, URL de callback:
   ```
   https://<tu-dominio>/api/whatsapp/meta
   ```
   Verify token = `META_WEBHOOK_VERIFY_TOKEN`. Campo suscrito: `messages`.
8. **Rol Tech Provider**: solicitarlo en el Business Portfolio de Sendwary.

---

## 4. Cómo probar

### Con Embedded Signup deshabilitado (por defecto)

Con `META_EMBEDDED_SIGNUP_ENABLED=false`:

- Canales → WhatsApp muestra el fallback: *"La conexión automática está en
  preparación. Puedes solicitar asistencia o usar configuración avanzada."*
- No se carga el JS SDK ni se crashea nada.
- **Solicitar asistencia** y **Ya tengo WhatsApp Cloud API** siguen funcionando.
- El endpoint `complete` responde 4xx con mensaje amigable si se llama a mano.

### En local / staging

`META_EMBEDDED_SIGNUP_ENABLED=true` + app de Meta en modo desarrollo. Sin App
Review solo pueden completar el flujo los usuarios con rol en la app
(administrador, desarrollador, probador). Suficiente para validar el flujo
completo con una WABA de prueba.

### En producción

Requiere Advanced Access aprobado (§6) y rol Tech Provider. Además, **cada
cliente debe añadir un método de pago a su WABA** — sin eso Meta bloquea el
envío de mensajes.

---

## 5. Errores comunes

| Síntoma | Causa | Qué hacer |
|---|---|---|
| `SDK_LOAD_FAILED` / `SDK_TIMEOUT` | bloqueador de anuncios, red corporativa | desactivar bloqueador; si persiste, asistencia |
| Popup no abre | dominio no listado en Facebook Login | añadir el origen en la config de la app |
| `config_id` inválido | ID mal copiado o de otra app | verificar `META_EMBEDDED_SIGNUP_CONFIG_ID` |
| Usuario cierra el popup | cancelación | mensaje amigable + reintentar |
| No llega `code` | flujo incompleto o permisos denegados | repetir el flujo |
| `event: FINISH_ONLY_WABA` | creó la WABA sin número | añadir número y repetir |
| Sin `phone_number_id` | no seleccionó/registró número | `REQUIRES_ACTION` + repetir |
| Varios números | normal | el cliente elige en la UI |
| `subscribed_apps` falla | permisos insuficientes | queda warning; reintentar desde admin |
| Token insuficiente | Advanced Access faltante | pendiente de App Review |
| App no aprobada | modo desarrollo | solo usuarios con rol en la app |

Ningún error técnico crudo llega al cliente: todos pasan por `metaErrorMessage`.

---

## 6. Qué requiere aprobación externa

Pendiente de configuración/aprobación **fuera de Sendwary**:

- [ ] **App Review** con *Advanced Access* de `whatsapp_business_management` y
      `whatsapp_business_messaging`. Sin esto solo funciona con usuarios que
      tengan rol en la app.
- [ ] **Rol Tech Provider** en el Business Portfolio de Sendwary.
- [ ] **Verificación del negocio** (Business Verification) de Sendwary.
- [ ] **Método de pago** en la WABA de cada cliente — lo pone el cliente, no
      es automatizable.
- [ ] **Línea de crédito compartida** (opcional, solo si Sendwary factura el
      consumo de mensajes en vez del cliente).

Mientras falte cualquiera de estos, el flujo se mantiene con
`META_EMBEDDED_SIGNUP_ENABLED=false` y los clientes se conectan por
**asistencia** (el equipo lo configura) o **configuración avanzada**.

---

## 7. Qué guarda Sendwary

En `WhatsAppIntegration` (uno por tenant):

- `wabaId`, `businessId`, `phoneNumberId` (único global), `displayPhoneNumber`
- `accessTokenEncrypted` (AES-256-GCM), `tokenLastFour`, `tokenExpiresAt`
- `embeddedSignupCompletedAt`, `webhookSubscribedAt`, `lastValidationAt`
- `lastValidationError`, `lastHealthStatus`, `metadataJson` (sanitizado)

**No se guarda**: el `code` de Meta (TTL 30 s, un solo uso — se intercambia y se
descarta), ni el payload crudo con tokens, ni la contraseña del cliente
(Sendwary nunca la ve).

---

## 8. Health check

```
GET /api/integrations/whatsapp/health
```

Devuelve `connected`, `status`, `mode`, `provider`, `hasWabaId`,
`hasPhoneNumberId`, `hasToken`, `webhookSubscribed`, `assignedAgent`,
`assignedAgentActive`, `lastInboundAt`, `lastOutboundAt`, `lastError` y
`recommendations` (siguientes pasos en lenguaje de negocio). Nunca el token.

---

## 9. Asignación a agente

```
POST /api/integrations/whatsapp/assign-agent
     { agentId, phoneNumberId, reassign?, activate? }
```

`activate` es **opt-in**: asignar un número no activa el agente. La UI pide
confirmación explícita (*"¿Quieres activar este agente para responder por
WhatsApp?"*) antes de mandar `activate: true`.

---

## 10. Webhook multi-tenant

`POST /api/whatsapp/meta` resuelve el tenant por
`entry[].changes[].value.metadata.phone_number_id`:

1. Integración `DEMO_SANDBOX` → credenciales del número demo de Sendwary.
2. Integración `CONNECTED` del tenant → su token propio (descifrado).
3. Sin integración → token global **solo** si
   `ALLOW_GLOBAL_META_TOKEN_FALLBACK=true` (dev/demo).

Si no resuelve, se responde **200** a Meta (para que no reintente) y se loguea
sin procesar. Nunca se mezclan tokens entre empresas: `phoneNumberId` es único
global en la base.
