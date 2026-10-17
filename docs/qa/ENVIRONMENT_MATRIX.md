# ENVIRONMENT_MATRIX — Qué se puede probar en cada entorno

> **Estado real hoy (2026-09-10): solo existe LOCAL.** No hay entorno DEV, ni QA,
> ni STAGING desplegado; el despliegue a producción está configurado pero es el
> bloqueador **B4** de `docs/ROADMAP_TO_QA.md`.
>
> Por eso este documento desarrolla **LOCAL en detalle** y deja los demás como
> definición de intención, para rellenar cuando existan. **No dar por bueno nada
> de las secciones 3–6: describen entornos que todavía no están montados.**

---

## 1. Panorama

| Entorno | ¿Existe? | Base de datos | Quién lo usa |
|---|---|---|---|
| **LOCAL** | ✅ Sí | PostgreSQL 18 en `localhost:5432` | Desarrollo y QA local |
| **DEV** | ❌ No montado | — | — |
| **QA** | ❌ No montado | — | — |
| **STAGING** | ❌ No montado (bloqueador B4) | — | — |
| **PRODUCTION** | ⚠️ Configurado, sin desplegar | Railway + PgBouncer | — |

---

## 2. LOCAL — el único entorno real

### 2.1 Composición

| Pieza | Cómo se levanta | Puerto |
|---|---|---|
| Backend | `cd backend && npm run dev` | 3002 |
| Panel | `cd frontend && npm run dev` | 5173 |
| Landing | `cd webpage && npm run dev` | 5173 (si el panel no está arriba) |
| PostgreSQL 18 | Servicio de Windows | 5432 |
| Redis | Opcional | 6379 |

Binarios de PostgreSQL en `C:\Program Files\PostgreSQL\18\bin`.
⚠️ En el PATH hay un `psql`/`pg_dump` **10.7** de BioTime que es incompatible con
el servidor 18: usar siempre la ruta completa.

### 2.2 Bases de datos

| Base | Uso | Quién escribe | Se puede borrar |
|---|---|---|---|
| `ferreteria_ai_agent` | Desarrollo | La app en `npm run dev` | ❌ **Nunca** |
| `ferreteria_ai_agent_test` | Pruebas | Las suites | ✅ Sí, se recrea con `npm run test:db:setup` |
| `ferreteria_ai_agent_shadow` | Prisma la vacía sola | Prisma | ✅ Es desechable por diseño |

La guarda `tests/setup/use-test-db.ts` impide que una suite escriba fuera de la
base cuyo nombre termina en `_test`.

### 2.3 Configuración

| Archivo | Versionado | Para qué |
|---|---|---|
| `backend/.env` | ❌ No | Desarrollo |
| `backend/.env.example` | ❌ **No** (lo ignora `backend/.gitignore`) | Plantilla de 87 variables |
| `backend/.env.test` | ❌ No | Pruebas |
| `backend/.env.test.example` | ✅ Sí | Plantilla de pruebas |
| `frontend/.env` / `.env.example` | example ✅ | `VITE_*` |

⚠️ **Riesgo abierto:** `backend/.env.example` existe solo en la máquina local. Si
se pierde, se pierde el contrato de configuración completo.

### 2.4 Qué se puede probar en LOCAL

#### ✅ Completamente

- Lógica de negocio pura → `npm run test:unit` (56 casos)
- Persistencia, transacciones y aislamiento por empresa → `npm run test:db` (112)
- Autenticación, cookies, roles y SUPER_ADMIN por HTTP → `npm run test:http` (38)
- Tipos y compilación → `npm run typecheck`, `npx tsc -b`
- Lint de los tres paquetes
- Builds de producción de front → `npm run build`
- Reconstrucción del esquema desde cero → `npm run test:db:setup`
- Interfaz, a mano, en el navegador

#### ⚠️ Parcialmente, o solo simulable

| Área | Qué sí | Qué no |
|---|---|---|
| **Email** | Con `EMAIL_PROVIDER=log` se ve el contenido en consola | Entrega real |
| **Agentes IA** | Estructura y permisos | Respuestas reales (necesita `OPENAI_API_KEY` con saldo) |
| **WhatsApp** | Reglas internas de envío | Envío y recepción reales |
| **Billing** | `checkPlanLimit` | Checkout y webhooks firmados de LemonSqueezy |
| **Cookies** | `HttpOnly`, `Path`, `SameSite=lax` | `SameSite=None` + `Secure` entre dominios distintos |
| **Rate limiting** | — | Está **desactivado** en pruebas (`NODE_ENV=test` lo salta) |

#### ❌ No verificable en LOCAL

| Área | Motivo | Estado a usar |
|---|---|---|
| Embedded Signup de Meta | App aprobada + HTTPS público + SDK de Facebook | `NO VERIFICABLE EN LOCAL` |
| Recepción real de webhooks (Meta, LemonSqueezy) | URL pública alcanzable | `PENDIENTE POR AMBIENTE PÚBLICO` |
| Google OAuth | Faltan `GOOGLE_CLIENT_ID` / `SECRET` (bloqueador B1) | `PENDIENTE POR CREDENCIALES EXTERNAS` |
| Llamadas de voz (ElevenLabs) | Falta `ELEVENLABS_API_KEY` (B3) | `PENDIENTE POR CREDENCIALES EXTERNAS` |
| Comportamiento con PgBouncer | En local la conexión es directa | `NO VERIFICABLE EN LOCAL` |
| Cookies entre dominios | Local es un solo host | `NO VERIFICABLE EN LOCAL` |
| Healthcheck de Railway como puerta de despliegue | Requiere la plataforma | `NO VERIFICABLE EN LOCAL` — pero ver el aviso de §6 sobre la ruta configurada |

### 2.5 Variables ausentes en local

El `.env` local declara **24** de las **87** variables de la plantilla. Familias
completas sin configurar: `RATE_LIMIT_*`, `LEMONSQUEEZY_*`, `ELEVENLABS_*`,
`GOOGLE_CLIENT_*`, `SMTP_*`, `META_APP_*`, `META_EMBEDDED_SIGNUP_*`,
`ENCRYPTION_KEY`, `VOICE_TOOLS_TOKEN`, `DIRECT_URL`.

Consecuencia práctica: sin `ENCRYPTION_KEY` no se prueba la integración de
WhatsApp por empresa (el token se guarda cifrado).

`backend/.env.test` sí cubre las variables necesarias, con **valores falsos
deterministas**: si una prueba llegara de verdad a un servicio externo, eso es un
bug de la prueba.

### 2.6 Límites que hay que declarar en el reporte

- **No hay CI**: no existe `.github/`. Nada se verifica solo al hacer push.
- **No se mide cobertura**: no hay c8 ni nyc.
- **El frontend no tiene pruebas**: todo lo funcional del panel es manual.
- **Windows**: las pruebas se ejecutan en Windows con `cross-env`. No se ha
  verificado en Linux, que es lo que usará el CI cuando exista.

---

## 3. DEV — no montado

Destino previsto: primera instalación desplegada, con datos de juguete.

Cuando exista, aquí debe documentarse: URL, base de datos, quién despliega, qué
variables cambian respecto a LOCAL, y qué se puede probar que en LOCAL no
(cookies entre dominios, PgBouncer, webhooks entrantes reales).

**Requisito de entrada:** el checklist de `QA_RULES.md` §7.

---

## 4. QA — no montado

Destino previsto: entorno estable para pasadas completas de regresión, incluidas
las manuales, con datos representativos.

---

## 5. STAGING — no montado (bloqueador B4)

Destino previsto: Netlify + Railway + PostgreSQL gestionado con PgBouncer. Es el
primer entorno donde se pueden probar Embedded Signup, webhooks reales de Meta y
las cookies entre dominios. Procedimientos ya escritos:
`docs/STAGING_EMBEDDED_SIGNUP_TESTING.md`, `docs/WHATSAPP_EMBEDDED_SIGNUP_E2E.md`.

---

## 6. PRODUCTION — configurado, sin desplegar

Configuración existente: `backend/railway.json` (NIXPACKS),
`frontend/netlify.toml`, `webpage/netlify.toml`.

### 🔴 Riesgo verificado: el healthcheck apunta a una ruta que no existe

**[EJECUTADO 2026-09-10]** contra la app real con Supertest:

```
GET /health      → 200
GET /api/health  → 404
```

`backend/railway.json` declara `"healthcheckPath": "/api/health"`, pero el router
registra `router.get("/health", ...)` (`src/routes/index.ts:29`) y `app.use(router)`
lo monta sin prefijo: la ruta real es **`/health`**.

Con `restartPolicyType: ON_FAILURE` y `restartPolicyMaxRetries: 3`, un despliegue
en Railway podría marcarse como no saludable y reiniciarse en bucle **aunque el
backend esté funcionando perfectamente**.

No se ha corregido: tocar la configuración de despliegue queda fuera del alcance
de QA. Registrado como riesgo **R5** en `LAST_QA_REPORT.md`. Debe resolverse
**antes** del primer despliegue — cambiando `railway.json` a `/health`, o
montando la ruta bajo `/api`.

⚠️ Ni el build de Railway ni el de Netlify ejecutan pruebas: un despliegue con
tests en rojo pasa igual.

⚠️ **Antes del primer `migrate deploy` en producción** hay que registrar el
baseline, o el despliegue se bloqueará intentando crear tablas existentes. El
procedimiento exacto está en `QA_TEST_DATABASE.md` §6.2.

Nunca se prueba en producción con datos reales, ni se modifica producción para
que una prueba pase (`QA_RULES.md` §3).
