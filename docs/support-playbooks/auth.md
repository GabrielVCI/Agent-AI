# Playbook: Autenticación (login/registro/sesiones)

- **Feature**: Login con email/contraseña, registro self-service, sesiones por cookie httpOnly (hash en tabla `Session` + cache Redis).
- **Tier por defecto**: TIER_1 · **Riesgo**: BAJO (solo lectura/guía)

## Descripción
El backend crea sesiones opacas (token aleatorio → sha256 en BD) y las entrega como cookie `sid` httpOnly. El frontend nunca ve tokens. Redis cachea la sesión; si Redis cae, se resuelve desde PostgreSQL.

## Errores comunes y síntomas
| Síntoma | Causa probable |
|---|---|
| "Credenciales inválidas" con contraseña correcta | Cuenta creada con Google (sin passwordHash) o usuario DISABLED |
| "Esta cuenta se creó con Google" | authProvider GOOGLE: debe usar el botón de Google o resetear contraseña |
| Sesión se pierde al recargar | Cookie no viaja: CORS_ORIGIN sin el dominio del frontend, o sameSite/secure mal en prod cross-domain |
| 429 al intentar login | Rate limit (10/15min por IP) |
| Registro dice "Ya existe una cuenta con ese correo" | Email registrado (quizá vía Google) |

## Diagnóstico
1. `GET /api/support/context/user/:userId` → status, authProvider, lastLoginAt.
2. Si es problema de cookie: confirmar FRONTEND_URL y CORS_ORIGIN incluyen el dominio exacto.
3. Revisar rate limit en logs: `[rate-limit] auth`.

## Pasos de solución
- Contraseña olvidada → flujo de recuperación (ver `password-recovery.md`).
- Cuenta Google sin contraseña → puede crear una vía "Olvidé mi contraseña".
- Usuario DISABLED → solo SUPER_ADMIN puede reactivarlo.
- 429 → esperar la ventana de 15 min; si es legítimo masivo, evaluar RATE_LIMIT_AUTH_MAX.

## Automatizable por el agente (Tier 1)
- Explicar el flujo correcto (Google vs local) según authProvider del usuario.
- Guiar al flujo de recuperación de contraseña.
- Detectar usuario DISABLED y escalar.

## Requiere humano
- Reactivar usuarios DISABLED, cambiar roles, borrar cuentas.

## Logs / env / endpoints
- Logs: `[PASSWORD RESET]`, `[rate-limit] auth`, errores de login no se loguean con detalle (respuesta genérica).
- Env: `SESSION_SECRET`, `SESSION_COOKIE_NAME`, `SESSION_TTL_SECONDS`, `COOKIE_DOMAIN`, `CORS_ORIGIN`, `RATE_LIMIT_AUTH_MAX`.
- Endpoints: `POST /api/auth/login`, `POST /api/auth/register`, `GET /api/auth/me`, `POST /api/auth/logout`, `GET /api/auth/sessions`.

## Escalamiento
Usuario bloqueado sin causa clara o sospecha de compromiso de cuenta → Tier 2 (ticket con userId + timestamps). Muchos usuarios sin poder entrar a la vez → Tier 3 (posible caída de Redis/DB o despliegue roto).
