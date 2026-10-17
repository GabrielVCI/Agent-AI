# Sendwary — Auditoría inicial del sistema de QA local

> **Revisión 2 · 2026-09-09** (revisión 1: 2026-08-25). Documento **re-verificado
> por completo**: todos los números de esta versión se comprobaron ejecutando
> comandos hoy, no se heredaron de la revisión anterior.
> **Rama:** `main` · **Remoto:** `github.com/GabrielVCI/Agent-AI.git`
> **Alcance:** solo lectura. No se implementaron features, no se corrigió código
> funcional, no se ejecutaron migraciones, no se reseteó ni modificó la base de
> datos, no se expusieron secretos.
> **Método:** inspección del repositorio real + ejecución de los comandos que se
> podían correr sin escribir en la base de datos. Cada afirmación marcada
> **[VERIFICADO]** se comprobó ejecutando; cada afirmación marcada **[LEÍDO]**
> proviene solo de leer código y **no** debe tomarse como prueba de que funciona.

---

## 0. Resumen ejecutivo

Sendwary **sí tiene** una base de testing real, pero cubre únicamente los
módulos más recientes (Automatizaciones, Clientes, Categorías, Historial,
Mantenimiento). Todo el núcleo del producto — autenticación, cookies, roles,
tenants, onboarding, billing, agentes, conversaciones, admin y WhatsApp — sigue
teniendo **cero pruebas automatizadas**.

Cinco hechos que condicionan cualquier sistema de QA que se construya encima:

> **⚠️ Estado posterior a esta auditoría:** el **paso 2 se ejecutó el 2026-09-09**.
> **H1 y H2 están RESUELTOS** — ver `QA_TEST_DATABASE.md`. Las secciones 6 y 12
> de este documento describen el estado *previo* a esa intervención y se
> conservan como registro histórico; los recuadros marcados **[RESUELTO]**
> indican qué cambió.

| # | Hallazgo | Severidad | Estado hoy |
|---|---|---|---|
| H1 | **Drift de Prisma**: la base tiene 43 tablas pero solo 3 migraciones registradas. No se puede reconstruir una base de pruebas desde `prisma/migrations`. | 🔴 Bloqueante | ✅ **RESUELTO 2026-09-09** — migración baseline `20260909221900_catchup_schema_modulos_0_4`; `migrate deploy` reconstruye las 43 tablas desde cero |
| H2 | **No existe base de datos de pruebas**: hay un solo `DATABASE_URL`. Las 5 suites de integración escriben en la misma base de desarrollo. | 🔴 Bloqueante | ✅ **RESUELTO 2026-09-09** — base `ferreteria_ai_agent_test` + guarda que aborta si no se apunta a `*_test` |
| H3 | **226 endpoints HTTP sin una sola prueba**: no hay Supertest ni cliente HTTP de test. Nada prueba middlewares de auth, roles ni paywall. | 🔴 Alta | ⚠️ **PARCIAL 2026-09-09** — Supertest instalado y **38 pruebas HTTP** cubren auth, cookies, roles, aislamiento y SUPER_ADMIN (`QA_HTTP_TESTS.md`). La mayoría de los endpoints sigue sin cubrir |
| H4 | **Frontend sin testing y con lint roto**: 0 pruebas, sin runner, y `npm run lint` falla porque no existe `eslint.config.js`. Lo mismo en `webpage/`. | 🟠 Alta | ⚠️ **PARCIAL 2026-09-09** — lint arreglado en los 3 paquetes (`QA_LINT_AND_TYPECHECK.md`); **sigue sin runner ni pruebas de frontend** |
| H5 | **La documentación sugiere cobertura que no existe**: `ROADMAP_TO_QA.md` habla de "suites ad-hoc pasando" sin nombrar ninguna de las 9 suites reales. | 🟠 Media | Sin cambios |

**Delta desde la revisión 1 (15 días):** +29 endpoints HTTP, +1 ruta sin
commitear, **0 pruebas nuevas**, 0 herramientas nuevas, 0 hallazgos resueltos.
La brecha de cobertura se está ensanchando.

**Buena noticia encontrada al re-verificar:** `src/app.ts` ya exporta `app` por
separado y el worker de automatizaciones solo arranca en `server.ts`. Es decir,
**se pueden añadir pruebas HTTP con Supertest sin tocar una línea de código
funcional** (esto cierra el riesgo R3 de la revisión 1, que lo daba como
pendiente).

---

## 1. Estado del repositorio

**[VERIFICADO]**

- Rama actual: `main`. Remoto único: `origin`.
- **71 rutas con cambios sin commitear** (26 modificadas, 45 sin trackear).
  Entre lo no trackeado está **toda la carpeta `backend/tests/`**, los módulos
  de Clientes / Categorías / Automatizaciones / Mantenimiento y sus docs.
- Últimos commits: `ff39c33 Cambios en el codigo`, `1600a4d cambios en el frontend`,
  `d07a715 cambios`. Mensajes no descriptivos: el historial no sirve hoy como
  referencia de qué cambió en cada fase.

### Riesgo estructural: repositorios git anidados

**[VERIFICADO]** Existen repositorios `.git` independientes dentro del
repositorio principal:

```
backend/.git     frontend/.git     webpage/.git     skills/.git
```

`backend/` y `frontend/` **no son submódulos declarados**. Un `git clone` del
repositorio raíz puede no traer su contenido de forma consistente. Para QA es
relevante porque cualquier CI que clone el repo raíz podría encontrarse con
carpetas vacías o desincronizadas.

### Estructura de primer nivel

```
backend/        API Express + Prisma (el grueso del producto)
frontend/       Panel SaaS (React + Vite) — 32 páginas, 41 componentes
webpage/        Landing comercial (React + Vite, Netlify)
docs/           26 documentos + docs/qa/ + docs/support-playbooks/
admin-panel/    VACÍA
n8n/  scripts/  storage/  skills/
```

---

## 2. Herramientas de testing existentes

### 2.1 Lo que SÍ existe **[VERIFICADO]**

| Herramienta | Estado |
|---|---|
| **`node:test`** (runner nativo de Node) | ✅ En uso real — es el único runner del proyecto |
| **`tsx`** | ✅ Carga TypeScript en los tests (`node --import tsx --test`) |
| **`cross-env`** | ✅ Fija `PRISMA_CLIENT_ENGINE_TYPE=library` en Windows |
| **`assert/strict`** | ✅ Librería de aserciones (nativa) |
| **`dotenv`** | ✅ Cada suite hace `import "dotenv/config"` |
| **`tsc --noEmit`** (backend) | ✅ Pasa, **pero solo cubre `src/`** |
| **`tsc -b`** (frontend) | ✅ Pasa |

### 2.2 Lo que NO existe **[VERIFICADO]**

`grep` sobre los tres `package.json` del repositorio: **ninguna dependencia de
testing declarada**.

| Herramienta | Estado |
|---|---|
| **Vitest** | ❌ No instalado, en ningún paquete |
| **Jest** | ❌ No instalado |
| **React Testing Library** | ❌ No instalado — **0 pruebas de frontend** |
| **Playwright / Cypress** | ❌ No instalados — **0 pruebas E2E** |
| **Supertest** | ❌ No instalado — **ningún endpoint HTTP se prueba** |
| **MSW / nock / undici MockAgent** | ❌ No instalados |
| **jsdom / happy-dom** | ❌ No instalados |
| **c8 / nyc (cobertura)** | ❌ No instalados — **no existe métrica de cobertura** |
| **Testcontainers / docker-compose** | ❌ No existe |
| **ESLint en frontend** | ⚠️ Dependencia instalada, **sin archivo de configuración** → roto |
| **ESLint en backend** | ⚠️ Script `lint` es un `echo` → **falso verde** |

### 2.3 Mocks y fixtures **[VERIFICADO]**

No existe ninguna carpeta `mocks/`, `__mocks__/`, `fixtures/` ni `__tests__/` en
`backend/` ni en `frontend/`. Las suites actuales **no simulan nada**: usan
PostgreSQL real y construyen sus propios datos con funciones locales
(`createTenant`, `uniquePhone`) duplicadas en cada archivo.

Consecuencia: hoy no hay forma de probar nada que toque OpenAI, Meta, Resend,
LemonSqueezy o ElevenLabs sin llamar al servicio real.

---

## 3. Inventario de pruebas existentes

**[VERIFICADO]** 9 archivos, todos en `backend/tests/`, **ninguno trackeado en
git**. 168 casos en total.

### 3.1 Pruebas unitarias (sin base de datos) — 56 casos

| Archivo | Casos | Qué cubre |
|---|---|---|
| `automation-unit.test.ts` | 22 | Condiciones de reglas, renderizado de plantillas, cálculo de horarios, `sanitizeErrorText()` |
| `customer-unit.test.ts` | 13 | Normalización E.164, máscara de teléfono en logs, política de nombres |
| `service-history-unit.test.ts` | 12 | Recurrencias (meses ≠ 30 días, DST, fin de año), identidad cliente+servicio |
| `customer-categories-unit.test.ts` | 9 | Slugs, unicidad, nombres de categoría |

**Ejecutadas hoy: 56/56 pasan en ~5 s.**

### 3.2 Pruebas de integración (requieren PostgreSQL) — 112 casos

| Archivo | Casos | Qué cubre |
|---|---|---|
| `customer-categories.test.ts` | 34 | Categorías, segmentación, VIP reflejado desde `Customer.isVip` |
| `customer-master.test.ts` | 21 | Alta/búsqueda de clientes, importación Excel, métricas, aislamiento por tenant |
| `service-history.test.ts` | 21 | `AppointmentLine`, snapshots, visitas, recurrencias |
| `maintenance.test.ts` | 20 | Módulo de mantenimientos |
| `automation-engine.test.ts` | 16 | Motor de eventos/reglas/jobs, `SKIP LOCKED`, tenant suspendido, envío cross-tenant bloqueado |

**No ejecutadas en esta auditoría** (escriben en la única base de datos, que es
la de desarrollo — ver H2). Su estado real es **desconocido**: no se puede
afirmar que pasen.

### 3.3 Calidad de las pruebas existentes

Lo que estas suites hacen bien y **debe conservarse como convención**:

- Cada corrida crea sus propios tenants con prefijo `__*_test__` y los borra al
  final; no leen ni modifican datos preexistentes.
- Si no hay base de datos alcanzable, **fallan con mensaje claro** en vez de
  "pasar" en silencio. Cero pruebas que se salten sin avisar.
- Prueban invariantes de negocio de verdad ("1 mes no son 30 días", "el número
  pertenece a otro tenant → envío bloqueado"), no getters triviales.

Lo que hacen mal: duplican factories y limpieza en cada archivo, y **no pasan
por el compilador** (`tsconfig.json` incluye solo `src`).

Nota menor: los encabezados de las suites documentan comandos que no existen
(`npm run test:customers`); los reales son `npm run test:db:customers`.

---

## 4. Scripts disponibles **[VERIFICADO]**

### 4.1 Backend (`backend/package.json`)

| Script | Qué hace | Estado |
|---|---|---|
| `test` | `test:unit` + `test:db` | ⚠️ Requiere DB |
| `test:unit` | 4 suites unitarias | ✅ **Verde (56/56)** |
| `test:db` | 5 suites de integración | ⚠️ Escribe en la base de desarrollo |
| `test:db:automation` / `:customers` / `:categories` / `:history` / `:maintenance` | Suites individuales | ⚠️ Igual |
| `typecheck` | `tsc --noEmit` | ✅ **exit 0** (solo `src/`) |
| `lint` | `echo "Lint pendiente de configurar"` | ❌ **Falso verde** |
| `build` / `start` / `dev` | Compilar y arrancar | — |
| `prisma:migrate` | `prisma migrate dev` | 🔴 **No ejecutar** (drift) |
| `prisma:generate` / `:studio` / `:seed` | — | — |
| `seed:plans`, `backfill:*`, `smoke:customers` | Scripts operativos | ⚠️ Escriben en la base |

### 4.2 Frontend (`frontend/package.json`)

| Script | Estado |
|---|---|
| `build` (`tsc -b && vite build`) | ✅ El typecheck pasa |
| `lint` (`eslint .`) | ❌ **Roto: no existe `eslint.config.js`** |
| `dev` / `preview` | — |
| **test** | ❌ **No existe ningún script de test** |

### 4.3 Webpage (`webpage/package.json`)

`dev`, `build` (con prebuild de sitemap y postbuild de prerender), `preview`,
`generate:icons`, y `lint` — que **también está roto**: `webpage/` tampoco tiene
archivo de configuración de ESLint.

---

## 5. Configuración de TypeScript **[VERIFICADO]**

**Backend** (`backend/tsconfig.json`): `strict: true`, `module: NodeNext`,
`target: ES2022`.
🟠 `include: ["src", "src/types/**/*.d.ts"]` → **`tests/`, `scripts/` y
`prisma/seed.ts` quedan fuera del typecheck**. Errores de tipos en las pruebas
son invisibles hasta ejecutarlas.

**Frontend**: `tsconfig.json` (referencias) + `tsconfig.app.json` +
`tsconfig.node.json`.
⚠️ **GOTCHA ya conocido del proyecto**: `tsc --noEmit` no chequea el frontend;
hay que usar `tsc -b`. Verificado hoy: `npx tsc -b --force` → exit 0.

---

## 6. Prisma, migraciones y base de datos

> **[RESUELTO 2026-09-09]** Todo lo que sigue en esta sección describe el estado
> **anterior** al paso 2. Ambos bloqueadores están cerrados; el procedimiento
> exacto, la prueba de que funciona y la deuda que quedó están en
> **`QA_TEST_DATABASE.md`**. Se conserva como registro de por qué se hizo así.

### 6.1 Drift confirmado — 🔴 hallazgo H1

**[VERIFICADO]** hoy mediante consulta **de solo lectura** a la base local
(`information_schema.tables` + `_prisma_migrations`, cero escrituras):

```
tablas en schema public: 43
migraciones registradas:  3   (todas OK, la última de junio)
  20260518170658_init
  20260518171339_add_product_business_sku_unique
  20260610162201_saas_multiempresa
modelos en schema.prisma: 42
```

**~40 tablas existen en la base pero no en el historial de migraciones**:
`AutomationRule`, `AutomationJob`, `CustomerCategory`, `AppointmentLine`,
`WhatsAppIntegration`, `SupportTicket`, `EmailVerificationToken`,
`PasswordResetToken`, `UsageCounter`, `CallLog`, etc.

El esquema real se construyó con `prisma db push` + 4 scripts SQL manuales en
`backend/prisma/sql/`:

```
2026-08-16_automation_core.sql (245 líneas)   2026-08-18_customer_categories.sql (131)
2026-08-17_customer_master.sql (80)           2026-08-18_service_history.sql (111)
```

Esos SQL son **incrementales y no destructivos** (`CREATE ... IF NOT EXISTS`),
correctos para aplicar sobre una base existente, pero **no reconstruyen nada
desde cero** ni están integrados al historial de migraciones. Por lo tanto:

- ❌ No se puede crear una base de pruebas limpia con `prisma migrate deploy`.
- ❌ No se puede crear una base efímera por corrida de CI.
- ❌ Ningún CI puede reproducir el esquema de forma determinista.
- ⚠️ `npm run prisma:migrate` (`migrate dev`) sobre este estado es **peligroso**:
  Prisma detectaría el drift y podría proponer un reset. **No ejecutarlo.**

> Esto ya era una decisión consciente del proyecto ("usar `db push`, no
> `migrate dev`"), pero es exactamente lo que impide montar QA reproducible.
> **Es el bloqueador número uno.**

`prisma.config.ts` ya prevé `DIRECT_URL` para migraciones (PgBouncer en
transaction mode no soporta los advisory locks de Prisma Migrate) — la pieza
está lista, falta el baseline.

### 6.2 Sin base de datos de pruebas — 🔴 hallazgo H2

**[VERIFICADO]** El `.env` local del backend tiene 24 variables y **ninguna**
llamada `TEST_DATABASE_URL`, `SHADOW_DATABASE_URL` ni `DIRECT_URL`. Existe un
único `DATABASE_URL`. Las 5 suites de integración escriben en la **misma base
que usa el desarrollo diario**.

Riesgos concretos:
- Un test que falle a mitad deja tenants `__*_test__` huérfanos en la base de dev.
- Ejecutar las suites mientras el servidor de dev corre compite por conexiones
  (y el worker de automatizaciones arranca con el servidor).
- Nunca se podrá correr esto en CI sin una base dedicada.

**Dato favorable [VERIFICADO]:** las sesiones viven en PostgreSQL
(`prisma.session`) con Redis solo como caché y fallback a DB. Las pruebas de
login/cookies **no necesitan Redis levantado**.

---

## 7. Configuración de entorno

### 7.1 Cobertura de variables **[VERIFICADO]**

| | Claves declaradas en `.env.example` | Claves presentes en `.env` local |
|---|---|---|
| Backend | **87** | **24** |
| Frontend | 5 | (5 declaradas) |

**63 de 87 variables del backend no están configuradas localmente.** Familias
completas ausentes: `RATE_LIMIT_*` (11), `LEMONSQUEEZY_*` (8), `ELEVENLABS_*` (7),
`AUTOMATION_*` (6), `SMTP_*` (5), `GOOGLE_CLIENT_*` (2), `META_APP_ID`,
`META_APP_SECRET`, `META_EMBEDDED_SIGNUP_*`, `META_SYSTEM_USER_ACCESS_TOKEN`,
`ENCRYPTION_KEY`, `VOICE_TOOLS_TOKEN`, `COOKIE_SAMESITE`, `APP_ENV`, `DIRECT_URL`.

Esto define directamente **qué se puede probar hoy en local**: sin
`ENCRYPTION_KEY` no se prueba WhatsApp por tenant (token cifrado); sin
`LEMONSQUEEZY_*` no se prueba checkout; sin `RATE_LIMIT_*` los rate limits corren
con defaults no declarados.

### 7.2 🟠 `backend/.env.example` NO está versionado

**[VERIFICADO]** `backend/.gitignore` contiene:

```
.env
.env.example      ← ignora también la plantilla
```

`git ls-files` confirma que solo `frontend/.env.example` y `webpage/.env.example`
están trackeados. **La plantilla de las 87 variables del backend existe solo en
la máquina local.** Si se pierde, se pierde el contrato de configuración
completo — y con él, la posibilidad de escribir un `.env.test` correcto.

### 7.3 Manejo de secretos

✅ **[VERIFICADO]** Ningún `.env` está trackeado en git.
✅ `RESEND_APIKEY` (nombre correcto, sin guion bajo entre API y KEY),
`META_APP_SECRET` y los tokens de WhatsApp solo aparecen como **nombres** en
`.env.example`, nunca con valores en el repositorio.
✅ El motor de automatizaciones tiene `sanitizeErrorText()` **con prueba
unitaria que verifica que borra tokens y credenciales** de los mensajes de error.
Es hoy la única prueba de seguridad del proyecto.

---

## 8. Seguridad — invariantes que hoy NO tienen prueba de regresión

Verificado **leyendo** el código (no ejecutando): los invariantes críticos del
proyecto se cumplen hoy, pero **nada impide que un refactor los rompa**.

| Invariante | Estado real | ¿Prueba? |
|---|---|---|
| No JWT en frontend | ✅ Se cumple **[LEÍDO]** | ❌ Ninguna |
| No tokens auth en localStorage | ✅ **[VERIFICADO por grep]**: el único uso de `localStorage` en `frontend/src` es la preferencia de colapso del sidebar. `sessionStorage`: 0 usos. | ❌ Ninguna |
| Cookie httpOnly `sid` | ✅ `sessionCookieAttrs()` en `config/env.ts`; `COOKIE_SAMESITE` con modo `auto`/`none` para Netlify+Railway **[LEÍDO]** | ❌ Ninguna |
| SUPER_ADMIN nunca bloqueado por paywall | ✅ `plan-limits.middleware.ts` corta antes de consultar la suscripción; `RequireActiveSubscription.tsx` hace bypass total en frontend **[LEÍDO]** | ❌ Ninguna |
| SUPER_ADMIN nunca bloqueado por verificación/implementación | ✅ El gate del frontend ni consulta `activation-status` si es SUPER_ADMIN **[LEÍDO]** | ❌ Ninguna |
| OWNER/ADMIN solo acceden a su tenant | ✅ `requireTenantAccess` (403 `TENANT_REQUIRED` sin tenantId) **[LEÍDO]** | ⚠️ Solo a nivel de **servicio** en módulos 0–4 |
| No exponer secretos en respuestas | ✅ `sanitizeErrorText()` + contrato `{message, error:{code}}` | ⚠️ 1 caso unitario |

### 🟠 Hallazgo: logging de depuración de autenticación activo

**[VERIFICADO]** `auth.middleware.ts`, `roles.middleware.ts` y `auth.service.ts`
tienen bloques marcados `// --- [DEBUG-AUTH] temporal (quitar luego) ---` que se
activan con `const dbg = env.NODE_ENV !== "production"`. Vuelcan a consola ruta,
origin, nombre de cookie, ids de usuario, rol y tenantId (el token nunca se
imprime).

No hay fuga en producción, pero **`NODE_ENV=test` también los activa**: cualquier
suite HTTP futura quedaría sepultada bajo estos logs. Corregir la guarda a
`NODE_ENV === "development"` antes de escribir pruebas HTTP.

---

## 9. CI/CD y despliegue **[VERIFICADO]**

### 9.1 CI: inexistente

**No existe `.github/`.** Ni Actions, ni GitLab CI, ni Jenkins, ni pre-commit
hooks. **Nada verifica nada automáticamente al hacer push.** Los únicos `.yml`
del repositorio son `pnpm-lock.yaml` y `pnpm-workspace.yaml` del backend.

### 9.2 Despliegue

| Destino | Configuración | Relevancia para QA |
|---|---|---|
| **Railway** (backend) | `backend/railway.json`: NIXPACKS, `npm ci && npx prisma generate && npm run build`, healthcheck `/api/health` | El build **no corre pruebas ni typecheck**. Un despliegue con tests rojos pasa igual. |
| **Netlify** (panel) | `frontend/netlify.toml`: base `frontend`, Node 20, SPA fallback, cabeceras de seguridad, `VITE_*` desde el panel | El build sí corre `tsc -b`. `npm run build` **no** ejecuta lint ni tests. |
| **Netlify** (landing) | `webpage/netlify.toml`: redirect canónico www→apex, SPA fallback | Sitio estático; QA mínima. |

🟠 **Dos lockfiles en backend**: `package-lock.json` y `pnpm-lock.yaml` +
`pnpm-workspace.yaml`. Railway usa `npm ci`. Cualquier CI que elija pnpm
instalaría un árbol de dependencias distinto al de producción.

---

## 10. Documentación QA existente

| Documento | Contenido | Utilidad para QA |
|---|---|---|
| `docs/ROADMAP_TO_QA.md` | Bloqueadores B1–B5, checklists local/staging/producción | 🟢 Alta — define qué falta para poder probar |
| `docs/PRODUCT_AND_TECH_SPEC.md` | Sección J: checklist de QA manual | 🟢 Alta |
| `docs/LOCKED_DECISIONS.md` | 25 decisiones cerradas | 🟢 **Candidatas directas a pruebas de regresión** |
| `docs/FEATURE_RELEASE_CHECKLIST.md` | Checklist por feature | 🟢 Media |
| `docs/support-playbooks/` (21 playbooks) | Comportamiento esperado, escrito para soporte | 🟢 **Especificación de comportamiento ya redactada** |
| `docs/STAGING_EMBEDDED_SIGNUP_TESTING.md`, `WHATSAPP_EMBEDDED_SIGNUP_E2E.md` | Procedimiento manual de Embedded Signup | 🟢 Alta — para lo no automatizable |
| `docs/DATA_CONSISTENCY_AUDIT.md` | Auditoría de consistencia previa | 🟡 Referencia |
| `docs/qa/QA_INITIAL_AUDIT.md` | **Este documento** | — |

**No existe** ningún documento de estrategia de pruebas, plan de QA, matriz de
casos ni checklist de regresión ejecutable.

### 🟠 Hallazgo H5: la documentación sugiere pruebas que no existen

`ROADMAP_TO_QA.md` describe el estado como "suites ad-hoc pasando" sin nombrar
ninguna de las 9 suites reales, y B5 pide "verificar que `seed:plans` refleje
US$40/60/90" — verificación manual, no automatizada. Un lector futuro puede
concluir que hay más cobertura de la que existe.

---

## 11. Clasificación por área

**Leyenda:**
`COVERED` = pruebas automatizadas reales · `PARTIALLY COVERED` = cubierto en
parte o solo en una capa · `NOT COVERED` = cero pruebas · `BROKEN` = la
herramienta existe pero no funciona · `NOT VERIFIABLE LOCALLY` = requiere
entorno público o servicio externo.

| # | Área | Clasificación | Sustento |
|---|---|---|---|
| 1 | **Auth** (login, register, sesión, reset, verificación) | 🟠 `PARTIALLY COVERED` **[2026-09-09]** | **14 pruebas HTTP** cubren login, anti-enumeración, usuario DISABLED, sesión y logout con revocación real. Siguen sin cobertura: `register`, Google OAuth, reset de contraseña y verificación de correo. |
| 2 | **Cookies** (httpOnly `sid`, sameSite, clearCookie) | 🟢 `COVERED` **[2026-09-09]** | Verificado por HTTP: la cookie se llama `sid`, es HttpOnly, tiene `Path=/` y declara SameSite; el token no viaja en el cuerpo; la base guarda su hash; el logout la invalida en el servidor. |
| 3 | **Roles** (`requireRole` / `requireTenantAccess`) | 🟢 `COVERED` **[2026-09-09]** | **12 pruebas HTTP**: 403 por rol insuficiente, `ADMIN ≠ SUPER_ADMIN`, 401 antes que 403, y aislamiento entre empresas comprobado por listado y por acceso directo por id. |
| 4 | **SUPER_ADMIN** (bypass paywall / tenant / verificación) | 🟢 `COVERED` (backend) **[2026-09-09]** | **12 pruebas** sobre los middlewares reales aislados, cada bypass verificado **por contraste** (empresa sin plan → 403, con plan → 200, SUPER_ADMIN → 200). Falta el gate del frontend (`RequireActiveSubscription.tsx`), que necesita el paso 6. |
| 5 | **Tenants** (aislamiento multi-empresa) | 🟢 `PARTIALLY COVERED` | **La mejor área cubierta.** Aislamiento probado explícitamente en las 5 suites de integración, incluido "el número pertenece a otro tenant → envío bloqueado" y "tenant suspendido no genera automatizaciones". Solo en módulos 0–4. |
| 6 | **Onboarding** | 🔴 `NOT COVERED` | 0 pruebas sobre `onboarding.service.ts`, `activation-status`, `lifecycleStatus`, gates de implementación. |
| 7 | **Billing** (planes, límites, LemonSqueezy) | 🔴 `NOT COVERED` | 0 pruebas sobre `billing.service.ts`, `plan-limits.middleware.ts`, `usage-metrics.service.ts`. La firma HMAC del webhook no se valida. Sin `LEMONSQUEEZY_*` en local. |
| 8 | **Email** (Resend/SMTP, plantillas) | 🔴 `NOT COVERED` + ⚠️ `NOT VERIFIABLE LOCALLY` (envío real) | 0 pruebas. La *renderización* de plantillas y la lógica de tokens **sí son simulables**; el envío real requiere Resend. `RESEND_APIKEY` está en local; `SMTP_*` no. |
| 9 | **Agents** (runtime IA, OpenAI) | 🔴 `NOT COVERED` + ⚠️ `NOT VERIFIABLE LOCALLY` (respuestas reales) | 0 pruebas sobre `agent-runtime/` (5 archivos), `agent.service.ts`, `agent-action.service.ts`. Selección de herramientas y guardas de gasto **son simulables**; la calidad de respuesta no. |
| 10 | **Conversations / Inbox** | 🔴 `NOT COVERED` | 0 pruebas sobre `conversation.service.ts`, `conversation-labels.service.ts`, `inbox.controller.ts` — los tres con cambios sin commitear ahora mismo. |
| 11 | **Admin** (panel SUPER_ADMIN) | 🔴 `NOT COVERED` | 0 pruebas sobre `admin.service.ts`, `admin.controller.ts`, `admin-automation.controller.ts`. |
| 12 | **WhatsApp** (webhook, envío, multi-modo) | 🟠 `PARTIALLY COVERED` + ⚠️ `NOT VERIFIABLE LOCALLY` (Meta real) | Cubierto **un solo punto**: `automation-engine.test.ts` prueba que un envío a un número de otro tenant se bloquea y que sin agente de WhatsApp el job falla como no reintentable. Webhook, verificación de firma, parseo de payloads de Meta y multi-modo (`whatsapp-providers/`): **0 pruebas**. Envío real exige WABA (bloqueador B2). |
| 13 | **Embedded Signup** | ⚠️ `NOT VERIFIABLE LOCALLY` | Requiere HTTPS público + app de Meta aprobada + SDK de Facebook en el navegador. Sin `META_APP_ID` ni `META_EMBEDDED_SIGNUP_CONFIG_ID` en local. Solo hay procedimiento manual documentado. |
| 14 | **Prisma / base de datos** | ~~🔴 `BROKEN`~~ → 🟢 `COVERED` **[RESUELTO 2026-09-09]** | El baseline reconstruye las 43 tablas desde `prisma/migrations` y el diff contra `schema.prisma` sale vacío; `migrate status` en dev dice *up to date*. Base de pruebas dedicada con guarda. Ver `QA_TEST_DATABASE.md`. |
| 15 | **Security** (secretos, rate limit, sanitización) | 🟠 `PARTIALLY COVERED` | Único punto probado: `sanitizeErrorText()` (1 caso unitario). Rate limits (11 variables sin configurar), CORS, helmet, cifrado de tokens de WhatsApp: **0 pruebas**. "No JWT / no localStorage" se cumple pero **sin test de regresión**. |
| 16 | **Frontend** | 🔴 `NOT COVERED` + `BROKEN` | 0 pruebas, 0 runner, 0 RTL para 32 páginas y 41 componentes. `npm run lint` **falla** por falta de `eslint.config.js` (igual en `webpage/`). Lo único verde es `tsc -b`. |
| 17 | **Backend** (global) | 🟠 `PARTIALLY COVERED` | 168 casos cubren 5 módulos de negocio. **226 endpoints HTTP sin una sola prueba.** `typecheck` **ya cubre `tests/` y `scripts/`** y pasa limpio; `lint` es ESLint real (8 errores de estilo, ninguno es bug) **[RESUELTO 2026-09-09]**. |

### Resumen visual

```
COVERED                    0 áreas
PARTIALLY COVERED          5 áreas   Roles · Tenants · WhatsApp · Security · Backend
NOT COVERED                9 áreas   Auth · Cookies · SUPER_ADMIN · Onboarding ·
                                     Billing · Email · Agents · Conversations · Admin
BROKEN                     2 áreas   Prisma · Frontend (lint)
NOT VERIFIABLE LOCALLY     1 área    Embedded Signup  (+ parcial en Email/Agents/WhatsApp)
```

---

## 12. Qué se puede ejecutar HOY

### ✅ Verde y verificado ejecutando (2026-09-09)

| Comando | Resultado real |
|---|---|
| `cd backend && npm run test:unit` | **56/56 pasan** en ~5 s |
| `cd backend && npm run typecheck` | **exit 0** |
| `cd frontend && npx tsc -b --force` | **exit 0** |

### ⚠️ Ejecutable pero no verificado en esta auditoría

| Comando | Por qué no se ejecutó |
|---|---|
| `cd backend && npm run test:db` (112 casos) | Escribe en la **única** base de datos, que es la de desarrollo. El mandato de esta fase prohibía modificar datos. **Su estado real es desconocido**: no se puede afirmar que pasen. Requiere autorización explícita o, mejor, base de pruebas dedicada. |

> **[RESUELTO 2026-09-09]** Ya existe base de pruebas dedicada. `npm run test:db`
> se ejecutó contra ella: **112/112 pasan**. Con `test:unit`, **168/168 verdes**.

### ❌ Roto

| Comando | Fallo |
|---|---|
| `cd frontend && npm run lint` | `ESLint couldn't find an eslint.config.(js\|mjs\|cjs) file` |
| `cd webpage && npm run lint` | Mismo fallo — tampoco tiene configuración |
| `cd backend && npm run lint` | No falla, pero es un `echo` — **falso verde** |

### 🔴 No ejecutar

| Comando | Motivo |
|---|---|
| `npm run prisma:migrate` | Drift de ~40 tablas → riesgo de propuesta de reset |

### Dependencias externas por prueba

| Depende de | Áreas afectadas | ¿Simulable? |
|---|---|---|
| PostgreSQL local | 112 casos de integración | No (son pruebas de SQL/Prisma reales — y deben serlo) |
| Redis | `closeRedis()` en las suites; rate limiting | Sí — y las sesiones **no** dependen de él (viven en Postgres) |
| OpenAI | Agentes, clasificación de intención | Sí (cliente falso) — la calidad real, no |
| Meta Graph API | WhatsApp, Embedded Signup | Parcial (payloads de webhook sí; envío real no) |
| Resend / SMTP | Email | Sí (transporte falso) |
| LemonSqueezy | Billing | Sí (webhooks firmados sintéticos) |
| ElevenLabs | Voz, audio | Sí (respuestas grabadas) |
| Google OAuth | Login con Google | Parcial (requiere credenciales — bloqueador B1) |

Servicios externos confirmados por inspección de código: `graph.facebook.com`,
`accounts.google.com`, `oauth2.googleapis.com`, `www.googleapis.com`,
`api.lemonsqueezy.com`, `api.elevenlabs.io`, más OpenAI vía SDK.

---

## 13. Estructura mínima propuesta de QA

> Propuesta, **no implementada**. Respeta el estilo de las suites existentes.

```
backend/
  tests/
    unit/                    ← mover aquí las 4 suites unitarias actuales
    integration/             ← mover aquí las 5 suites de DB actuales
    http/                    ← NUEVO: pruebas de endpoint con Supertest
      auth.http.test.ts        login, register, cookie sid httpOnly, 401, logout
      roles.http.test.ts       requireRole / requireTenantAccess / 403
      superadmin.http.test.ts  bypass de paywall, tenant y verificación  ← crítico
      billing.http.test.ts     límites de plan y enforcement
      whatsapp-webhook.http.test.ts   verificación y payloads de Meta
    helpers/                 ← NUEVO: lo que hoy se duplica en cada suite
      tenant-factory.ts        crear tenant/usuario/sesión de prueba
      auth-agent.ts            cliente HTTP autenticado por rol
      cleanup.ts               borrado por prefijo, centralizado
    fixtures/                ← NUEVO
      meta-webhook-payloads/   payloads reales anonimizados
      lemonsqueezy-events/     webhooks firmados sintéticos
    mocks/                   ← NUEVO
      openai.mock.ts  resend.mock.ts  meta-graph.mock.ts  elevenlabs.mock.ts
    setup/
      test-db.ts               conexión a la base DEDICADA de pruebas
      global-setup.ts          verificar esquema + abortar si DATABASE_URL
                               no apunta a la base de test
  tsconfig.test.json         ← NUEVO: typecheck de tests/ y scripts/

frontend/
  eslint.config.js           ← NUEVO: arreglar el lint roto
  vitest.config.ts           ← NUEVO
  src/
    **/*.test.tsx            ← colocado junto al componente
    test/
      setup.ts                 jsdom + jest-dom
      render.tsx               render con AuthContext + Router
      msw/handlers.ts          API simulada

docs/qa/
  QA_INITIAL_AUDIT.md        ← este documento
  QA_STRATEGY.md             ← qué se prueba en cada capa y qué no
  QA_MANUAL_CHECKLIST.md     ← lo no automatizable (Embedded Signup, WABA real)
  QA_TEST_DATABASE.md        ← cómo crear/regenerar la base de pruebas
```

### Fases sugeridas (orden por dependencia, no por preferencia)

1. ✅ **HECHO (2026-09-09)** — **Commitear lo que ya existe.** Commit `9d6792c` en
   el repositorio anidado `backend/.git`; las 9 suites quedaron trackeadas.
   (Pendiente aparte: R7, los repos anidados.)
2. ✅ **HECHO (2026-09-09)** — **Desbloquear la base de datos** (H1+H2): baseline
   `20260909221900_catchup_schema_modulos_0_4` + base `ferreteria_ai_agent_test`
   con guarda. Resultado verificado: 168/168 casos verdes, dev intacta.
   Detalle completo en **`QA_TEST_DATABASE.md`**.
3. ✅ **HECHO (2026-09-09)** — **Arreglar lo roto y lo falso**: `eslint.config.js` en
   frontend y webpage, ESLint real en backend, `tsconfig.test.json`. Detalle en
   **`QA_LINT_AND_TYPECHECK.md`**. El lint encontró **1 bug real** (hooks en
   `OnboardingPage`), pendiente de decisión por ser código funcional.
4. ⚠️ **PARCIAL (2026-09-09)** — **Helpers y factories**: se crearon
   `tests/helpers/factories.ts` y `tests/helpers/http.ts` como base del paso 5.
   Queda pendiente migrar a ellos las 5 suites de integración, que siguen
   duplicando sus propias factories.
5. ✅ **HECHO (2026-09-09)** — **Capa HTTP con Supertest**: 38 pruebas sobre auth,
   cookies, roles, aislamiento entre empresas y el invariante de SUPER_ADMIN.
   Total del proyecto: **206 casos, todos verdes**. Ver **`QA_HTTP_TESTS.md`**.
6. **← SIGUIENTE. Frontend con Vitest + RTL + MSW**: empezar por `AuthContext`,
   `ProtectedRoute` y `RequireActiveSubscription` (el gate de paywall).
7. **CI en GitHub Actions**: typecheck + lint + unit en cada push; integración
   contra base efímera (posible solo tras la fase 2).
8. **Checklist manual** para lo genuinamente no automatizable.

---

## 14. Herramientas reutilizables vs. faltantes

### ✅ Ya disponible — reutilizar, no reemplazar

| Herramienta | Por qué conservarla |
|---|---|
| `node:test` + `tsx` | Ya funciona, cero dependencias nuevas, 168 casos escritos sobre él. **No migrar el backend a Vitest sin una razón concreta.** |
| **`app` exportado en `src/app.ts`** | Supertest puede montar la API **sin abrir puerto y sin arrancar el worker** de automatizaciones (que vive en `server.ts`). Pieza clave ya resuelta. |
| **Sesiones en PostgreSQL** (`prisma.session`) | Permite probar login/cookies sin Redis levantado |
| `cross-env` | Ya resuelve el `PRISMA_CLIENT_ENGINE_TYPE` de Windows |
| Prisma Client + `prisma.config.ts` (con `DIRECT_URL`) | Acceso directo en integración; la separación pooler/directa ya está prevista |
| `dotenv` | Patrón de carga previa ya resuelto en las suites |
| `zod` | Ya en ambos lados: sirve para validar formas de respuesta en pruebas |
| `exceljs` | Ya se usa para probar importaciones |
| Errores tipados (`AppError.fromCode`, contrato `{message, error:{code}}`) | Da un contrato **assertable** en pruebas HTTP: se afirma sobre `error.code`, no sobre texto |
| Playbooks de soporte (21) | **Especificación de comportamiento ya escrita** → casos de prueba casi listos |
| `LOCKED_DECISIONS.md` | 25 invariantes candidatos a pruebas de regresión |
| Prefijos `__*_test__` + cleanup por id | Convención sana ya establecida; centralizarla en un helper |

### ❌ Realmente faltante

| Necesidad | Herramienta sugerida | Justificación |
|---|---|---|
| Pruebas de endpoint HTTP | **`supertest` + `@types/supertest`** | 226 endpoints sin cobertura; es el hueco más grande |
| Runner de frontend | **`vitest`** | Comparte config con Vite, no requiere Babel |
| Pruebas de componentes | **`@testing-library/react`** + `jest-dom` + `user-event` | 32 páginas, 41 componentes sin ninguna prueba |
| DOM en Node | **`jsdom`** o `happy-dom` | Requisito de RTL |
| Simulación de red en frontend | **`msw`** | Prueba la app sin backend real |
| Simulación de HTTP en backend | **`nock`** o `undici` MockAgent | Meta, OpenAI, Resend, LemonSqueezy, ElevenLabs |
| Lint real | **`eslint.config.js`** en frontend y webpage (rotos) + configuración en backend (stub) | Hoy no se analiza nada |
| Cobertura | **`c8`** (funciona con `node:test`) | Sin métrica no se sabe qué falta |
| Base de pruebas reproducible | **Migración baseline de Prisma** (+ opcionalmente Testcontainers/Docker) | Bloqueador H1 |
| CI | **GitHub Actions** | No existe ningún pipeline |
| Datos de prueba | **Factories propias** (no hace falta Faker) | Hoy se duplica en cada suite |

**Nada de lo anterior exige cambiar código funcional.** Es la condición que debe
mantenerse durante toda la fase de QA.

---

## 15. Riesgos antes de implementar el sistema de QA

| # | Riesgo | Impacto | Mitigación propuesta |
|---|---|---|---|
| **R1** | ~~Reconstruir migraciones puede destruir datos.~~ **Cerrado 2026-09-09**: se hizo con `migrate diff` + `migrate resolve --applied`, con backup previo. Cero SQL ejecutado sobre dev; datos verificados idénticos antes y después. | 🟢 Cerrado | El aviso de "no ejecutar `migrate dev`" queda **levantado** para desarrollo: ya no hay drift. |
| **R2** | ~~Las pruebas de integración escriben en la base de desarrollo.~~ **Cerrado 2026-09-09**: base `ferreteria_ai_agent_test` + guarda `tests/setup/use-test-db.ts`, verificada abortando al apuntarla a dev. | 🟢 Cerrado | Convención: toda suite nueva que toque la base debe cargar la guarda con `--import`. |
| **R3** | ~~Las pruebas HTTP arrancarían el worker de automatizaciones.~~ **Cerrado: verificado que `app` se exporta en `src/app.ts` y `startAutomationWorker()` solo se llama en `server.ts`.** | 🟢 Cerrado | Usar Supertest contra `app`, nunca contra `server`. Mantener `AUTOMATION_WORKER_ENABLED=false` en `.env.test` como cinturón de seguridad. |
| **R4** | **63 de 87 variables no están configuradas en local.** Muchas pruebas fallarían por configuración ausente, no por bugs → ruido que erosiona la confianza en la suite. | 🟠 Alto | Un `.env.test` con valores falsos deterministas para las 87 variables. Añadir `backend/.env.example` a git (hoy lo ignora `backend/.gitignore`). |
| **R5** | ~~El logging `[DEBUG-AUTH]` se activa también en `test`.~~ **Cerrado 2026-09-09**: la guarda pasó a `NODE_ENV === "development"` en los 4 archivos (`auth.middleware`, `roles.middleware`, `auth.service`, `auth.controller`). Sin cambio de comportamiento en dev ni en producción. | 🟢 Cerrado | — |
| **R6** | **71 rutas sin commitear**, incluida toda la carpeta `tests/`. Un `git checkout` o un stash mal hecho borra las pruebas existentes. | 🟠 Alto | Commitear el trabajo actual **antes** de tocar la estructura de QA. Es la fase 1. |
| **R7** | **Repos git anidados** (`backend/.git`, `frontend/.git`, `webpage/.git`, `skills/.git`). Un CI que clone el repo raíz puede no obtener el código. | 🟠 Medio | Decidir: submódulos declarados o un solo repositorio. Resolver antes de configurar CI. |
| **R8** | **Dos lockfiles en backend** (`package-lock.json` y `pnpm-lock.yaml`). Producción usa `npm ci`; un CI con pnpm instalaría otro árbol de dependencias. | 🟡 Medio | Elegir npm (coincide con Railway) y eliminar `pnpm-lock.yaml` + `pnpm-workspace.yaml`. |
| **R9** | ~~`tests/` no pasa por el compilador.~~ **Cerrado 2026-09-09**: `tsconfig.test.json` cubre `tests/`, `scripts/`, `seed.ts` y `prisma.config.ts`, enganchado a `npm run typecheck`. Pasa limpio a la primera. | 🟢 Cerrado | — |
| **R10** | **Riesgo de falso verde** — **Mitigado 2026-09-09**: el `echo` del backend es ahora ESLint real y los 3 `lint` rotos funcionan. **Queda pendiente** corregir `ROADMAP_TO_QA.md`, que sigue sugiriendo cobertura inexistente. | 🟡 Medio | Ninguna prueba puede saltarse en silencio: si falta la DB, la suite **falla** (la convención actual ya lo hace bien). |
| **R11** | **Cambiar los servicios para hacerlos testeables** (inyección de dependencias para OpenAI/Meta/Resend) toca código funcional en producción. | 🟠 Alto | Preferir simulación en el borde de la red (`nock`/MockAgent) antes que refactorizar servicios. Cero cambios funcionales en la fase de QA. |
| **R12** | **Las pruebas E2E de WhatsApp/Embedded Signup requieren entorno público.** Perseguirlas en local consume tiempo sin resultado. | 🟡 Medio | Declararlas explícitamente como checklist manual en `QA_MANUAL_CHECKLIST.md`, no automatizarlas. |
| **R13** | **El producto crece más rápido que las pruebas**: +29 endpoints y 0 pruebas nuevas en 15 días. | 🟠 Alto | Regla de entrada en `FEATURE_RELEASE_CHECKLIST.md`: ninguna feature nueva sin al menos una prueba de su invariante principal. |

---

## 16. Conclusión

Sendwary tiene **168 casos de prueba de buena calidad que cubren cinco módulos
de negocio**, y **cero cobertura del núcleo del producto**. La brecha no es de
herramientas: es que el testing empezó por los módulos más nuevos y nunca llegó
hacia atrás, hacia auth, roles, billing y conversaciones.

**Lo primero que hay que resolver no es escribir pruebas, sino commitear lo que
existe, el drift de Prisma y la ausencia de una base de datos de pruebas**
(R6, H1 y H2). Sin eso, cualquier prueba de integración nueva seguirá escribiendo
en la base de desarrollo y ningún CI podrá reproducir el esquema.

**Lo segundo es eliminar los falsos verdes**: un `lint` que solo hace `echo`, un
`typecheck` que ignora las pruebas, y documentación que sugiere cobertura
inexistente. Un sistema de QA construido sobre señales falsas es peor que
ninguno.

**Lo tercero es la capa HTTP**, y ahí hay una buena noticia: la arquitectura ya
lo permite sin refactor. `app` está separado de `server`, las sesiones viven en
Postgres y los errores tienen códigos tipados. Supertest se puede añadir sin
tocar código funcional.

---

### Anexo — comandos ejecutados en esta auditoría (2026-09-09)

Todos de solo lectura, salvo los tests unitarios (que no tocan la base de datos):

```bash
git branch --show-current ; git remote -v ; git status --porcelain ; git ls-files
cd backend  && npm run test:unit          # 56/56 ✅
cd backend  && npm run typecheck          # exit 0 ✅
cd frontend && npx tsc -b --force         # exit 0 ✅
cd frontend && npm run lint               # ❌ falla: sin eslint.config
# Consulta SQL de SOLO LECTURA con el cliente Prisma del proyecto:
#   information_schema.tables + _prisma_migrations. Script temporal, borrado
#   tras ejecutarse. Cero escrituras.
```

**No se ejecutó** ninguna migración, ningún `db push`, ningún seed, ningún
backfill, y ninguna de las 5 suites que escriben en la base de datos.
Ningún valor de secreto fue leído ni impreso: de los `.env` solo se listaron
**nombres** de variables.
