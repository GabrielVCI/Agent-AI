# Google OAuth — configuración pendiente

El código del flujo (backend manual, sin passport) está completo y correcto:
`GET /api/auth/google` → consentimiento → `GET /api/auth/google/callback` →
intercambio server-side → cookie de sesión httpOnly → redirect al frontend.
Incluye protección CSRF por `state`, rate limit y mensaje amable si no está
configurado. **Lo único que falta son las credenciales.**

## 1. Google Cloud Console

[console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials →
**Create Credentials → OAuth client ID** (tipo *Web application*). Antes configura la
*OAuth consent screen* (External, dominio de Sendwary, scopes `openid email profile`).

**Authorized JavaScript origins** (frontend):
- Dev: `http://localhost:5173`
- Prod: `https://<tu-dominio-netlify>` (ej: `https://app.sendwary.com`)

**Authorized redirect URIs** (¡es la URL del BACKEND, no del frontend!):
- Dev: `http://localhost:3002/api/auth/google/callback`
- Prod: `https://<tu-backend-railway>/api/auth/google/callback`

## 2. Variables en backend/.env (dev) y Railway (prod)

```env
GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
# Opcional: si no se define, se deriva de BACKEND_PUBLIC_URL + /api/auth/google/callback
GOOGLE_REDIRECT_URI=http://localhost:3002/api/auth/google/callback

# Deben apuntar correctamente en cada entorno:
BACKEND_PUBLIC_URL=http://localhost:3002        # prod: https://<backend-railway>
FRONTEND_URL=http://localhost:5173              # prod: https://<frontend-netlify>
```

En producción además:
- `CORS_ORIGIN` debe incluir el dominio del frontend (cookies con credentials).
- Si frontend y backend quedan en **dominios distintos** (Netlify + Railway), la
  cookie de sesión necesita `sameSite: "none"` + `secure: true` en vez del
  `strict` actual, o servir ambos bajo el mismo dominio raíz con
  `COOKIE_DOMAIN` (recomendado: api.sendwary.com + app.sendwary.com con
  `COOKIE_DOMAIN=.sendwary.com`).

## 3. Verificación

1. Reinicia el backend tras poner las variables.
2. `http://localhost:5173/login` → "Continuar con Google".
3. Sin variables, el botón redirige de vuelta al login con el mensaje
   "El inicio de sesión con Google no está disponible todavía" (comportamiento actual).
4. Con variables: consentimiento de Google → vuelve autenticado; usuarios nuevos
   sin empresa caen en /onboarding automáticamente.
