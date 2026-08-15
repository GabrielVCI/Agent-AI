# Sendwary Infrastructure & Deployment Skill

## Purpose

Use this skill for Railway, Netlify, PostgreSQL, PgBouncer, environment variables, production readiness, health checks, migrations, pooling, and deployment docs.

## Deployment Targets

* Frontend: Netlify
* Backend: Railway
* Database: Azure PostgreSQL or compatible PostgreSQL
* Optional Redis for rate limiting/session/cache

## Backend Requirements

* Must listen on `process.env.PORT`.
* Must bind to `0.0.0.0` if needed.
* Must have health endpoint.
* Must support production CORS.
* Must trust proxy when behind Railway/proxy:

```ts
app.set("trust proxy", 1)
```

## Frontend Requirements

* Netlify build command must be correct.
* Public env vars must use `VITE_`.
* Do not expose backend secrets in frontend.
* SPA redirects must be configured.

Example Netlify redirects:

```txt
/* /index.html 200
```

## Database

Use PostgreSQL.

For Prisma:

* `DATABASE_URL` for runtime.
* `DIRECT_URL` for migrations if using pooled URL.
* `DATABASE_POOL_URL` optional depending on provider.

If using PgBouncer:

* Use direct connection for migrations.
* Use pooled connection for runtime.
* Avoid prepared statement issues according to provider docs.
* Do not hardcode credentials.

## Env Vars

Maintain docs for:

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
OPENAI_API_KEY
ELEVENLABS_API_KEY
META_WHATSAPP_TOKEN
META_VERIFY_TOKEN
META_GRAPH_API_VERSION
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_CALLBACK_URL
LEMONSQUEEZY_API_KEY
LEMONSQUEEZY_WEBHOOK_SECRET
SMTP_*
RATE_LIMIT_*
```

## Migrations

Local:

```bash
npx prisma migrate dev
```

Production:

```bash
npx prisma migrate deploy
```

Never use reset in production.

## Health Checks

Health endpoint should check:

* API alive
* DB reachable
* Redis optional
* config present true/false, not secret values

Do not expose secrets.

## Logging

Logs must include:

* request ID
* route
* status
* userId if available
* tenantId if available
* error code

Never log:

* tokens
* passwords
* cookies
* API keys

## Production Readiness

Before deployment:

* build frontend
* build backend
* run migrations
* seed plans
* configure env vars
* configure CORS
* configure cookies
* configure OAuth redirect URLs
* configure Meta webhook
* configure LemonSqueezy webhook
* configure ElevenLabs webhook
* test paywall
* test WhatsApp
* test auth
* test billing
* test admin

## Railway

Backend must support:

* PORT env
* DATABASE_URL
* migration deploy
* logging
* healthcheck

## Netlify

Frontend must support:

* VITE_API_URL
* redirects
* build command
* production domain

## Testing

Test local, staging, and production separately.

Document differences between:

* local URLs
* ngrok URLs
* Railway URLs
* Netlify URLs
* production custom domains
