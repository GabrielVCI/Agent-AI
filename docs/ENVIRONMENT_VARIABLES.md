# Sendwary — Environment Variables

Catálogo completo. El backend valida al arrancar (`backend/src/config/env.ts`,
zod): si falta una obligatoria, el proceso no levanta y lista el error.

Convenciones de la columna **Entornos**: `L` local · `S` staging · `P` prod.
✅ = requerida en ese entorno · ○ = opcional · — = normalmente no se usa.

> Los valores de ejemplo son placeholders. NUNCA commitear valores reales.

## Núcleo (backend)

| Variable | Req. | Descripción | Dónde obtenerla | Ejemplo | L/S/P |
|---|---|---|---|---|---|
| `NODE_ENV` | ○ (default development) | Modo del proceso | — | `production` | ○/✅/✅ |
| `PORT` | ○ (default 3002) | Puerto HTTP | — | `3002` | ○/○/○ |
| `DATABASE_URL` | ✅ | PostgreSQL principal (en local: directa) | Proveedor de DB | `postgresql://user:pass@localhost:5432/sendwary` | ✅/✅/✅ |
| `DIRECT_URL` | ○ | Conexión DIRECTA solo para `prisma db push`/seed (obligatoria si el runtime va por PgBouncer) | Proveedor de DB (puerto 5432) | `postgresql://user:pass@db-host:5432/sendwary` | —/✅/✅ |
| `DATABASE_POOL_URL` | ○ | URL del pooler (PgBouncer transaction mode) usada por la app en runtime | Azure PgBouncer (6432) / servicio PgBouncer | `postgresql://user:pass@pooler:6432/sendwary` | —/✅/✅ |
| `DB_POOL_MAX` | ○ (default 10) | Conexiones máximas por proceso | — | `10` | ○/○/✅ |
| `DB_POOL_IDLE_MS` / `DB_POOL_CONNECT_TIMEOUT_MS` | ○ | Ajustes finos del pool | — | `30000` / `10000` | ○/○/○ |
| `REDIS_URL` | ○ (default localhost) | Cache de sesiones y rate limits (fallback a BD si cae) | Railway Redis / Upstash | `redis://default:pass@host:6379` | ○/✅/✅ |
| `SESSION_SECRET` | ✅ (≥32 chars) | Firma/derivaciones de sesión. ÚNICO por entorno | Generar: `openssl rand -hex 32` | `f3a1...64hex` | ✅/✅/✅ |
| `SESSION_COOKIE_NAME` | ○ (default sid) | Nombre de la cookie | — | `sid` | ○/○/○ |
| `SESSION_TTL_SECONDS` | ○ (default 7 días) | Vida de la sesión | — | `604800` | ○/○/○ |
| `COOKIE_DOMAIN` | ○ | Dominio raíz para cookie compartida app./api. (OMITIR en localhost) | Tu DNS | `.sendwary.com` | —/○/✅ |
| `ENCRYPTION_KEY` | ○ (64 hex) | AES-256-GCM para `Integration.encryptedConfig` (sin ella deriva de SESSION_SECRET — no ideal en prod) | `openssl rand -hex 32` | `9b2c...64hex` | ○/✅/✅ |
| `CORS_ORIGIN` | ○ (default localhost:5173) | Allowlist de orígenes, separados por coma | Tus dominios frontend | `https://app.sendwary.com` | ✅/✅/✅ |
| `BACKEND_PUBLIC_URL` | ○ (default localhost:3002) | URL pública del backend (webhooks, OAuth redirect). *(El doc genérico la llama BACKEND_URL; el nombre real es este)* | Railway | `https://api.sendwary.com` | ✅/✅/✅ |
| `FRONTEND_URL` | ○ (default localhost:5173) | URL del panel (redirects OAuth, links de reset) | Netlify | `https://app.sendwary.com` | ✅/✅/✅ |
| `APP_BASE_URL` | ○ | Base para URLs de archivos (PDFs) | = BACKEND_PUBLIC_URL | `https://api.sendwary.com` | ○/○/○ |
| `STORAGE_PATH` | ○ (default ../storage) | Carpeta de archivos generados | — | `../storage` | ○/○/○ |
| `LOG_LEVEL` | ○ (default info) | error/warn/info/debug | — | `info` | ○/○/○ |

## OpenAI (backend)

| Variable | Req. | Descripción | Dónde | Ejemplo | L/S/P |
|---|---|---|---|---|---|
| `OPENAI_API_KEY` | ○ (sin ella: fallback por reglas) | Key de OpenAI — **motor de los agentes** | platform.openai.com | `sk-proj-...` | ✅/✅/✅ |
| `OPENAI_DEFAULT_MODEL` | ○ (default gpt-4.1-mini) | Modelo por defecto de agentes | — | `gpt-4.1-mini` | ○/○/○ |
| `OPENAI_MODEL` / `OPENAI_FALLBACK_MODEL` | ○ | Compat/fallback | — | `gpt-4.1-mini` | ○/○/○ |
| `OPENAI_MAX_OUTPUT_TOKENS` | ○ (800) / `OPENAI_TEMPERATURE` (0.3) | Control de salida | — | `800` / `0.3` | ○/○/○ |
| `OPENAI_TRANSCRIPTION_MODEL` | ○ (whisper-1) | Solo si se permite fallback de audio | — | `whisper-1` | ○/○/○ |

## Meta WhatsApp (backend)

| Variable | Req. | Descripción | Dónde | Ejemplo | L/S/P |
|---|---|---|---|---|---|
| `META_WHATSAPP_TOKEN` | ○ (sin ella no hay envío) | Token permanente (system user) de la WABA | Meta Business → System Users | `EAAG...` | ○/✅/✅ |
| `META_VERIFY_TOKEN` | ○ | Token que TÚ inventas y pones igual en la app de Meta (verificación del webhook GET) | Lo defines tú | `sendwary-verify-2026` | ○/✅/✅ |
| `META_PHONE_NUMBER_ID` | ○ | phone_number_id de fallback (el ruteo real es por agente) | Meta → WhatsApp → API Setup | `123456789012345` | ○/○/○ |
| `META_GRAPH_API_VERSION` | ○ (default v20.0) | Versión de Graph API | — | `v20.0` | ○/○/○ |
| `ALLOW_GLOBAL_META_TOKEN_FALLBACK` | ○ (default `false`) | `true` SOLO dev/demo: responde con el token global si el tenant no tiene `WhatsAppIntegration` CONNECTED. En producción debe ser `false` (cada tenant usa su propio token; ver `docs/WHATSAPP_SETUP.md`) | Lo defines tú | `false` | ✅(true)/✅(false)/✅(false) |

## Onboarding de WhatsApp (multi-modo)

Controlan qué vías de conexión ofrece el panel. Estrategia completa:
`docs/WHATSAPP_ONBOARDING_STRATEGY.md`.

| Variable | Req. | Descripción | Ejemplo | L/S/P |
|---|---|---|---|---|
| `WHATSAPP_EASY_ONBOARDING_ENABLED` | ○ (default `true`) | Muestra la opción "Conexión guiada". Sin Embedded Signup/BSP opera como conexión asistida por el equipo (crea ticket) | `true` | ✅/✅/✅ |
| `WHATSAPP_EMBEDDED_SIGNUP_ENABLED` | ○ (default `false`) | Activa Embedded Signup de Meta. **Solo** con la app aprobada por Meta | `false` | ○/○/○ |
| `META_APP_ID` | ○ | App ID de Meta (Embedded Signup) | `123456789` | ○/○/○ |
| `META_APP_SECRET` | ○ | App Secret de Meta. **Nunca se expone al frontend ni en ningún endpoint** | `abc...` | ○/○/○ |
| `META_EMBEDDED_SIGNUP_CONFIG_ID` | ○ | `config_id` del flujo de Embedded Signup | `987654321` | ○/○/○ |
| `WHATSAPP_BSP_PROVIDER` | ○ (vacío = ninguno) | BSP activo: `TWILIO`\|`DIALOG360`\|`INFOBIP`\|`EIGHTX8`. Declarado; ninguno implementado aún | vacío | ○/○/○ |
| `WHATSAPP_DEMO_ENABLED` | ○ (default `false`) | Habilita el modo demo con número de Sendwary | `true` | ✅(true)/✅/○(false) |
| `WHATSAPP_DEMO_PHONE_NUMBER_ID` | ○ (obligatoria si demo) | phone_number_id del número demo de la plataforma | `123456789012345` | ○/○/○ |
| `WHATSAPP_DEMO_DISPLAY_NUMBER` | ○ | Número demo visible en el panel | `+1 809 555 0000` | ○/○/○ |
| `WHATSAPP_DEMO_MESSAGE_LIMIT` | ○ (default `50`) | Cuota de mensajes del modo demo por tenant | `50` | ○/○/○ |

> Desde la fase de configuración guiada de WhatsApp, las credenciales de Meta
> viven **por tenant** en el modelo `WhatsAppIntegration` (token cifrado con
> `ENCRYPTION_KEY`, AES-256-GCM). Las variables `META_*` quedan solo para el
> modo demo/legacy y el fallback controlado.

## Google OAuth (backend)

| Variable | Req. | Descripción | Dónde | Ejemplo | L/S/P |
|---|---|---|---|---|---|
| `GOOGLE_CLIENT_ID` | ○ (sin ella el botón avisa "no disponible") | OAuth Client ID | Google Cloud Console → Credentials | `xxxx.apps.googleusercontent.com` | ○/✅/✅ |
| `GOOGLE_CLIENT_SECRET` | ○ | OAuth Client Secret | Ídem | `GOCSPX-...` | ○/✅/✅ |
| `GOOGLE_REDIRECT_URI` (alias aceptado: `GOOGLE_CALLBACK_URL`) | ○ | Redirect del **backend**; si se omite se deriva de BACKEND_PUBLIC_URL | Debe registrarse EXACTA en Google Cloud | `https://api.sendwary.com/api/auth/google/callback` | ○/○/○ |

## ElevenLabs — audio y llamadas (backend)

| Variable | Req. | Descripción | Dónde | Ejemplo | L/S/P |
|---|---|---|---|---|---|
| `ELEVENLABS_API_KEY` | ○ (sin ella: sin STT ElevenLabs ni llamadas) | API key | elevenlabs.io → Profile | `xi-...` | ○/✅/✅ |
| `ELEVENLABS_WEBHOOK_SECRET` | ○ | HMAC del webhook post-call | ElevenLabs → Convai → Webhooks | `whsec-...` | ○/✅/✅ |
| `VOICE_TOOLS_TOKEN` | ○ | Token propio para las tools en vivo de llamadas | Lo defines tú (`openssl rand -hex 24`) | `a1b2...` | ○/✅/✅ |
| `AUDIO_TRANSCRIPTION_PROVIDER` | ○ (default elevenlabs) | `elevenlabs` \| `openai` \| `disabled` | — | `elevenlabs` | ○/○/○ |
| `ALLOW_OPENAI_AUDIO_FALLBACK` | ○ (default false) | Permite Whisper como respaldo | — | `false` | ○/○/○ |
| `ELEVENLABS_*` de costos (INCLUDED_MINUTES, OVERAGE_COST..., budgets) | ○ | Modelo de costos de minutos (defaults sanos) | — | — | ○/○/○ |

## LemonSqueezy (backend, futuro cercano)

| Variable | Req. | Descripción | Dónde | Ejemplo | L/S/P |
|---|---|---|---|---|---|
| `LEMONSQUEEZY_API_KEY` | ○ (sin ella: modo manual, checkout 503) | API key | app.lemonsqueezy.com → Settings → API | `lsq_...` | —/○/✅* |
| `LEMONSQUEEZY_STORE_ID` | ○ | ID de la tienda | Dashboard LS | `12345` | —/○/✅* |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | ○ | Firma del webhook | LS → Webhooks | `whsec...` | —/○/✅* |
| `LEMONSQUEEZY_BASIC_VARIANT_ID` / `_PRO_` / `_ENTERPRISE_` | ○ | Variant de cada plan | LS → Products | `111111` | —/○/✅* |
| `LEMONSQUEEZY_SUCCESS_URL` / `_CANCEL_URL` | ○ | Redirects post-checkout | Tu frontend | `https://app.sendwary.com/account?ok=1` | —/○/✅* |

\* ✅ solo cuando se active el cobro online (LOCKED #10–11: manual permitido).

## Soporte (backend)

| Variable | Req. | Descripción | Dónde | Ejemplo | L/S/P |
|---|---|---|---|---|---|
| `SUPPORT_AGENT_TOKEN` | ○ (≥32 chars; sin ella /api/support es solo-SUPER_ADMIN) | Token del asistente de soporte externo | `openssl rand -hex 32` | `64hex...` | —/○/○ |
| `SUPPORT_AGENT_SCOPES` | ○ (default read,triage,tickets:write) | Scopes del token | — | `support:read,support:triage,support:tickets:write` | ○/○/○ |

## Rate limiting (backend)

| Variable | Req. | Descripción | Ejemplo | L/S/P |
|---|---|---|---|---|
| `RATE_LIMIT_ENABLED` | ○ (default true) | Interruptor global | `true` | ○/○/○ |
| `RATE_LIMIT_GLOBAL_WINDOW_MS` / `RATE_LIMIT_GLOBAL_MAX` | ○ (15min/300) | Límite global | `900000` / `300` | ○/○/○ |
| `RATE_LIMIT_AUTH_MAX` (10) · `_REGISTER_MAX` (5) · `_AI_MAX` (30) · `_WEBHOOK_MAX` (1000) · `_ADMIN_MAX` (200) · `_ADMIN_SENSITIVE_MAX` (30) · `_BILLING_MAX` (20) · `_UPLOAD_MAX` (30) | ○ | Límites por familia (ventana 15min/1h según familia) | — | ○/○/○ |

## Email transaccional (Resend) — ✅ IMPLEMENTADO (`email.service.ts`)

> **Proveedor principal: Resend.** Usado por: bienvenida/verificación de cuenta,
> siguiente paso de implementación, recuperación de contraseña y recordatorio de
> pago de implementación. Todo el envío es **server-side**: la API key nunca sale
> del backend ni aparece en logs.
>
> **Sin proveedor configurado**: en development se loguea un preview seguro
> (destinatario, asunto, url) y el flujo NUNCA falla; en producción el envío
> devuelve error controlado (`EMAIL_PROVIDER_NOT_CONFIGURED`) y el registro
> igualmente conserva la cuenta creada.

| Variable | Req. | Descripción | Ejemplo |
|---|---|---|---|
| `EMAIL_PROVIDER` | ○ (default `resend`) | `resend` \| `smtp` \| `log` | `resend` |
| `RESEND_APIKEY` | ✅ en producción con `EMAIL_PROVIDER=resend` | API key de Resend. **El nombre es `RESEND_APIKEY`, NO `RESEND_API_KEY`** como en la doc de Resend — es la variable ya configurada en este proyecto | `re_...` |
| `EMAIL_FROM` | ○ (default `Sendwary <no-reply@sendwary.com>`) | Remitente; **el dominio debe estar verificado en Resend** | `Sendwary <no-reply@sendwary.com>` |
| `SUPPORT_EMAIL` | ○ (default `soporte@sendwary.com`) | Contacto en el footer de los correos | `info@sendwary.com` |
| `SENDWARY_LOGO_URL` | ○ (sin ella: wordmark tipográfico) | Logo público para los correos | `https://sendwary.com/logo.png` |

**SMTP (alternativa, solo con `EMAIL_PROVIDER=smtp`)**: `SMTP_HOST`, `SMTP_PORT`
(default 587), `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `SMTP_FROM` (compat: se
usa si no hay `EMAIL_FROM`).

> Los links de los correos usan `FRONTEND_URL` (`/verify-email?token=...`,
> `/reset-password?token=...`). **Nunca** definir `VITE_RESEND_APIKEY` ni enviar
> correos desde el frontend.

## Frontend (Netlify / Vite)

| Variable | Req. | Descripción | Ejemplo | L/S/P |
|---|---|---|---|---|
| `VITE_API_URL` | ○ (vacía = mismo origen/proxy dev) | URL del backend que consume el panel | `https://api.sendwary.com` | ○/✅/✅ |

---

## Mínimo para levantar cada entorno

- **Local**: `DATABASE_URL`, `SESSION_SECRET` (+ `OPENAI_API_KEY` para agentes reales).
- **Staging**: núcleo completo + `DIRECT_URL`/`DATABASE_POOL_URL` + OpenAI + Meta + Google (+ ElevenLabs para QA de voz) + `VITE_API_URL`.
- **Prod**: staging + `COOKIE_DOMAIN` + `ENCRYPTION_KEY` propia + email provider (cuando exista) + LemonSqueezy (cuando se active cobro online).
