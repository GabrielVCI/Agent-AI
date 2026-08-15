# Configuración de WhatsApp Business Cloud API por empresa

Guía para conectar **tu propio WhatsApp Business** a Sendwary. Cada empresa usa
sus propias credenciales de Meta — Sendwary nunca comparte su token con los
clientes ni viceversa.

> Panel: **Herramientas externas → WhatsApp Business → Conectar WhatsApp**
> (solo OWNER/ADMIN). El wizard te guía por estos mismos pasos.

---

## 1. Requisitos de Meta

- Cuenta de **Meta Business** activa ([business.facebook.com](https://business.facebook.com)).
- Una **app de Meta** con el producto **WhatsApp** agregado
  ([developers.facebook.com](https://developers.facebook.com) → Create App → Business).
- Un **número de teléfono** disponible (no vinculado a WhatsApp personal) o ya
  aprobado en tu WhatsApp Business Account (WABA).
- Acceso **administrativo** al Business Manager.

⚠️ Si tu número ya se usa en la app normal de WhatsApp/WhatsApp Business,
primero debes **migrarlo a la plataforma Cloud API** desde Meta; si no, la
verificación fallará.

## 2. Cómo obtener el Phone Number ID

1. developers.facebook.com → tu app → **WhatsApp → API Setup**.
2. En el bloque "Send and receive messages" verás **Phone number ID** (numérico)
   debajo del número. Cópialo tal cual.
3. Opcional: en la misma pantalla está el **WhatsApp Business Account ID** (WABA ID).

## 3. Cómo obtener el Access Token

El panel de pruebas de Meta genera un **token temporal de 24 horas** — sirve
para probar, pero **caduca**. Para producción crea un token permanente:

1. Business Manager → **Configuración del negocio → Usuarios → Usuarios del sistema**.
2. Crea un usuario del sistema (rol Admin) si no existe.
3. **Agregar activos** → tu app → acceso total.
4. **Generar token** → selecciona la app → permisos: `whatsapp_business_messaging`
   y `whatsapp_business_management` → sin expiración (o la más larga disponible).
5. Copia el token y pégalo en el wizard de Sendwary (Paso 2).

Sendwary lo **cifra (AES-256-GCM)** al guardarlo y solo vuelve a mostrar los
últimos 4 caracteres. Si lo pierdes, genera uno nuevo y reemplázalo.

## 4. Cómo configurar el webhook

En tu app de Meta: **WhatsApp → Configuration → Webhook → Edit**:

| Campo | Valor |
|---|---|
| Callback URL | `https://TU_BACKEND/api/whatsapp/webhook` (el wizard te da la URL exacta con botón de copiar) |
| Verify token | El que muestra el wizard en el Paso 3 (se genera automáticamente por empresa) |

Al guardar, Meta hace un GET de verificación; si el token coincide, en el
wizard verás "Webhook verificado por Meta".

## 5. Qué campos suscribir

En **Webhook fields**, suscribe únicamente:

- ✅ `messages`

No necesitas más campos para el flujo de agentes de Sendwary.

## 6. Cómo validar la conexión

Wizard Paso 4 → **Validar conexión**. Sendwary llama a la Graph API con tu
token (server-side, nunca desde el navegador) y comprueba que:

- el token es válido y no expiró, y
- el Phone Number ID pertenece a ese token.

Si funciona, el estado pasa a **Conectado** y se muestra el número y el nombre
verificado. Si falla, verás el motivo exacto y el estado queda en **Error**.

## 7. Cómo asignar el número a un agente

Wizard Paso 5: elige el agente IA y pulsa **Asignar**. Esto:

- guarda el `phoneNumberId` en el agente (es la clave con la que el webhook
  enruta los mensajes entrantes),
- activa el agente si estaba inactivo.

Si el número ya estaba en otro agente, Sendwary pide confirmación antes de
reasignarlo (un número solo atiende con un agente a la vez).

Opcional: envía un **mensaje de prueba** a tu propio teléfono. El contenido es
fijo (no editable) para impedir el uso de esta función como canal de spam.

## 8. Errores comunes

| Síntoma | Causa probable | Solución |
|---|---|---|
| Meta rechaza el webhook ("no se pudo validar la URL de callback") | Verify token incorrecto o URL mal copiada | Copia ambos con los botones del wizard (Paso 3); el backend debe ser accesible por HTTPS público |
| "El token no es válido o expiró" | Token temporal de 24h caducado, o token revocado | Genera un token de usuario del sistema (sección 3) y guárdalo de nuevo |
| "El Phone Number ID no existe o no pertenece a este token" | ID mal copiado, o el número está en otra app/WABA | Revisa WhatsApp → API Setup; el token debe salir de la MISMA app que el número |
| El webhook verifica pero el agente no responde | Agente inactivo o número sin asignar | Wizard Paso 5: asigna el número a un agente (queda activo automáticamente) |
| Responde en el panel pero no llega al cliente | Integración no validada (estado ≠ Conectado) y fallback global apagado | Ejecuta "Validar conexión"; en producción `ALLOW_GLOBAL_META_TOKEN_FALLBACK` debe ser `false` y cada tenant usa su token |
| "Meta está limitando las peticiones" | Rate limit de Meta (código 4 / 80007) | Espera unos minutos; evita validar en bucle |
| El mensaje de prueba falla | Destinatario fuera de la ventana de 24h | Escribe primero al número del negocio desde tu teléfono y reintenta |

## 9. Buenas prácticas para evitar bloqueos de Meta

- **Consentimiento**: escribe solo a clientes que aceptaron recibir mensajes.
  Meta banea números con alta tasa de reportes/bloqueos.
- **Ventana de 24h**: fuera de ella solo se puede iniciar conversación con
  **plantillas aprobadas** por Meta (message templates). El texto libre solo
  funciona como respuesta dentro de la ventana.
- **Nada de mensajes masivos no solicitados**: la plataforma no ofrece (a
  propósito) envío masivo de texto libre.
- **Calidad del número**: vigila el *quality rating* en Meta; si baja a rojo,
  reduce volumen y revisa el contenido.
- **Números verificados**: usa solo números aprobados en tu WABA; verifica el
  negocio en Business Manager para subir los límites de mensajería.
- **Tokens**: usa tokens de usuario del sistema, no los temporales; no los
  compartas; rota el token si sospechas fuga (pégalo de nuevo en el wizard).
- **No automatizar spam**: los flujos de Sendwary responden a mensajes
  entrantes de clientes; mantenlo así.

## 10. Arquitectura (referencia técnica)

- Modelo `WhatsAppIntegration` (por tenant): `phoneNumberId` único global,
  `verifyToken` propio, `accessTokenEncrypted` (AES-256-GCM vía
  `backend/src/lib/crypto.ts`), estados `DRAFT → CONNECTED / ERROR / DISABLED`.
- Webhook `GET/POST /api/whatsapp/webhook` (y alias `/meta`):
  - GET acepta el verify token **global** (`META_VERIFY_TOKEN`, compat) o el de
    **cualquier tenant** (marca `webhookVerifiedAt`).
  - POST resuelve agente por `phone_number_id` y las credenciales de envío con
    `resolveSendCredentials()`: token del tenant si hay integración
    `CONNECTED`; si no, token global **solo** si
    `ALLOW_GLOBAL_META_TOKEN_FALLBACK=true` (dev/demo). Sin credenciales: se
    loguea y no se responde.
- El envío manual del inbox y los recordatorios de citas usan la misma
  resolución de credenciales.
- **Embedded Signup / OAuth de Meta (futuro)**: el enum `WhatsAppProvider` y el
  flujo están preparados — el OAuth solo tendrá que crear/actualizar la fila con
  el token que devuelva Meta (`upsertWhatsAppIntegration`); webhook, envío,
  validación y asignación de agentes no cambian.

### Variables de entorno

| Variable | Ámbito | Descripción |
|---|---|---|
| `META_VERIFY_TOKEN` | Global (legacy/demo) | Verify token del webhook para la app de Meta de la plataforma |
| `META_WHATSAPP_TOKEN` | Global (legacy/demo) | Token de la plataforma; solo se usa como fallback controlado |
| `META_PHONE_NUMBER_ID` | Global (legacy/demo) | Número demo de la plataforma |
| `META_GRAPH_API_VERSION` | Global | Default `v20.0`; cada integración puede fijar la suya |
| `ALLOW_GLOBAL_META_TOKEN_FALLBACK` | **Nueva** | `true` solo en dev/demo. En producción `false`: cada tenant responde con SU token |
| `ENCRYPTION_KEY` | Global | 64 hex (32 bytes) para AES-256-GCM. **Obligatoria en producción** (en dev deriva de `SESSION_SECRET`) |
| `BACKEND_PUBLIC_URL` | Global | Base de la Callback URL que muestra el wizard |
