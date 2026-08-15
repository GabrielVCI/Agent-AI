# Fase Voz: agentes con llamadas (ElevenLabs) + rate limiting

> Documento de diseño — Sendwary. Auditoría y arquitectura propuesta.
> **No implementa nada**: es el plano para las fases V1–V5.

## 1. Auditoría del estado actual

### Modelos Prisma

| Modelo | Estado para esta fase |
|---|---|
| `Plan` | Completo. `code = ENTERPRISE` identifica el plan con derecho a voz. |
| `Subscription` | Tiene `billingMode`, `paymentStatus` y el **patrón de overrides custom** (`customMonthlyMessageLimit`, `customMaxUsers`, …). Se replica con `customVoiceMinutesLimit`. |
| `Tenant` | Patrón de settings JSON establecido (`appointmentSettings`, `trainingConfig`) → encaja `voiceSettings`. Tiene `internalNotes`, estados ACTIVE/SUSPENDED/CANCELLED. |
| `User` | Sin cambios necesarios. |
| `Agent` | Flags de capacidades booleanos (`allowAudioMessages`, `allowHumanHandoff`) → encaja `allowVoiceCalls`. |
| `Conversation` | **No tiene `channel`**: todo es WhatsApp implícito. Necesita enum `WHATSAPP \| VOICE` (default WHATSAPP = cero impacto). |
| `Message` | Soporta `AUDIO` + `transcriptionText`, pero una llamada no es un mensaje: requiere `CallLog` propio. |
| `UsageCounter` | Existe y es el **molde exacto**: una fila por tenant+mes calendario, upsert atómico, enforcement en caliente. Tiene `audioTranscriptionSeconds` sin uso (no se reutiliza para no mezclar conceptos). |
| AIUsage | `UsageMetric` (metricType AI_REPLY, tokens en metadata) + `UsageCounter.aiTotalTokens`. |
| Billing | `getTenantActiveSubscription()` resuelve límites efectivos (custom > plan); `checkAiAllowance()` ya bloquea por tenant suspendido/cancelado y por límites. El gating de voz sigue el mismo molde. |

### Respuestas puntuales de la auditoría

2. **Canales distintos de WhatsApp**: no existen; el canal es implícito.
3. **`Conversation.channel`**: no existe (agregar).
4. **Voice/call metadata en Message**: parcial (AUDIO + transcripción); insuficiente para llamadas.
5. **Usage mensual**: sí, `UsageCounter` (mensajes+tokens).
6. **Límites personalizados en billing**: sí, patrón custom-overrides operativo end-to-end (runtime IA, middleware de límites, panel owner, admin).
7. **Rate limiting**: existe base con `express-rate-limit` + store Redis fail-open:
   - `authRateLimit`: 20 req/15 min en login/register.
   - `apiRateLimit`: 120 req/min **global en `/api`**.
   - `webhookRateLimit`: 300 req/min en el webhook de WhatsApp.
   - ⚠️ **Hallazgo crítico**: `apiRateLimit` se aplica *antes* de la autenticación ⇒ `req.user` es siempre `undefined` en ese punto ⇒ su `keyGenerator` cae a `"anonymous"` ⇒ **todo el tráfico del API comparte un solo bucket de 120 req/min**. Dos usuarios activos pueden agotar el límite de todos. Fix #1 de la parte F.
8. **Endpoints actuales**: auth, onboarding, company (+users), agents (+test), conversations (+labels/assign/profile), dashboard, settings, knowledge, catalog, appointments (+reminders/settings), billing (+LS webhook), admin (venta manual completa), products/quotes legacy, whatsapp webhook.
9. **Runtime IA**: `agent-runtime/` unificado (contexto verificado → decisión JSON estricta → acciones validadas → registro de uso). WhatsApp y prueba interna usan el mismo runtime.
10. **Acciones del agente**: `agent-action.service` ejecuta server-side con validación (catálogo, cotizaciones, citas con disponibilidad, handoff).
11. **Citas/disponibilidad**: `appointmentSettings` JSON + `checkSlotAvailability` (pasado/horario semanal/capacidad).
12. **Frontend para llamadas**: los moldes existen — `UsageCard` (barras + alertas 80/100), páginas de lista con filtros (AppointmentsPage), toggles de capacidades en Agentes.
13–15. Ver secciones 2–4.

## 2. Diseño propuesto

### A. Plan gating — `checkVoiceAllowance(tenantId)`

Nueva función en `voice.service` (molde de `checkAiAllowance`):

1. `Tenant.status !== ACTIVE` → bloqueado (`TENANT_INACTIVE`).
2. Suscripción CANCELLED/EXPIRED → bloqueado.
3. `plan.code !== 'ENTERPRISE'` **y** `voiceSettings.enabled !== true` (flag custom que el SUPER_ADMIN puede encender para clientes negociados) → bloqueado (`PLAN_REQUIRED`, "Disponible solo en Enterprise").
4. Minutos del mes agotados → bloqueado (`MINUTES_LIMIT`).

Fail-open **solo** ante error interno de lectura (consistente con billing); nunca ante plan incorrecto. Básico y Pro jamás pasan el paso 3.

### B. Minutos

```
voiceMonthlyMinutesLimit =
  Subscription.customVoiceMinutesLimit   (si el SUPER_ADMIN lo fijó)
  ?? maxUsers_efectivo × minutesPerUser  (default 180)
```

Cada llamada registra: tenant, agente, usuario iniciador (si aplica), conversación, ids de ElevenLabs, duración en **segundos** (se factura por minuto redondeado hacia arriba), costo estimado y fechas. El contador mensual se incrementa atómicamente al cierre de cada llamada (webhook post-call), patrón `bumpUsage`.

### C. Cost model configurable (env, no hardcode)

```
ELEVENLABS_API_KEY=                 # solo backend, jamás frontend
ELEVENLABS_AGENT_ID=
ELEVENLABS_WEBHOOK_SECRET=
ELEVENLABS_INCLUDED_MINUTES=275
ELEVENLABS_OVERAGE_COST_PER_MINUTE=0.08
ELEVENLABS_GEMINI_MONTHLY_COST=0.31
SENDWARY_ENTERPRISE_VOICE_BUDGET_PER_USER_USD=15
SENDWARY_DEFAULT_ENTERPRISE_VOICE_MINUTES_PER_USER=180
```

### D. Modelos (adaptados al patrón de la casa)

- **`VoiceUsageCounter`** (tabla nueva, espejo de `UsageCounter`): `tenantId`, `periodStart/End` (unique tenant+periodo), `usedSeconds`, `usedMinutes`, `callCount`, `estimatedCostUsd Decimal`. *No* se persisten `includedMinutes/extraMinutes` por fila: se calculan al leer (el límite puede cambiar a mitad de mes y persistirlo lo desincroniza).
- **`CallLog`** (tabla nueva): según lo especificado — `tenantId`, `agentId?`, `userId?`, `conversationId?`, `elevenLabsConversationId` (**unique = clave de idempotencia del webhook**), `elevenLabsCallId?`, `direction INBOUND|OUTBOUND`, `status STARTED|COMPLETED|FAILED|CANCELLED`, `startedAt`, `endedAt?`, `durationSeconds`, `estimatedCost Decimal`, `customerPhone`, `summary?`, `transcript?`, `metadata Json`.
- **`TenantVoiceSettings` → NO es tabla**: JSON `Tenant.voiceSettings` = `{ enabled, minutesPerUser, monthlyMinutesLimit?, businessPhoneNumbers[] }` (patrón `appointmentSettings`; editable por admin, cero tabla extra).
- **`Agent.allowVoiceCalls Boolean @default(false)`** en lugar de `allowedAgentIds` JSON: toggle por agente, consistente con los flags existentes y más simple en UI.
- **`Subscription.customVoiceMinutesLimit Int?`**: override negociado junto a sus hermanos custom.
- **`Conversation.channel` enum `WHATSAPP|VOICE` @default(WHATSAPP)**: las llamadas aparecen en el inbox sin tocar nada existente.

## 3. Migraciones necesarias

Todas **aditivas**, aplicables con `prisma db push` (política vigente por el drift documentado):
2 tablas (`VoiceUsageCounter`, `CallLog`), 2 enums (`CallDirection/CallStatus`, `ConversationChannel`), 4 columnas (`Agent.allowVoiceCalls`, `Subscription.customVoiceMinutesLimit`, `Tenant.voiceSettings`, `Conversation.channel`). Cero riesgo para datos existentes. Pendiente histórico: migración baseline antes de producción.

## 4. Endpoints necesarios

```
GET  /api/voice/usage                 → minutos usados/límite/%/costo estimado + allowance
GET  /api/voice/settings              → voiceSettings del tenant (OWNER/ADMIN)
PUT  /api/voice/settings              → activar/editar (validado contra el gating)
GET  /api/voice/calls                 → historial paginado (filtros: agente/estado/fechas)
GET  /api/voice/calls/:id             → detalle con transcript/summary
POST /api/voice/elevenlabs/webhook    → post-call (público; firma HMAC con
                                        ELEVENLABS_WEBHOOK_SECRET sobre req.rawBody —
                                        la captura de rawBody YA existe por LemonSqueezy)
POST /api/voice/session               → (fase V4) inicia/firma sesión de llamada,
                                        checkVoiceAllowance ANTES de tocar ElevenLabs
PUT  /api/admin/tenants/:id/subscription  += customVoiceMinutesLimit (extender existente)
```

## 5. Cambios frontend necesarios

- **Cuenta**: `VoiceUsageCard` junto al UsageCard actual — misma anatomía (barra, alertas 80% ámbar / 100% rojo, minutos usados/disponibles, costo estimado). Para Básico/Pro: estado bloqueado "Disponible solo en Enterprise" + CTA de mejora (reutiliza `openPlanCheckout`).
- **Agentes**: toggle "Permitir llamadas" (deshabilitado con tooltip si el plan no aplica) + badge 📞 en la card del agente.
- **Llamadas** (`/calls`, sidebar solo Enterprise): tabla (fecha, cliente, agente, duración, dirección, estado) + detalle con resumen/transcripción.
- **Inbox**: conversaciones `channel=VOICE` con ícono distintivo (fase V5).
- **Admin**: campo "Minutos de voz custom" en el editor de suscripción existente.

## 6. Fórmulas de minutos/costos

```
Presupuesto por usuario Enterprise:   US$15/mes
Costo marginal ElevenLabs:            US$0.08/min (excedente sobre 275 incluidos en Creator)
Costo fijo Gemini 2.5 Flash:          US$0.31/mes (por CUENTA ElevenLabs, no por usuario)

Minutos brutos:    15 / 0.08              = 187.5
Minutos netos:     (15 − 0.31) / 0.08     = 183.6
Cuota comercial:   180 min/usuario/mes    (margen de seguridad ~2%)

Límite tenant:     customVoiceMinutesLimit ?? (maxUsers_efectivo × 180)
Costo por llamada: ceil(durationSeconds / 60) × 0.08
Costo mensual:     Σ llamadas del periodo (visible para owner y admin)
```

Margen a favor: la fórmula presupuesta **todos** los minutos a precio de excedente, pero los primeros 275 min/mes de la cuenta ya están pagados por el plan Creator, y el costo de Gemini se diluye entre N usuarios Enterprise. La cuota de 180 es conservadora.

## 7. Plan de implementación en fases

| Fase | Contenido | Riesgo |
|---|---|---|
| **V1** | Rate limiting: fix del bucket global (`tenantId ?? IP`), `adminRateLimit`, límite estricto en webhooks de pago/voz | Bajo, independiente |
| **V2** | Fundación de voz: schema + `voice.service` (allowance/contadores/settings) + endpoints usage/settings/calls + admin + env vars. **Funciona sin ElevenLabs** (como billing funcionó sin LemonSqueezy) | Bajo |
| **V3** | Frontend: VoiceUsageCard, toggle en Agentes, página Llamadas, admin | Bajo |
| **V4** | Integración real: webhook post-call (idempotente), sesión con gating previo, telefonía (Twilio/SIP con ElevenLabs Conversational AI) | Medio |
| **V5** | Pulido: llamadas en inbox (`channel=VOICE`), resumen → conversación, alertas | Bajo |

Recomendación: **V1+V2+V3 en una sola fase de implementación**.

## 8. Riesgos

1. **Número telefónico**: ElevenLabs no provee números; se necesita **Twilio o SIP trunk** para PSTN (~US$0.013–0.022/min + ~US$1.15/mes por número, fuera del presupuesto de $15). Decisión abierta más importante antes de V4.
2. **Webhook sin verificar = minutos falsos/DoS de cuota**: firma HMAC obligatoria desde el día 1.
3. **Doble conteo**: idempotencia por `elevenLabsConversationId` unique (patrón `whatsappMessageId`).
4. **Llamada en curso al agotar minutos**: el gating es pre-llamada; una llamada activa puede exceder el límite unos minutos (aceptable; opcional: duración máxima por llamada en settings).
5. **Bucket "anonymous" compartido del rate limiter actual**: riesgo hoy, corregir primero.
6. **Latencia/costos del LLM de voz**: el loop de voz en tiempo real lo maneja ElevenLabs con Gemini Flash (presupuestado); el runtime OpenAI de Sendwary participa async (contexto previo y acciones post-llamada), no en el loop de audio.

## 9. Qué se puede hacer sin romper la app

Todo V1–V3: tablas nuevas no tocan flujos existentes; `channel` default WHATSAPP es invisible para el código actual; el gating de voz es un módulo que nadie llama aún; `/api/voice/*` es aditivo. En rate limiting, el único cambio de comportamiento es el `keyGenerator` (a `tenantId ?? IP`) y los buckets nuevos — WhatsApp conserva su límite propio de 300/min y el fail-open con Redis caído se mantiene.

## 10. Qué debe quedar para producción

1. Migración **baseline** de Prisma (pendiente histórico del drift).
2. Cuenta ElevenLabs Creator + agente conversacional + webhook secret + **decisión Twilio/SIP**.
3. **Redis obligatorio** en producción para rate limiting real (hoy fail-open).
4. Job mensual de cierre/rollover de contadores (voz y mensajes).
5. Política de retención/privacidad de grabaciones y transcripciones (datos personales del cliente final; considerar borrado a N días y aviso legal).
6. Alertas por email al 80% de minutos (depende del sistema de emails pendiente).
