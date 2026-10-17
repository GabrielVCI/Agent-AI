# QA_CHANGELOG — Cambios del sistema de QA

> Registra los cambios del **sistema de QA en sí**: suites, herramientas,
> scripts, reglas, infraestructura de pruebas. **No** registra cambios del
> producto (eso es el historial de git) ni resultados de pasadas (eso es
> `LAST_QA_REPORT.md`).
>
> Formato: más reciente arriba. Toda entrada dice qué cambió, por qué, y qué
> quedó verificado ejecutando.

---

## 2026-09-23 — Corrección de F2, F3, F4 y F5

**Qué cambió**

Se quitaron los 5 `todo` (F2 ×2, F3, F4, F5): ahora son regresiones normales
que rompen la suite si la falla vuelve. +1 caso en `db-integrity` (fila legada
con email en mayúsculas). De **462** a **463** casos. Detalle de cada corrección
en `QA_DATABASE.md` §9.

**Verificado ejecutando**

`npm test` → 463 / 463 verdes, 0 `todo`, exit 0. `typecheck` exit 0. Lint sin
errores nuevos. Un primer intento de F4 que solo normalizaba el login rompió 9
pruebas HTTP (las factories crean emails con mayúsculas, igual que una fila
legada); de ahí `findUserByEmail()` con respaldo insensible a mayúsculas.

---

## 2026-09-23 — QA de base de datos

**Qué cambió**

De **446** a **462** casos. Suite nueva `tests/db-integrity.test.ts`
(`npm run test:db:integrity`, añadida al final de `npm run test:db`), con 16
casos sobre lo que garantiza PostgreSQL por sí mismo: unique constraints,
FKs y reglas `ON DELETE`, nullability, defaults, rollback de transacciones y
tres condiciones de carrera. Informe completo en `QA_DATABASE.md`.

**Por qué**

Las suites existentes prueban reglas de negocio encima de la base; nadie
comprobaba la base en sí, ni el drift de desarrollo, ni las carreras que solo
una constraint puede cerrar.

**Verificado ejecutando**

- `migrate status` dev/test al día; migraciones → schema: diff vacío; test → schema: sin diferencias.
- Drift nuevo en dev: `Plan.LemonSqueezyID/LemonSqueezyVariantID` con datos → **R16**, no se ejecutó nada.
- `npm test` → 446 casos, 0 fallos, 3 `todo` (sin cambios). `npm run test:db:integrity` → 16 casos, 0 fallos, 2 `todo` nuevos: **F4** (email case-sensitive según la ruta de alta) y **F5** (conversaciones activas duplicadas bajo concurrencia).
- Base de dev solo leída (`BEGIN READ ONLY`); conteos idénticos antes y después. Base de pruebas sin restos.

---

## 2026-09-19 — UX del checkout: confirmación del pago y vuelta al panel

**Qué cambió**

De **437** a **446** casos. Nueve casos nuevos, todos alrededor de una misma
pregunta: qué ve el cliente entre que paga y que el webhook confirma.

| Suite | Casos nuevos | Qué cubre |
|---|---|---|
| `tests/http/billing-checkout.http.test.ts` | +3 (14 → 17) | `redirect_url` construido desde `FRONTEND_URL`, el desglose de suscripción recurrente visible, y que un `redirectUrl` mandado por el navegador se rechaza (open redirect) |
| `tests/http/lemonsqueezy-webhook.http.test.ts` | +3 (37 → 40) | `accessState = PENDING_CONFIRMATION` tras `subscription_created`, `ALLOWED` tras el pago, y que ni un tenant nuevo ni una correlación `INVALID` dejan a nadie esperando |
| `tests/lemonsqueezy-first-payment-unit.test.ts` | +3 (13 → 16) | Estáticas sobre el frontend: el overlay no se cierra solo al pagar, nadie navega a mano en `Checkout.Success`, y las dos pantallas de compra bloquean TODOS los planes mientras se confirma |

**Por qué**

Las tres protegen invariantes de dinero, no de estilo: cerrar el overlay dejaba
al cliente sin la confirmación de LemonSqueezy y sin su botón "Continuar";
dejar los planes activos mientras se confirma permite un segundo cobro; y un
`redirect_url` elegido por el navegador es un open redirect con la marca de
Sendwary.

**Verificado ejecutando**

`npm test` → 446 casos, 0 fallos, 3 `todo` (F2 ×2, F3 ×1, sin cambios).
Backend `typecheck`/`build` y frontend `tsc -b && vite build` en verde.

---

## 2026-09-17 — Primer pago de LemonSqueezy: quién puede activar una suscripción

**Qué cambió**

De **355** a **437** casos. El cambio de fondo no es cuántas pruebas hay, sino
qué invariante protegen: **`subscription_created` dejó de conceder acceso**. La
única autoridad que crea y activa una Subscription es
`subscription_payment_success` con `billing_reason=initial` y `status=paid`.

| Pieza | Casos | Comando | Qué cubre |
|---|---|---|---|
| `tests/http/lemonsqueezy-webhook.http.test.ts` (reescrita) | 37 | `test:http:lswebhook` | Correlación sin activación, primer pago que sí activa, factura `pending`/`renewal` que no, carrera de webhooks en los dos órdenes, variante manipulada, tenant inexistente, dos pagos simultáneos → una sola suscripción, API de LS caída → 503 reintentable |
| `tests/lemonsqueezy-first-payment-unit.test.ts` (nueva) | 13 | `test:unit` | Lectura de la factura y de la suscripción de LS (nada se asume por defecto), idempotencia del primer pago y **estática sobre el frontend**: ninguna pantalla de billing se da por pagada |
| `tests/helpers/lemonsqueezy-fixtures.ts` (nuevo) | — | — | Payload real de `subscription-invoices` y respuesta de `GET /v1/subscriptions/:id`, que las pruebas pueden hacer mentir para comprobar la validación cruzada |

También quedaron documentadas en el inventario dos suites que ya existían y
faltaban: `billing-checkout.http.test.ts` (14) y `lemonsqueezy-unit.test.ts` (18).

**Por qué**

La suite anterior daba por buena la regla vieja: afirmaba que tras
`subscription_created` el tenant ya tenía plan activo. Eso es exactamente lo que
había que dejar de permitir — LemonSqueezy crea la suscripción antes de
confirmar el cobro — así que las afirmaciones se invirtieron en vez de añadir
casos encima.

**Verificado ejecutando**

`npm test` → 437 casos, 0 fallos, 3 `todo` (F2 ×2, F3 ×1, sin cambios).
`npm run typecheck`, `npm run build` (backend) y `tsc -b && vite build`
(frontend) en verde.

---

## 2026-09-14 — Suites de AGENTS, CONVERSATIONS e intervención humana

**Qué cambió**

De **300** casos a **355**. Dos suites HTTP nuevas, dos helpers nuevos y un
cambio en la limpieza compartida:

| Pieza | Casos | Comando | Qué cierra |
|---|---|---|---|
| `tests/http/agents.http.test.ts` | 24 (2 `todo`) | `test:http:agents` | CRUD de agentes, soft delete, activar/desactivar, mapeo de `basePrompt`/`aiModel`, asociación de número, ownership entre empresas, prueba del agente en dry-run |
| `tests/http/conversations.http.test.ts` | 31 (1 `todo`) | `test:http:conversations` | Webhook → contacto → conversación → IA → respuesta; takeover, bot pausado, respuesta humana, retorno al bot, escalamiento, CLOSED, agente DISABLED, aislamiento de las acciones del Inbox |
| `tests/helpers/external-mocks.ts` | — | — | Dobles de OpenAI (`globalThis.fetch`) y de Meta (`axios.defaults.adapter`), con registro de llamadas y bloqueo de cualquier otro host |
| `tests/helpers/whatsapp.ts` | — | — | Payload sintético de Meta, `deliverWebhook` (controlador real, esperado), integración CONNECTED con token falso cifrado |
| `tests/helpers/http.ts` | — | — | `putAs`, `patchAs`, `deleteAs` |
| `tests/helpers/factories.ts` | — | — | `cleanupTestData()` borra también los `AgentLog` de los tenants de prueba (esa tabla no tiene FK: sin esto quedaban huérfanos) |

`npm run test:http` pasa a encadenar 8 suites (las dos nuevas al final).

**Por qué**

El núcleo del producto —un cliente escribe, el bot responde, un humano toma el
control— no tenía **ninguna** prueba de lógica: solo su aislamiento. Y el
runtime de IA figuraba como "no probable" por falta de mocks de OpenAI.

**Decisiones de diseño**

- **Dobles propios, sin nock ni MSW.** El SDK de OpenAI captura
  `globalThis.fetch` al construir el cliente, y ese cliente es un singleton
  perezoso: basta con sustituir `fetch` antes de la primera llamada. Meta usa la
  instancia por defecto de axios. Así se ejercita el runtime **real** (contexto,
  prompt, veredicto de calidad, persistencia) y solo se corta el último salto
  a la red. Cualquier otro host lanza.
- **Se afirma sobre la llamada que habría salido**, no solo sobre la base: qué
  modelo, qué prompt de sistema, qué historial, a qué número, qué texto y **con
  qué token**. Es lo que permite probar `basePrompt`, `aiModel` y que un
  agente desactivado no procese sin credenciales de OpenAI.
- **El webhook se invoca por su controlador y se espera.** Por HTTP responde 200
  antes de procesar, así que Supertest vuelve antes de que exista el mensaje. La
  ruta HTTP tiene su propia prueba con espera activa y techo de 15 s.
- **Fallas del producto como `todo`.** La prueba lleva la expectativa correcta
  y `{ todo: "FALLA ABIERTA Fn" }`: se ejecuta, se ve en rojo en la salida y en
  `ℹ todo`, pero no rompe el exit code, así que el resto de la suite sigue
  midiendo. Se quita el `todo` cuando el fallo se corrija. Convención
  documentada en `TEST_INVENTORY.md` y `LOCAL_QA_RUNBOOK.md` §6.

**Comportamiento del sistema que no estaba documentado y ahora sí**

1. **No existe `POST /api/conversations`**: una conversación solo nace de un
   mensaje entrante, y nace `BOT_ACTIVE`. El contacto nace `CONTACT` con
   `source: WHATSAPP`.
2. **Estados reales:** `OPEN · BOT_ACTIVE · HUMAN_ACTIVE · CLOSED`. El bot solo
   se pausa en `HUMAN_ACTIVE`. Tabla completa en `LOCAL_QA_MATRIX.md`.
3. **`DELETE /api/agents/:id` es soft delete** (`DISABLED`) y es idempotente.
4. **Un agente `DISABLED` no atiende su número**; si el tenant tiene otro agente
   activo, ese atiende por el fallback de la integración CONNECTED. Si no hay
   ninguno, **el mensaje entrante se descarta sin guardarse** (riesgo R10).
5. **`takeover` reabre** una conversación `CLOSED` como `HUMAN_ACTIVE`.

**Fallas del producto encontradas** (reportadas, **no corregidas**: en QA no se
toca código funcional)

- 🔴 **F2** — un tenant puede asignarse el `phoneNumberId` de otro por
  `PUT /api/agents/:id` y el webhook le entrega los mensajes de sus clientes.
  **Viola el invariante 3**: la pasada se detuvo.
- 🟠 **F3** — `getConversationHistory()` devuelve los 20 mensajes **más
  antiguos**: el Inbox y la IA pierden el final de los hilos largos.

**Verificado ejecutando (2026-09-14)**

`npm run test:http:agents` → exit 0 · 24 tests · 22 pass · 0 fail · 2 todo.
`npm run test:http:conversations` → exit 0 · 31 tests · 30 pass · 0 fail · 1 todo.
`npm run typecheck` → exit 0. Lint del backend: 8 errores, los de la línea base,
0 nuevos. El `npm test` completo **no** se re-ejecutó (detención por el
invariante 3): las 300 pruebas anteriores siguen verificadas a 2026-09-10, no
con el `cleanupTestData()` nuevo. Detalle en `LAST_QA_REPORT.md`.

---

## 2026-09-10 — Suite de AUTH, COOKIES, ROLES, SUPER_ADMIN y aislamiento

**Qué cambió**

De **206** casos a **300**. Tres suites HTTP nuevas, una unitaria nueva y siete
casos añadidos a la suite de auth existente:

| Suite | Casos | Comando | Qué cierra |
|---|---|---|---|
| `tests/http/register.http.test.ts` | 30 | `test:http:register` | `POST /api/auth/register` no tenía **ninguna** prueba (hueco #4) |
| `tests/http/tenant-isolation.http.test.ts` | 38 | `test:http:isolation` | Aislamiento recurso por recurso en 7 módulos + dashboard |
| `tests/http/activation-gates.http.test.ts` | 14 | `test:http:gates` | El SUPER_ADMIN frente a los **tres** gates comerciales |
| `tests/frontend-auth-storage.test.ts` | 5 | `test:unit` | Que el panel no guarde credenciales en el navegador |
| `tests/http/auth.http.test.ts` | 14 → **21** | `test:http:auth` | Cookie sin `Secure` en local, `Max-Age`, borrado con los mismos atributos, logout idempotente, cierre de una sola sesión |

Infraestructura nueva: **`tests/helpers/fixtures.ts`** — recursos con dueño
(agente, cliente, conversación, servicio, producto, cita, integración de
WhatsApp) y `createTenantResources()`, que monta una empresa entera. Se crean
con Prisma y no por HTTP a propósito: si el endpoint de alta se rompiera, la
prueba de aislamiento debe seguir diciendo la verdad. Se borran por el
`onDelete: Cascade` del tenant, con el mismo `cleanupTestData()` de siempre —
no hay un segundo punto de limpieza que mantener.

**Por qué**

Cinco de los ocho invariantes que `QA_RULES.md` §6 declara "detienen la pasada"
dependían de estas áreas, y tres de ellos no tenían cobertura: el registro
(puerta de entrada de todo cliente), el SUPER_ADMIN frente a la verificación de
correo y a la implementación (solo estaba probado el paywall), y el aislamiento
más allá de `/api/agents`.

**Decisiones de diseño**

- **Cuatro casos por módulo en el aislamiento**, no uno: A lee lo suyo (200) ·
  A lee lo de B (nunca 200) · A escribe sobre lo de B (nunca 2xx **y se
  comprueba en la base que B no cambió**) · el listado de A no menciona a B.
  Sin el primero, un endpoint que respondiera 404 a todo daría un verde falso;
  sin el tercero, un GET protegido con un PUT abierto pasaría desapercibido.
- **Los gates, por contraste.** Para cada uno de los tres se prueba primero un
  tenant que **sí** queda bloqueado y después el SUPER_ADMIN que no. Un
  endpoint que no aplicara ningún gate pasaría la mitad "buena" de la prueba.
- **La prueba del frontend es estática y duplica una regla de ESLint** ya
  existente. A propósito: un `eslint-disable` apaga la regla; la prueba no.
  Lleva allowlist de preferencias de interfaz, así que cualquier uso **nuevo**
  de `localStorage` obliga a decidir explícitamente si es una credencial.

**Comportamiento del sistema que no estaba documentado y ahora sí**

1. **El registro NO crea empresa.** El usuario nace con `tenantId: null`, rol
   `OWNER` y `emailVerifiedAt: null`; la empresa la crea el onboarding. Está en
   `LOCAL_QA_MATRIX.md` (fila Auth) porque una prueba que espere lo contrario
   está mal escrita.
2. **Un recurso de otra empresa responde 404, no 403** — un 403 confirmaría que
   el id existe.
3. **`GET /api/integrations/whatsapp` devuelve el `verifyToken` del tenant** a
   su propio OWNER/ADMIN: es el valor que el cliente pega en el panel de Meta.
   El que nunca sale es el **access token** (solo `hasToken` + `tokenLastFour`).
   La primera versión de la prueba lo daba por fuga; se corrigió la prueba, no
   el código.
4. **`?tenantId=` solo lo honra un SUPER_ADMIN.** Para cualquier otro rol
   `resolveTenantId()` usa el tenant de la sesión y el parámetro se ignora.
5. **El rate limiting está desactivado en pruebas por código**, no solo por
   `.env.test`: `makeLimiter()` incluye `skip: NODE_ENV === "test"`.

**Verificado ejecutando (2026-09-10)**

`cd backend && npm test` → **300/300 verdes, exit 0**. Detalle por suite y
riesgos en `LAST_QA_REPORT.md`.

---

## 2026-09-10 — Pre-flight de QA local (`qa:preflight`)

**Qué cambió**

- **`scripts/qa-preflight.mjs`** (nuevo, en la raíz): un solo comando que
  verifica que el repositorio está en condiciones de ser probado. 47
  comprobaciones sobre los tres paquetes, agrupadas en dependencias · lint ·
  tipos · builds · Prisma · variables de entorno · secretos · configuración.
  Node puro, sin dependencias nuevas: no hay nada que instalar.
- **Tres scripts en `backend/package.json`** (no tocan ninguno de los
  existentes):

  | Script | Qué hace | Duración |
  |---|---|---|
  | `npm run qa:preflight` | Todo | ~6 min |
  | `npm run qa:preflight:quick` | Sin builds | ~2 min |
  | `npm run qa:env` | Solo entorno, secretos y configuración | ~10 s |

- `LOCAL_QA_RUNBOOK.md`: **fase 0.5** nueva, antes de la auditoría del cambio.
  Las fases 2, 3 y 7 quedan marcadas como ya cubiertas por ella. La fase 8 pasa
  a llevar la lista completa de comprobaciones manuales (grupos A-G).
- `TEST_INVENTORY.md`: sección propia del pre-flight, separada de los 206 casos
  para que nadie los sume: **no son pruebas**.

**Por qué**

Las fases 4-6 tardan ~8 minutos. Ejecutarlas sobre un árbol que no compila, con
una variable de entorno ausente o con dependencias a medio instalar produce
fallos en cascada que no significan nada y cuestan una pasada entera. El
pre-flight falla en 10 segundos por lo que se puede saber en 10 segundos.

Además convierte en comprobación automática tres cosas que hasta ahora dependían
de que alguien se acordara: la línea base de 8 errores de lint (antes había que
contarlos a mano), la ausencia de secretos del backend en el bundle público, y
el `healthcheckPath` de `railway.json` (riesgo **R5**, que hasta ahora solo
existía como nota en un reporte).

**Decisiones de diseño**

- **Ninguna suite, ninguna escritura.** El único comando que toca PostgreSQL es
  `prisma migrate status`, de solo lectura, y se desactiva con `--skip-db`.
- **Los valores de las variables nunca salen por stdout.** Solo `PRESENT`,
  `MISSING` o `INVALID CONFIGURATION`; las URL de base de datos van
  enmascaradas. Los valores se leen en memoria únicamente para comprobar que no
  aparecen dentro de `frontend/dist` ni `webpage/dist` — la comprobación de fuga
  se hace por **valor** (no por nombre), que es la única que demuestra algo, y
  si hubiera fuga se reporta el nombre de la variable y el archivo, jamás el
  valor.
- **Severidad por contenido, no por nombre.** Un `.env` versionado que solo
  tiene variables `VITE_` públicas es `WARN`; con un secreto dentro sería
  `FAIL`. Un `DATABASE_URL` de `localhost` en una plantilla no es una filtración.
- **La línea base de lint vive en el script** (`BACKEND_LINT_ERROR_BASELINE`),
  no en la cabeza de quien ejecuta: 8 → `WARN`, 9 → `FAIL`.

**Verificado ejecutando (2026-09-10)**

`node scripts/qa-preflight.mjs` → exit 1 · **39 PASS · 1 FAIL · 7 WARN · 0 SKIP**
en 175 s (una pasada anterior, sin la comprobación del healthcheck, tardó 334 s
con los builds en frío). El único `FAIL` es R5, que ya estaba documentado y **no
se corrigió**: es un bug de configuración de despliegue, no de la infraestructura
de QA. Evidencia completa en `LAST_QA_REPORT.md`.

---

## 2026-09-10 — Sistema permanente de documentación QA

**Qué cambió**

Se creó el conjunto de documentos que convierte el trabajo de los pasos 2, 3 y 5
en un sistema consultable por cualquier sesión futura:

| Documento | Función |
|---|---|
| `README.md` | Punto de entrada obligatorio |
| `QA_RULES.md` | Reglas permanentes y los 8 estados válidos |
| `LOCAL_QA_RUNBOOK.md` | Orden oficial de ejecución (9 fases) |
| `LOCAL_QA_MATRIX.md` | Qué probar según el módulo tocado |
| `TEST_INVENTORY.md` | Inventario real de las 12 suites |
| `ENVIRONMENT_MATRIX.md` | LOCAL en detalle; el resto declarado como inexistente |
| `QA_REPORT_TEMPLATE.md` | Formato estándar de reporte |
| `LAST_QA_REPORT.md` | Resultado de la pasada más reciente |
| `QA_CHANGELOG.md` | Este archivo |

**Por qué**

Los documentos previos (auditoría, base de pruebas, lint, pruebas HTTP)
describían *lo que se hizo*. Faltaba lo que dice *cómo trabajar*: orden de
ejecución, qué probar según el cambio, qué estados existen y qué está prohibido.

**Verificado ejecutando (2026-09-10)**

Todos los comandos citados en estos documentos se ejecutaron antes de escribirlos:
**206/206 casos verdes**, typecheck exit 0, los dos builds de front exit 0.
Evidencia completa en `LAST_QA_REPORT.md`.

**Nota:** `npm run lint` del backend devuelve exit 1 por 8 errores preexistentes.
Está documentado como excepción conocida en `QA_RULES.md` §7; no se maquilló para
que pareciera verde.

---

## 2026-09-09 — Paso 5: pruebas HTTP con Supertest

**Qué cambió**

- Instalados `supertest` y `@types/supertest`.
- **38 pruebas HTTP** en `backend/tests/http/`: `auth` (14), `roles` (12),
  `superadmin` (12).
- Helpers compartidos: `tests/helpers/factories.ts` y `tests/helpers/http.ts`.
- Scripts nuevos: `test:http`, `test:http:auth`, `test:http:roles`,
  `test:http:superadmin`. `npm test` pasa a incluir la capa HTTP.
- Guarda `[DEBUG-AUTH]` cambiada de `NODE_ENV !== "production"` a
  `NODE_ENV === "development"` en `auth.middleware.ts`, `roles.middleware.ts`,
  `auth.service.ts` y `auth.controller.ts`: en `test` inundaba la salida.

**Por qué**

226 endpoints sin una sola prueba, y ninguna verificación de los middlewares de
autenticación, roles y paywall (hallazgo H3).

**Decisión de diseño**

El invariante de SUPER_ADMIN se prueba con **middlewares aislados**
(`middlewareApp()`), no contra rutas reales. La primera versión probaba
`POST /api/agents` y recibía 403 de `requireRole` sin llegar nunca al paywall:
parecía verificar el bypass y no lo tocaba. Cada bypass se prueba ahora **por
contraste** (caso bloqueado + caso permitido + caso excepcional).

**Verificado:** 206/206 verdes. Detalle en `QA_HTTP_TESTS.md`.

---

## 2026-09-09 — Paso 3: lint real y typecheck de pruebas

**Qué cambió**

- `frontend/eslint.config.js` y `webpage/eslint.config.js` (nuevos). En `webpage`
  hubo que **instalar** ESLint: el script `lint` existía sin la dependencia.
- `backend/eslint.config.js` + ESLint instalado. El script `lint` era
  `echo "Lint pendiente de configurar"`: pasaba siempre sin analizar nada.
- `backend/tsconfig.test.json`: `tests/`, `scripts/`, `seed.ts` y
  `prisma.config.ts` entran por fin al compilador. Pasó limpio a la primera.
- Scripts nuevos: `lint:fix`, `typecheck:src`, `typecheck:test`.
- Dos reglas `no-restricted-syntax` que convierten invariantes en verificación
  automática: credenciales en `localStorage` (frontend) y secretos en
  `res.json()` (backend).

**Bug encontrado y corregido**

`OnboardingPage.tsx` llamaba `useState` **después** de un `return` condicional.
El número de hooks cambiaba entre renders: si `emailVerified` pasaba de `false` a
`true` sin desmontar, React rompía la pantalla. Se movió la guarda debajo de
todos los hooks. **Es el primer bug que encuentra la infraestructura de QA.**

**Falsos positivos verificados uno por uno**

- `useTemplate` en `AutomationsPage` no es un hook; la regla solo mira el prefijo.
  Se añadió `eslint-disable` con explicación.
- Los 8 errores del backend: `\-` dentro de clases de caracteres (equivalente a
  `-`, `sanitizeErrorText` funciona), un BOM UTF-8 literal en la regex que limpia
  CSVs de Excel, un tipo `{}` y dos `prefer-const`. Ninguno es un bug; se dejaron
  sin corregir a propósito.

---

## 2026-09-09 — Paso 2: baseline de migraciones y base de pruebas

**Qué cambió**

- Migración `20260909221900_catchup_schema_modulos_0_4` (1043 líneas): el diff
  exacto entre el historial y `schema.prisma`. Sin `DROP TABLE`, `DROP COLUMN`,
  `TRUNCATE` ni `DELETE` — verificado antes de guardarla.
- Bases nuevas: `ferreteria_ai_agent_test` y `ferreteria_ai_agent_shadow`.
- `tests/setup/use-test-db.ts`: guarda que aborta si la base no termina en
  `_test`. Cubre también `DATABASE_POOL_URL`, que en `prisma.ts` tiene prioridad.
- `scripts/setup-test-db.ts` + script `test:db:setup`.
- `.env.test.example` (versionado) y `.env.test` (ignorado).
- `prisma.config.ts`: `shadowDatabaseUrl` opt-in por `SHADOW_DATABASE_URL`.
- Los `test:db:*` pasan a cargar la guarda con `--import`.

**Por qué**

La base tenía 43 tablas y solo 3 migraciones registradas (hallazgo H1): no se
podía reconstruir el esquema desde cero, así que no había base de pruebas posible
ni CI reproducible. Y las 5 suites de integración escribían en la base de
**desarrollo** (H2).

**Cómo se hizo sin riesgo**

Backup previo con `pg_dump -Fc`. En dev solo se ejecutó
`migrate resolve --applied`, que inserta una fila en `_prisma_migrations` y no
toca ninguna tabla. Datos verificados idénticos antes y después.

**Verificado:** `migrate deploy` sobre la base vacía reconstruyó las 43 tablas y
el diff contra `schema.prisma` salió vacío. Las 112 pruebas de integración se
ejecutaron por primera vez: **112/112**. Detalle en `QA_TEST_DATABASE.md`.

**Deuda registrada:** producción necesita su propio `migrate resolve --applied`
antes del primer `migrate deploy`, o el despliegue se bloqueará.

---

## 2026-09-09 — Auditoría inicial (revisión 2)

Re-verificación completa del estado de QA ejecutando comandos, no leyendo código.
Resultado: 5 hallazgos (H1–H5), 13 riesgos (R1–R13) y clasificación de 17 áreas.
Documento: `QA_INITIAL_AUDIT.md`.

Delta respecto a la revisión 1 (2026-08-25): +29 endpoints, **0 pruebas nuevas**,
0 hallazgos resueltos en 15 días. Fue lo que motivó ejecutar el plan.

---

## 2026-08-25 — Auditoría inicial (revisión 1)

Primera auditoría del estado de QA. Estableció el plan de 8 pasos que se ha
seguido desde entonces.
