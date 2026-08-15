# Sendwary Security & Error Handling Skill

## Purpose

Use this skill for authentication security, authorization, central error handling, user-friendly error messages, rate limiting, sessions, CORS, cookies, secrets, and webhook signatures.

## Security Rules

* No frontend JWT.
* No localStorage tokens.
* Use httpOnly cookies.
* Protect all admin routes.
* Protect all tenant routes.
* Enforce tenant isolation.
* Never expose secrets.
* Never log secrets.
* Validate inputs.
* Rate limit public and expensive endpoints.
* Validate webhook signatures where possible.

## Error Handling

Backend should use centralized error middleware.

Create or use:

```txt
errors/AppError.ts
errors/error-codes.ts
errors/error-messages.ts
errors/error.middleware.ts
errors/async-handler.ts
```

## User-Friendly Messages

Never show raw:

```txt
Unauthorized
401
403
404
500
502
503
504
Request failed with status code 500
```

Use:

```txt
Usuario o clave incorrecta.
Tu sesión expiró. Inicia sesión nuevamente.
No tienes permiso para realizar esta acción.
No encontramos la información solicitada.
No pudimos conectar con la base de datos. Intenta nuevamente.
No pudimos comunicarnos con el servicio externo.
No pudimos conectar con WhatsApp. Revisa la configuración.
El agente no pudo generar una respuesta en este momento.
No pudimos procesar el audio o la llamada en este momento.
Demasiadas solicitudes. Intenta nuevamente en unos minutos.
Ocurrió un error inesperado. Intenta nuevamente.
```

## Error Codes

Use codes like:

```txt
INVALID_CREDENTIALS
UNAUTHENTICATED
SESSION_EXPIRED
FORBIDDEN
TENANT_REQUIRED
RESOURCE_NOT_FOUND
VALIDATION_ERROR
DATABASE_CONNECTION_ERROR
DATABASE_QUERY_ERROR
EXTERNAL_SERVICE_ERROR
WHATSAPP_CONNECTION_ERROR
OPENAI_SERVICE_ERROR
ELEVENLABS_SERVICE_ERROR
RATE_LIMIT_EXCEEDED
BILLING_LIMIT_REACHED
UNKNOWN_ERROR
```

## Frontend Error Normalization

Create or use:

* `normalizeApiError`
* `getUserFriendlyErrorMessage`
* Axios/fetch interceptor
* Toast system

UI must show friendly messages only.

## Rate Limiting

Use `express-rate-limit` or existing equivalent.

Suggested limits:

* Global: 300 requests / 15 min
* Login: 10 / 15 min
* Register: 5 / hour
* AI test: 30 / 15 min
* Admin: 200 / 15 min
* Sensitive admin actions: 30 / 15 min
* Webhooks: high separate limits
* Upload/documents: 30 / 15 min
* Billing checkout: 20 / 15 min

Do not block CORS preflight OPTIONS.

Use Redis store in production if available.

## Cookies

Production cookies:

* httpOnly
* secure true
* sameSite none if cross-site Netlify/Railway
* appropriate domain handling

Local cookies:

* secure false
* sameSite lax or dev-compatible

## Webhook Security

Validate signatures:

* LemonSqueezy webhook secret
* ElevenLabs webhook secret if available
* Meta signature if implemented

If signature missing and required, reject.

## Logs

Log internally:

* error code
* traceId
* route
* userId
* tenantId
* stack in dev

Do not log:

* password
* cookies
* tokens
* API keys
* raw authorization headers

## Password Recovery

Secure reset flow:

* token hash stored, never plaintext
* expiration
* usedAt
* generic response even if email not found
* rate limit
* strong password validation

## Testing

Test:

* wrong password
* expired session
* unauthorized role
* cross-tenant access
* validation error
* rate limit
* bad webhook signature
* frontend connection error
* password reset
* production cookie settings
