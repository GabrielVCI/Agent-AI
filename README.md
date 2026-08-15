# Ferretería AI Agent

MVP de agente IA para ventas por WhatsApp orientado a ferreterías.

## Objetivo

Automatizar conversaciones de clientes, entender pedidos normales y técnicos, consultar productos, generar cotizaciones y enviar PDFs.

## Componentes

- Backend Node.js + Express + TypeScript + Prisma
- Base de datos PostgreSQL
- Redis (sesiones, rate limit, idempotencia)
- IA: OpenAI (salida estructurada por JSON schema)
- WhatsApp Cloud API (Meta) integrado en el backend
- Generación de PDF (Puppeteer)
- Panel SaaS multiempresa (frontend React + Vite)

## Backend

Para ejecutar el backend:

```bash
cd backend
npm install
npm run dev
```

## Integración WhatsApp (Meta Cloud API)

El backend recibe mensajes reales de WhatsApp y los responde con el agente IA.

### Variables de entorno (ver `backend/.env.example`)

| Variable | Uso |
| --- | --- |
| `META_WHATSAPP_TOKEN` | Bearer token de WhatsApp Cloud API. Solo backend. |
| `META_VERIFY_TOKEN` | Debe coincidir EXACTO con el Verify Token del panel de Meta. |
| `META_PHONE_NUMBER_ID` | Phone Number ID por defecto (solo fallback). |
| `META_GRAPH_API_VERSION` | Versión de Graph API (ej. `v20.0`). |
| `OPENAI_API_KEY` | Clave de OpenAI. Solo backend. |
| `OPENAI_DEFAULT_MODEL` | Modelo por defecto del agente (`gpt-4.1-mini`). |

> Ninguna de estas variables se expone al frontend.

### Endpoints del webhook

- `GET  /api/whatsapp/webhook` — verificación de Meta (`hub.mode` + `hub.verify_token` → `hub.challenge`).
- `POST /api/whatsapp/webhook` — recepción de mensajes (responde `200` inmediato).
- Alias internos equivalentes: `GET/POST /api/whatsapp/meta`.

### Asignar un número a un agente

En el panel (Agentes → Editar) completa **Phone Number ID de Meta**
(`whatsappPhoneNumberId`). El webhook enruta cada mensaje al agente `ACTIVE`
cuyo `whatsappPhoneNumberId` coincide con el `phone_number_id` del evento.

### Probar localmente con ngrok

```bash
# 1. Backend
cd backend && npm run dev          # escucha en :3002

# 2. Frontend
cd frontend && npm run dev          # :5173

# 3. Exponer el backend
ngrok http 3002
```

En el panel de Meta (WhatsApp → Configuration):

- **Callback URL:** `https://TU_NGROK_URL/api/whatsapp/webhook`
- **Verify Token:** el mismo valor de `META_VERIFY_TOKEN`
- Suscríbete al campo **messages**.

Luego crea/edita un agente `ACTIVE` con el `whatsappPhoneNumberId` real,
`aiModel = gpt-4.1-mini` y un prompt base, y envía un WhatsApp real al número.

### Flujo del webhook

1. Meta envía el evento → `POST /api/whatsapp/webhook`.
2. Se extrae `phone_number_id`, número del cliente, `message.id`, tipo y texto.
3. Idempotencia: si el `message.id` ya se procesó, se ignora (no responde duplicado).
4. Se busca el agente `ACTIVE` por `whatsappPhoneNumberId`. Si no hay, no responde.
5. Solo se procesa `type: text` (audio/imagen/documento se ignoran por ahora).
6. Se busca/crea la conversación y se guarda el mensaje entrante.
7. Si la conversación está `HUMAN_ACTIVE`, no responde la IA.
8. Si está `BOT_ACTIVE`, se llama al runtime IA (mismo motor que `POST /api/agents/:id/test`).
9. Se guarda el mensaje saliente y se envía la respuesta por WhatsApp.
10. La conversación aparece en el panel de Conversaciones.
## Planes y control de consumo (billing)

### Decisión de conteo de mensajes

La unidad comercial es el **mensaje procesado** (`UsageCounter.totalMessages`, por mes calendario):

- Cada **inbound** de cliente que entra a la plataforma por WhatsApp = 1.
- Cada **outbound** enviado por la plataforma (respuesta IA automática, respuesta manual del panel o aviso de sistema) = 1.

Ambos se registran por separado (`inboundMessages` / `outboundMessages`) y el usuario ve el total del mes. Los **tokens de OpenAI** se registran aparte (`aiTotalTokens`) como límite técnico opcional del plan (`Plan.monthlyTokenLimit`) para proteger costos; el límite comercial principal es `Plan.monthlyMessageLimit`.

La idempotencia de inbound la garantiza el webhook (dedupe por `whatsappMessageId` antes de contar).

### Comportamiento al alcanzar el límite

- La IA automática se pausa (no se llama a OpenAI ni se responde automático).
- El mensaje entrante **sí se guarda** y la conversación pasa a `HUMAN_ACTIVE` con un handoff abierto (aparece en el filtro "Esperando humano").
- El cliente recibe **una sola vez por mes** el aviso: "En este momento el servicio automático no está disponible. Un asesor dará seguimiento a tu mensaje."
- Las respuestas manuales del equipo **no se bloquean** (solo se cuentan).
- Log del backend: `[BILLING LIMIT] tenant ... bloqueado para IA automática`.

### Planes Sendwary

`npm run seed:plans` (backend) crea/actualiza por `code` sin duplicar ni borrar suscripciones. También repara: suscripciones en planes legados se mueven al equivalente con code, y tenants sin suscripción reciben BASIC (TRIALING).

| Plan | Precio | Implementación | Mensajes/mes (estimado → límite) | Usuarios | Agentes | Números |
|---|---|---|---|---|---|---|
| BASIC (Básico) | USD 40/mes | + USD 250 | 1.500 → **3.000** | 1 | 2 | 2 |
| PRO (Pro, "Más popular") | USD 60/mes | + USD 450 | 3.000 → **6.000** | 4 | 5 | 4 |
| ENTERPRISE | USD 90/mes | + desde USD 600 | 6.000 → **10.000** (ajustable) | 10 | 10 | 10 |

Los rangos visibles son estimados; el sistema aplica `monthlyMessageLimit`. Para Enterprise, el SUPER_ADMIN puede fijar una cuota negociada por tenant (`Subscription.customMonthlyMessageLimit`, desde Admin → cliente → Cambiar plan), que tiene prioridad sobre la del plan.

### LemonSqueezy (preparado, sin cobros reales)

Flujo de mejora de plan: el frontend llama `POST /api/billing/create-checkout` → el backend crea el checkout con `checkout_options.embed: true` → el frontend abre el **overlay embebido** con lemon.js (cargado bajo demanda desde assets.lemonsqueezy.com) o, como fallback, navega a la URL hosteada. La API key nunca sale del backend; el frontend no necesita ninguna variable de LemonSqueezy.

Variables backend (todas opcionales; sin ellas `POST /api/billing/create-checkout` responde 503 "Billing provider not configured" y la UI muestra el mensaje):

```
LEMONSQUEEZY_API_KEY=
LEMONSQUEEZY_STORE_ID=
LEMONSQUEEZY_WEBHOOK_SECRET=
LEMONSQUEEZY_BASIC_VARIANT_ID=
LEMONSQUEEZY_PRO_VARIANT_ID=
LEMONSQUEEZY_ENTERPRISE_VARIANT_ID=
LEMONSQUEEZY_SUCCESS_URL=
LEMONSQUEEZY_CANCEL_URL=
```

Endpoints: `GET /api/billing/plans` · `GET /api/billing/subscription` · `GET /api/billing/usage` · `POST /api/billing/create-checkout` · `POST /api/billing/lemonsqueezy/webhook` (público, firma HMAC-SHA256 del cuerpo crudo en `X-Signature`). La API key vive solo en backend; jamás se procesan tarjetas.

## Panel admin: venta manual de clientes (sin LemonSqueezy)

Solo SUPER_ADMIN. Admin → Clientes → **"Nuevo cliente"**:

1. **Crear cliente**: empresa + owner (si no defines contraseña, se genera una **temporal que se muestra UNA sola vez** — cópiala; el sistema de invitación por email está pendiente) + plan (Básico/Pro/Enterprise/**Personalizado**) + modo de cobro (`MANUAL` transferencia/acuerdo, `CUSTOM` negociado, `FREE`, `LEMONSQUEEZY` futuro) + límites + notas internas. Nada de esto toca LemonSqueezy.
2. **Plan personalizado**: usa ENTERPRISE como plan base y guarda las condiciones en la suscripción (`customPlanName`, `customMonthlyPrice`, `customSetupFee`, `customMonthlyMessageLimit`, `customMaxUsers/Agents/WhatsappNumbers`). Los overrides SIEMPRE tienen prioridad sobre el plan: el runtime IA, el middleware de límites y la vista del owner usan los valores efectivos (`getTenantActiveSubscription`).
3. **Editar suscripción**: detalle del cliente → card "Suscripción" (plan base, modo de cobro, estado de pago `NOT_REQUIRED/PENDING/PAID/OVERDUE`, mensualidad/implementación/límite custom).
4. **Suspender/reactivar/cancelar**: acciones del detalle. Una empresa **suspendida o cancelada bloquea la IA automática** de inmediato (los mensajes entrantes se siguen guardando y quedan para atención humana); login y datos nunca se bloquean. `paymentStatus=OVERDUE` muestra advertencia al owner sin bloquear.
5. **Resetear uso**: botón en el detalle (solo para pruebas/demo; borra el contador del mes).
6. **Convivencia con LemonSqueezy**: cuando se activen las credenciales, los clientes con `billingMode=LEMONSQUEEZY` se gestionarán por webhook; los `MANUAL/CUSTOM/FREE` siguen gestionándose desde este panel. Futuro documentado: `POST /api/admin/tenants/:id/impersonate` (requiere diseño de seguridad antes de existir).

Endpoints: `POST /api/admin/tenants` (creación completa) · `PUT /api/admin/tenants/:id` (datos + notas) · `PUT /api/admin/tenants/:id/subscription` · `POST /api/admin/tenants/:id/reset-usage` · los existentes de suspend/reactivate/cancel/users. Todos con `requireSuperAdmin`; acciones administrativas quedan logueadas con prefijo `[ADMIN]`.
