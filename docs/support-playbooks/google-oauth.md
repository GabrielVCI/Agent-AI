# Playbook: Google OAuth

- **Feature**: Login/registro con Google (flujo manual server-side, sin passport).
- **Tier por defecto**: TIER_1 (config) / TIER_2 (falla intermitente) · **Riesgo**: BAJO

## Descripción
`GET /api/auth/google` redirige al consentimiento con `state` anti-CSRF (cookie 10 min); el callback intercambia el código server-side y crea la sesión httpOnly. Usuarios nuevos quedan sin tenant → onboarding.

## Errores comunes y síntomas
| Síntoma | Causa |
|---|---|
| Botón devuelve al login con "no está disponible todavía" | Faltan GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET |
| Google muestra `redirect_uri_mismatch` | El redirect URI registrado en Google Cloud no coincide EXACTO con `BACKEND_PUBLIC_URL + /api/auth/google/callback` (o GOOGLE_REDIRECT_URI) |
| "No se pudo validar la solicitud de Google" | Cookie de state no viajó (dominio/https) o tardó >10 min |
| Vuelve autenticado pero cae en onboarding | Normal: usuario nuevo sin empresa |
| "Cancelaste el inicio de sesión" | El usuario canceló en Google (no es error) |

## Diagnóstico
1. `GET /api/support/health` → `googleOAuth.configured`.
2. Verificar redirect URI de Google Cloud contra BACKEND_PUBLIC_URL actual.
3. Cross-domain en prod: cookie state requiere https + sameSite lax (ya configurado) y que el callback sea el MISMO host que inició.

## Pasos de solución
- Config faltante → seguir `backend/docs/google-oauth.md` (paso a paso exacto).
- redirect_uri_mismatch → registrar la URI del BACKEND (no del frontend).
- En prod Netlify+Railway con dominios distintos: usar subdominios del mismo dominio raíz + `COOKIE_DOMAIN`.

## Automatizable por el agente (Tier 1)
- Detectar configured:false y entregar el checklist de configuración.
- Explicar redirect_uri_mismatch con la URI exacta esperada (sin exponer secrets).

## Requiere humano
- Crear/editar credenciales en Google Cloud; cambiar envs de producción.

## Logs / env / endpoints
- Env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`/`GOOGLE_CALLBACK_URL`, `BACKEND_PUBLIC_URL`, `FRONTEND_URL`.
- Endpoints: `GET /api/auth/google`, `GET /api/auth/google/callback`.

## Escalamiento
Config correcta pero Google devuelve 4xx/5xx en el intercambio → Tier 2 con el mensaje de error redactado. Fallo masivo (todos los logins Google) → Tier 3.
