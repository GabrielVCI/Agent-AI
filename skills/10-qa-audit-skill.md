# Sendwary QA & Audit Skill

## Purpose

Use this skill for full-system audits, QA readiness, pre-production checks, missing env vars, API keys, access checks, build checks, and release readiness.

## Audit Scope

Review:

* backend
* frontend
* database
* Prisma
* migrations
* seeds
* auth
* roles
* tenants
* admin
* billing
* LemonSqueezy
* WhatsApp
* OpenAI
* ElevenLabs
* Google OAuth
* password recovery
* dashboard
* conversations
* agents
* catalog
* appointments
* integrations
* support
* rate limiting
* error handling
* deployment
* logs
* responsive UX

## Output Format

Always provide:

1. Executive summary.
2. Module status:

   * Ready
   * Partial
   * Missing
   * Risk
3. Blocking issues for QA.
4. Blocking issues for production.
5. Env vars table.
6. API keys/tokens table.
7. Missing migrations.
8. Missing endpoints.
9. Missing screens.
10. Security risks.
11. Cost risks.
12. UX risks.
13. Likely bugs.
14. Local QA checklist.
15. Staging checklist.
16. Production checklist.
17. Exact next tasks/prompts.

## Env Vars to Check

Backend:

```txt
DATABASE_URL
DIRECT_URL
DATABASE_POOL_URL
REDIS_URL
SESSION_SECRET
FRONTEND_URL
BACKEND_URL
CORS_ORIGIN
PORT
NODE_ENV
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_CALLBACK_URL
META_WHATSAPP_TOKEN
META_VERIFY_TOKEN
META_GRAPH_API_VERSION
OPENAI_API_KEY
OPENAI_DEFAULT_MODEL
ELEVENLABS_API_KEY
ELEVENLABS_WEBHOOK_SECRET
AUDIO_TRANSCRIPTION_PROVIDER
LEMONSQUEEZY_API_KEY
LEMONSQUEEZY_STORE_ID
LEMONSQUEEZY_WEBHOOK_SECRET
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASS
SMTP_FROM
RATE_LIMIT_ENABLED
```

Frontend:

```txt
VITE_API_URL
VITE_LEMONSQUEEZY_ENABLED
```

## Build Checks

Run:

```bash
npm run build
```

or actual project scripts.

For backend, run:

```bash
npx tsc --noEmit
```

if no build script exists.

## Database Checks

Verify:

* migrations applied
* Prisma Client generated
* plans seeded
* admin user exists
* tenants have subscriptions
* usage counters work
* support tables exist if support enabled
* no reset required

## Auth Checks

Test:

* login
* wrong password
* logout confirmation
* register
* onboarding
* Google OAuth
* forgot/reset password
* session expiration
* role access
* tenant isolation

## Integration Checks

WhatsApp:

* webhook verify
* inbound message
* outbound reply
* per-tenant token
* agent assignment
* idempotency
* audio

LemonSqueezy:

* paywall
* overlay
* create-checkout
* webhook
* subscription activation
* subscriptionId visible

ElevenLabs:

* audio transcription
* calls Enterprise only
* minutes usage
* fallback

OpenAI:

* text runtime
* timeout
* fallback
* token usage

## Production Readiness

Must confirm:

* no hardcoded secrets
* no raw errors
* no demo mock data
* no local URLs in production config
* CORS production domain correct
* cookies production compatible
* rate limiting enabled
* webhooks configured
* DB pooling documented
* support playbooks created
