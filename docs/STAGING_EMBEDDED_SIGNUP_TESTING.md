# Staging: probar WhatsApp Embedded Signup en una URL pública

Guía de despliegue y prueba del flujo de Meta en un ambiente público, antes de
producción. Complementa `WHATSAPP_EMBEDDED_SIGNUP_E2E.md` (flujo técnico).

---

## 1. Por qué no basta con local

Embedded Signup **no se puede validar completo en `localhost`**:

| Requisito de Meta | Por qué falla en local |
|---|---|
| Dominio en *Allowed Domains* del JS SDK | Meta no acepta `localhost` en la lista de dominios permitidos de una app en producción |
| HTTPS | El SDK exige origen seguro; `http://localhost` solo se tolera en modo desarrollo |
| Webhook público | Meta hace `GET` de verificación y `POST` de mensajes contra una URL alcanzable desde internet |
| Redirect/callback | El popup de OAuth valida el origen que lo abrió |

Lo que **sí** se puede probar en local: la UI con el flag apagado (fallback),
la validación de payload del backend, la configuración manual y el modo demo.

---

## 2. URLs

| | Frontend | Backend |
|---|---|---|
| **Producción** | `https://app.sendwary.com` | `https://api.sendwary.com` |
| **Staging** | `https://staging.sendwary.com` *(o URL de Netlify)* | `https://api-staging.sendwary.com` *(o URL de Railway)* |

> **Decisión importante — cookies.** Si frontend y API comparten el dominio raíz
> (`staging.sendwary.com` + `api-staging.sendwary.com`), son **same-site** y la
> configuración por defecto funciona. Si usas las URLs de **Netlify + Railway**
> (`*.netlify.app` + `*.up.railway.app`) son **cross-site**: sin
> `COOKIE_SAMESITE=none` el navegador nunca envía la cookie y **nadie puede
> iniciar sesión**. Ver §3.

---

## 3. Variables de Railway (backend staging)

```bash
APP_ENV=staging
NODE_ENV=production          # build optimizado + cookies Secure

FRONTEND_URL=https://staging.sendwary.com
APP_BASE_URL=https://api-staging.sendwary.com
BACKEND_PUBLIC_URL=https://api-staging.sendwary.com
CORS_ORIGIN=https://staging.sendwary.com

# ── Cookies ──
# Subdominios del mismo dominio raíz → no hace falta tocar nada:
COOKIE_SAMESITE=auto
COOKIE_DOMAIN=.sendwary.com
#
# Netlify + Railway (dominios distintos) → OBLIGATORIO:
# COOKIE_SAMESITE=none
# COOKIE_SECURE=true
# (dejar COOKIE_DOMAIN vacío: los dominios no coinciden)

# ── Meta ──
META_APP_ID=
META_APP_SECRET=
META_GRAPH_API_VERSION=v21.0
META_EMBEDDED_SIGNUP_CONFIG_ID=
META_EMBEDDED_SIGNUP_ENABLED=false   # encender solo cuando §5 esté listo
META_WEBHOOK_VERIFY_TOKEN=
META_WEBHOOK_APP_SECRET=
META_BUSINESS_ID=
META_SYSTEM_USER_ACCESS_TOKEN=
ALLOW_GLOBAL_META_TOKEN_FALLBACK=false

# ── Infra ──
DATABASE_URL=              # base de staging SEPARADA de producción
REDIS_URL=
SESSION_SECRET=            # distinto al de producción
ENCRYPTION_KEY=            # 64 hex; distinto al de producción
```

> `CORS_ORIGIN` debe ser el origen **exacto**, sin barra final. Acepta varios
> separados por coma.

> `ENCRYPTION_KEY` de staging **debe ser distinta** a la de producción: cifra
> los tokens de WhatsApp. Si compartes la clave, un dump de staging permite
> descifrar tokens de clientes reales.

**Validación de arranque**: si `META_EMBEDDED_SIGNUP_ENABLED=true` y falta
`META_APP_ID`, `META_APP_SECRET` o `META_EMBEDDED_SIGNUP_CONFIG_ID`, el backend
lo registra como error en el log y el flujo queda deshabilitado (la UI muestra
el fallback) en vez de fallar cuando un cliente pulsa el botón.
Si `COOKIE_SAMESITE=none` sin `Secure`, el proceso **no arranca**: sería una
sesión imposible de establecer.

---

## 4. Variables de Netlify (frontend staging)

Site settings → Environment variables, con scope **branch-deploy** (rama de
staging) para no tocar producción:

```bash
VITE_API_URL=https://api-staging.sendwary.com
VITE_META_APP_ID=
VITE_META_GRAPH_API_VERSION=v21.0
VITE_META_EMBEDDED_SIGNUP_CONFIG_ID=
VITE_META_EMBEDDED_SIGNUP_ENABLED=false
```

**Todo lo `VITE_*` termina en el bundle público.** Nunca poner ahí
`META_APP_SECRET`, `META_SYSTEM_USER_ACCESS_TOKEN`, `META_WEBHOOK_APP_SECRET`,
`RESEND_APIKEY` ni ningún token de acceso.

`frontend/netlify.toml` ya define base, comando, `publish` y el redirect SPA
(sin él, recargar `/canales/whatsapp` da 404).

---

## 5. Qué configurar en Meta

En **Meta Developers → tu app**:

| Sitio | Valor |
|---|---|
| App Domains *(Configuración → Básica)* | `sendwary.com`, `staging.sendwary.com` (o el host de Netlify) |
| Valid OAuth Redirect URIs *(Facebook Login → Configuración)* | `https://staging.sendwary.com/`, `https://app.sendwary.com/` |
| Allowed Domains for the JS SDK | `https://staging.sendwary.com`, `https://app.sendwary.com` |
| Webhook Callback URL *(WhatsApp → Configuración)* | `https://api-staging.sendwary.com/api/whatsapp/meta` |
| Verify Token | el mismo valor de `META_WEBHOOK_VERIFY_TOKEN` |
| Campo suscrito | `messages` |

**Configuration ID**: Facebook Login for Business → Configuraciones → crear una
de tipo *WhatsApp Embedded Signup*. Ese ID va en
`META_EMBEDDED_SIGNUP_CONFIG_ID` y `VITE_META_EMBEDDED_SIGNUP_CONFIG_ID`.

Sin App Review, solo completan el flujo los usuarios con **rol en la app**
(administrador, desarrollador o probador). Suficiente para validar staging.

---

## 6. Probar con la feature APAGADA

`META_EMBEDDED_SIGNUP_ENABLED=false` + `VITE_META_EMBEDDED_SIGNUP_ENABLED=false`

1. Login en staging → la sesión persiste al recargar (valida cookies + CORS).
2. Canales → WhatsApp carga sin errores en consola.
3. Se ve el fallback: *"La conexión automática está en preparación…"*.
4. **Solicitar asistencia** y **Ya tengo WhatsApp Cloud API** funcionan.
5. El SDK de Facebook **no** se carga (verificar en Network: no hay `sdk.js`).
6. `GET https://api-staging.sendwary.com/api/health` responde OK.

## 7. Probar con la feature ENCENDIDA

Poner ambos flags en `true` y redesplegar (Vite inyecta las `VITE_*` **en build**:
cambiar la variable no basta, hay que reconstruir).

1. Canales → WhatsApp muestra **Conectar con Meta**.
2. Al pulsarlo se carga `connect.facebook.net/en_US/sdk.js` y abre el popup.
3. Completar el flujo con una cuenta con rol en la app.
4. El backend recibe el `code` y responde con `wabaId` + `phoneNumberId`.
5. Si la WABA tiene varios números, aparece la lista de selección.
6. Asignar el número a un agente (la activación es opt-in).
7. `GET /api/integrations/whatsapp/health` → `connected: true`.

### Verificación del webhook

Meta llama primero al `GET`. Se puede simular:

```bash
curl "https://api-staging.sendwary.com/api/whatsapp/meta?hub.mode=subscribe&hub.verify_token=TU_TOKEN&hub.challenge=12345"
# Debe devolver exactamente: 12345
```

---

## 8. Logs

- **Railway** → Deployments → Logs. Filtrar por `[EMBEDDED SIGNUP]`,
  `[WHATSAPP INTEGRATION]`, `[AUTH`.
- **Netlify** → Deploys → Deploy log (errores de build/variables).
- **Navegador** → Consola y Network. Para cookies: DevTools → Application →
  Cookies, y la pestaña Network → Response Headers → `Set-Cookie`.

Ningún log imprime tokens: solo `tokenLastFour` y confirmaciones.

---

## 9. Errores comunes

| Síntoma | Causa | Solución |
|---|---|---|
| `URL blocked: This redirect failed` | El origen no está en *Valid OAuth Redirect URIs* | Añadirlo en Facebook Login → Configuración |
| `Can't load URL: domain not included` | Falta en *App Domains* / *Allowed Domains* | Añadir el host exacto con `https://` |
| CORS: *No 'Access-Control-Allow-Origin'* | `CORS_ORIGIN` no coincide | Origen exacto, sin barra final; redesplegar |
| Login OK pero al recargar pide login otra vez | Cookie cross-site bloqueada | `COOKIE_SAMESITE=none` + `COOKIE_SECURE=true` |
| Cookie no aparece en DevTools | `Secure` sobre HTTP, o `COOKIE_DOMAIN` que no corresponde | Usar HTTPS; vaciar `COOKIE_DOMAIN` si los dominios difieren |
| Logout no cierra sesión | Atributos de `clearCookie` distintos a los del `set` | Ya corregido: ambos usan `sessionCookieAttrs()` |
| Webhook no verifica | `hub.verify_token` ≠ `META_WEBHOOK_VERIFY_TOKEN` | Igualar exacto; revisar que la URL sea `/api/whatsapp/meta` |
| Botón no aparece con el flag en true | Vite inyecta en **build** | Redesplegar el frontend tras cambiar la variable |
| *"La conexión automática no está disponible"* | Falta `config_id` o `META_APP_ID` | Revisar el log de arranque del backend |
| Meta rechaza el onboarding | Permisos sin *Advanced Access* | Bloqueador de plataforma: App Review pendiente |
| 404 al recargar una ruta interna | Falta el redirect SPA | Ya cubierto en `frontend/netlify.toml` |

---

## 10. Checklist final

**Infra**
- [ ] Base de datos de staging **separada** de producción
- [ ] `SESSION_SECRET` y `ENCRYPTION_KEY` distintos a producción
- [ ] Backend responde en `/api/health`
- [ ] Frontend carga y `VITE_API_URL` apunta al backend de staging

**Auth**
- [ ] Login funciona y la sesión persiste al recargar
- [ ] Logout borra la cookie de verdad
- [ ] `CORS_ORIGIN` coincide exacto con el origen del frontend
- [ ] Si es cross-site: `COOKIE_SAMESITE=none` + `COOKIE_SECURE=true`

**Meta**
- [ ] App Domains, OAuth Redirect URIs y Allowed Domains del SDK configurados
- [ ] Webhook verificado (`GET` devuelve el challenge)
- [ ] Campo `messages` suscrito
- [ ] Configuration ID creado y puesto en ambas variables

**Feature**
- [ ] Con el flag apagado: fallback visible, sin errores
- [ ] Con el flag encendido: el popup de Meta abre
- [ ] Health check refleja el estado real
- [ ] `ALLOW_GLOBAL_META_TOKEN_FALLBACK=false`

**Seguridad**
- [ ] Ningún secreto en variables `VITE_*` (revisar el bundle: `grep -r "APP_SECRET" dist/`)
- [ ] Local y producción siguen funcionando
