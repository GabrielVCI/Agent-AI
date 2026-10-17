# TEST_INVENTORY — Inventario real de pruebas

> Lista **solo** lo que existe en el repositorio. **355 casos** a 2026-09-14.
>
> - 2026-09-10 — `npm test` completo: **300 / 300 verdes**.
> - 2026-09-14 — las dos suites nuevas (`agents`, `conversations`): **55 casos,
>   52 verdes + 3 `todo` que fallan a propósito** (fallas abiertas F2 y F3, ver
>   abajo). Exit 0 en ambas. El `npm test` completo con los 355 **no se
>   re-ejecutó**: la pasada se detuvo por el invariante 3 (`LAST_QA_REPORT.md`).
> - 2026-09-23 — tras corregir F2–F5: `npm test` completo **463 / 463 verdes,
>   0 `todo`** (exit 0).
>
> Mantener este documento al día es obligatorio: si se añade o se borra una
> suite, se actualiza aquí y en `QA_CHANGELOG.md` en el mismo cambio.

---

## Resumen

| Capa | Archivos | Casos | Necesita base de datos | Comando |
|---|---|---|---|---|
| Unitarias | 7 | **95** | No | `npm run test:unit` |
| Integración | 6 | **129** | Sí (`ferreteria_ai_agent_test`) | `npm run test:db` |
| HTTP | 10 | **239** | Sí | `npm run test:http` |
| **Total** | **23** | **463** (0 `todo`) | | `npm test` |

**Frontend: 0 pruebas funcionales.** No existe runner (ni Vitest ni Jest ni RTL).
Lo único que se comprueba del panel es **estático**:
`tests/frontend-auth-storage.test.ts` lee su código fuente para garantizar que
no guarda credenciales en el navegador.
**Webpage: 0 pruebas.**
**E2E: 0 pruebas.** No existe Playwright ni Cypress.
**Cobertura: no se mide.** No hay c8 ni nyc instalados.

Todo vive en `backend/tests/`.

---

## Unitarias — sin base de datos

`npm run test:unit` · ~5 s

| Archivo | Casos | Qué cubre |
|---|---|---|
| `tests/automation-unit.test.ts` | 22 | Condiciones de reglas, render de plantillas, cálculo de horarios, `sanitizeErrorText()` |
| `tests/customer-unit.test.ts` | 13 | Normalización E.164, máscara de teléfono en logs, política de nombres |
| `tests/service-history-unit.test.ts` | 12 | Recurrencias: "1 mes ≠ 30 días", DST, fin de año, identidad cliente+servicio |
| `tests/customer-categories-unit.test.ts` | 9 | Slugs, unicidad, nombres de categoría |
| `tests/frontend-auth-storage.test.ts` | 5 | **Estática sobre `frontend/src`**: ninguna clave de `localStorage`/`sessionStorage` parece una credencial, toda clave usada está en la allowlist de preferencias, el cliente HTTP usa `credentials: 'include'` y nadie construye cabeceras `Bearer` |
| `tests/lemonsqueezy-unit.test.ts` | 18 | Mapeo de estados de LemonSqueezy, firma HMAC del webhook (cuerpo alterado, firma corta, sin cabecera), clave de idempotencia y traducción de errores del proveedor (el texto de LS nunca llega al cliente) |
| `tests/lemonsqueezy-first-payment-unit.test.ts` | 16 | Lectura de la **factura** (`billing_reason`/`status` nunca se asumen) y de la suscripción de LS, idempotencia del primer pago, y **estática sobre `frontend/src`**: ninguna pantalla de billing decide el pago por su cuenta (ni por query param ni por almacenamiento del navegador), el overlay no se cierra solo al pagar y todos los planes se bloquean mientras se confirma |

Código bajo prueba: `src/utils/phone.ts`, `src/utils/timezone.ts`,
`src/services/customer/customer-names.ts`,
`src/services/automation/` (condiciones, render, horarios, errores),
`src/services/appointment/service-recurrence.ts`.

---

## Integración — PostgreSQL real

`npm run test:db` · ~3 min · escriben en `ferreteria_ai_agent_test`

| Archivo | Casos | Comando individual | Qué cubre |
|---|---|---|---|
| `tests/customer-categories.test.ts` | 34 | `npm run test:db:categories` | Categorías, segmentación, VIP reflejado desde `Customer.isVip` |
| `tests/customer-master.test.ts` | 21 | `npm run test:db:customers` | Alta y búsqueda de clientes, importación CSV/XLSX, métricas, aislamiento por empresa |
| `tests/service-history.test.ts` | 21 | `npm run test:db:history` | `AppointmentLine`, snapshots, visitas, recurrencias |
| `tests/maintenance.test.ts` | 20 | `npm run test:db:maintenance` | Módulo de mantenimientos |
| `tests/automation-engine.test.ts` | 16 | `npm run test:db:automation` | Motor de eventos/reglas/jobs, `SKIP LOCKED`, empresa suspendida, envío entre empresas bloqueado |
| `tests/db-integrity.test.ts` | 17 | `npm run test:db:integrity` | Unique, FKs y `ON DELETE`, nullability, defaults, rollback, carreras (cliente, idempotencia, conversación activa). Ver `QA_DATABASE.md` |

Estas suites traen sus **propias** factories internas (prefijo `__*_test__` por
módulo) y aún **no** usan los helpers compartidos. Unificarlas está pendiente
(paso 4 del plan, parcial).

---

## HTTP — Supertest sobre la app real

`npm run test:http` · ~6-7 min

| Archivo | Casos | Comando individual | Qué cubre |
|---|---|---|---|
| `tests/http/auth.http.test.ts` | 21 | `npm run test:http:auth` | Login, anti-enumeración, usuario DISABLED, atributos de la cookie (incluido **sin `Secure` en local** y `Max-Age`), logout con revocación en servidor, borrado de cookie con los mismos atributos, cierre de una sola sesión |
| `tests/http/register.http.test.ts` | 30 | `npm run test:http:register` | `POST /api/auth/register`: alta correcta, hash bcrypt, sesión iniciada, token de verificación, correo duplicado (409, también en mayúsculas), payload incompleto campo por campo, las 5 reglas de contraseña, `confirmPassword`, y que **rol y tenantId no se pueden fijar desde el payload** |
| `tests/http/roles.http.test.ts` | 12 | `npm run test:http:roles` | `requireAuth`, `requireRole`, `requireSuperAdmin`, aislamiento entre empresas |
| `tests/http/superadmin.http.test.ts` | 12 | `npm run test:http:superadmin` | Bypass de paywall y de `requireTenantAccess`, con y sin correo verificado |
| `tests/http/activation-gates.http.test.ts` | 14 | `npm run test:http:gates` | Los **tres gates comerciales** sobre `GET /api/billing/activation-status`: verificación de correo, implementación y paywall. Cada uno con su contraste (un tenant que sí queda bloqueado) y con el SUPER_ADMIN que no |
| `tests/http/tenant-isolation.http.test.ts` | 38 | `npm run test:http:isolation` | Aislamiento entre empresas recurso por recurso: agents, customers, conversations, catálogo (servicios y productos), appointments, integraciones de WhatsApp, facturación y dashboard |
| `tests/http/agents.http.test.ts` | 24 | `npm run test:http:agents` | Alta, edición, activar/desactivar, **soft delete** (DELETE = `DISABLED`; la fila y sus conversaciones se conservan), mapeo `basePrompt→systemPrompt` y `aiModel→openAiModel` en la API **y** en la base, permisos de AGENT_OPERATOR, asociación de número de WhatsApp, aislamiento de los cinco verbos entre empresas, `POST /:id/test` en dry-run con OpenAI simulado (modelo y prompt verificados en la llamada). Incluye la regresión de **F2** (corregida 2026-09-23) |
| `tests/http/conversations.http.test.ts` | 31 | `npm run test:http:conversations` | Webhook de Meta con payloads sintéticos → contacto + conversación BOT_ACTIVE, INBOUND/OUTBOUND, orden, historial que recibe la IA, idempotencia ante reintentos, envío con el token **de la integración del tenant**, **takeover → HUMAN_ACTIVE → el bot calla → el humano responde → release → el bot vuelve**, escalamiento pedido por la IA, CLOSED, aislamiento de takeover/release/reply/close, **agente DISABLED**, `GET` de verificación y `POST` por la ruta HTTP pública. Incluye la regresión de **F3** (corregida 2026-09-23) |
| `tests/http/billing-checkout.http.test.ts` | 17 | `npm run test:http:checkout` | `POST /api/billing/create-checkout`: el navegador solo manda `planId`, el backend resuelve store y variante, `custom_data` con tenant/user/plan, el `redirect_url` construido desde `FRONTEND_URL` (el navegador no puede elegirlo), el desglose de suscripción visible, y cada familia de error de LemonSqueezy traducida sin filtrar la API key |
| `tests/http/lemonsqueezy-webhook.http.test.ts` | 40 | `npm run test:http:lswebhook` | Alta completa: firma, `subscription_created` que **correlaciona sin activar**, primer pago (`initial`+`paid`) que crea la Subscription, factura `pending`/`renewal` que no activa, carrera de webhooks en los dos órdenes, variante manipulada, tenant inexistente, dos pagos simultáneos → una sola suscripción, API de LS caída → 503 reintentable, y el `accessState` que evita el doble cobro cuando el cliente vuelve antes que el webhook |

Montan `app` desde `src/app.ts` — **no** `server.ts`, que es quien arranca el
worker de automatizaciones. La autenticación es real: cada prueba hace
`POST /api/auth/login` y reenvía la cookie que devuelve el servidor.

### OpenAI y Meta: dobles, nunca red

`agents` y `conversations` ejecutan el runtime de IA y el envío por WhatsApp
**de verdad**, con los dos servicios externos sustituidos por
`tests/helpers/external-mocks.ts`. La prueba afirma sobre la llamada que
**habría salido**: modelo, mensaje de sistema (donde viaja el `basePrompt`),
historial, destinatario, texto y cabecera `Authorization`. Cualquier URL que no
sea `api.openai.com` o `graph.facebook.com` lanza: una prueba que intente salir
a internet falla.

Los mensajes entrantes pasan por el **controlador real** del webhook
(`deliverWebhook`), esperando a que termine: por HTTP no se puede, porque el
controlador responde 200 a Meta antes de procesar. La ruta HTTP pública tiene
su propia prueba, con espera activa sobre la base.

### Fallas abiertas registradas como `todo`

Una prueba que detecta un fallo **real del producto** se deja escrita con la
expectativa correcta y la opción `{ todo: "FALLA ABIERTA Fn — …" }`. El runner
la **ejecuta**, la muestra con `✖ … # FALLA ABIERTA Fn` y la cuenta en
`ℹ todo`, pero no rompe el exit code: el resto de la suite sigue midiendo.

- `ℹ todo` distinto de 0 = hay fallas abiertas. **No es un verde.**
- Cuando se corrija el fallo, la prueba pasa sola: entonces se **quita** el
  `todo`, para que una regresión futura sí rompa la suite.
- Hoy: ninguna. F2, F3, F4 y F5 se corrigieron el 2026-09-23 y sus pruebas quedaron como regresiones normales.

### El patrón de las pruebas de aislamiento

Cada módulo se prueba con los mismos cuatro casos, y los cuatro hacen falta:

1. **A lee lo suyo → 200.** Sin esto, un endpoint roto que respondiera 404 a
   todo daría un verde falso.
2. **A lee lo de B por id → nunca 200** (el backend responde 404).
3. **A escribe sobre lo de B → nunca 2xx**, y además se comprueba **en la base**
   que el recurso de B no cambió. Leer y escribir se autorizan por separado.
4. **El listado de A no menciona ni el id ni el tenantId de B.**

Los recursos se crean con Prisma (`tests/helpers/fixtures.ts`), no por HTTP: si
el endpoint de alta se rompiera, la prueba de aislamiento debe seguir diciendo
la verdad.

### Endpoints que estas suites tocan

```
POST /api/auth/login · register · logout       GET /api/auth/me
GET  /api/billing/activation-status · subscription · status · usage
GET  /api/agents · /api/agents/:id             POST/PUT/DELETE /api/agents(/:id)
GET  /api/customers · /:id · /:id/timeline · /counters   PATCH /api/customers/:id
GET  /api/conversations · /:id · /:id/messages           POST /api/conversations/:id/close
GET  /api/catalog/items · /items/:id           PUT/DELETE /api/catalog/items/:id
GET  /api/appointments · /:id                  POST /api/appointments/:id/cancel · /reschedule
GET  /api/integrations/whatsapp · /whatsapp/health
GET  /api/dashboard/summary                    GET /api/admin/tenants
PATCH /api/agents/:id/status                   POST /api/agents/:id/test
POST /api/conversations/:id/takeover · /release-to-agent · /reply
GET  /api/whatsapp/meta (verificación)         POST /api/whatsapp/meta (webhook)
```

De los **226 endpoints** del backend, estas suites tocan **41**. El resto no
tiene ninguna prueba HTTP.

---

## Infraestructura de pruebas

| Archivo | Función |
|---|---|
| `scripts/qa-preflight.mjs` (raíz) | **Pre-flight.** 47 comprobaciones estáticas sobre los tres paquetes: dependencias, lint, tipos, builds, Prisma, entorno, secretos y configuración. No es una suite de pruebas: no ejecuta casos ni escribe en ninguna base. Detalle abajo |
| `tests/setup/use-test-db.ts` | **Guarda de seguridad.** Carga `.env.test` y aborta si la base no termina en `_test`. Comprueba también `DATABASE_POOL_URL`. Fija `NODE_ENV=test` y `AUTOMATION_WORKER_ENABLED=false`. Se carga con `--import` |
| `tests/helpers/factories.ts` | `createTestTenant`, `createTestUser`, `createTenantWithOwner`, `giveActiveSubscription`, `cleanupTestData` (desde el 2026-09-14 borra también los `AgentLog` de los tenants de prueba: esa tabla guarda `tenantId` sin FK ni cascade). Prefijo `__http_test__` |
| `tests/helpers/fixtures.ts` | Recursos **con dueño** para las pruebas de aislamiento: `createTestAgent`, `createTestCustomer`, `createTestConversation`, `createTestCatalogItem` (PRODUCT/SERVICE), `createTestAppointment`, `createTestWhatsAppIntegration` y `createTenantResources` (una empresa entera, un recurso de cada tipo). Todo con prefijo y borrado por cascade al eliminar el tenant |
| `tests/helpers/http.ts` | `login`, `loginAs`, `getAs`, `postAs`, `putAs`, `patchAs`, `deleteAs`, `errorCode`, `sessionCookie`, `middlewareApp`, `probe` |
| `tests/helpers/external-mocks.ts` | **Dobles de OpenAI y de la Graph API de Meta**, sin dependencias nuevas: sustituye `globalThis.fetch` (el SDK de OpenAI lo captura al construir su cliente, que es perezoso) y `axios.defaults.adapter` (el que usa `meta-whatsapp.service.ts`). Registra cada llamada (`openAiCalls`, `metaCalls`), deja encolar la próxima decisión de la IA (`queueAiDecision`) y **lanza ante cualquier otro host** |
| `tests/helpers/whatsapp.ts` | `inboundPayload` (forma real del webhook de Meta), `deliverWebhook` (invoca el controlador real y **espera** a que termine), `createConnectedIntegration` (integración CONNECTED con un token falso cifrado con la `ENCRYPTION_KEY` de `.env.test`), `fakeWaId`, `fakeMessageId` |
| `scripts/setup-test-db.ts` | Crea y migra la base de pruebas; verifica que el esquema coincide con `schema.prisma`. Idempotente |
| `tsconfig.test.json` | Typecheck de `tests/`, `scripts/`, `seed.ts` y `prisma.config.ts` |

`middlewareApp()` monta una app mínima con middlewares reales para probarlos
**aislados**: contra rutas completas el resultado mezcla causas (ver
`QA_HTTP_TESTS.md` §4).

---

## Pre-flight — comprobaciones estáticas

`node scripts/qa-preflight.mjs` · ~6 min (o ~10 s con `npm run qa:env`)

No son casos de prueba y **no cuentan** dentro de los 300: son la fase 0.5 del
runbook, lo que debe estar verde antes de ejecutar una suite. Exit 0 = ningún
`FAIL`.

| Grupo | IDs | Qué comprueba |
|---|---|---|
| Dependencias | `DEP-node`, `DEP-*`, `DEP-*-lock` | Node ≥ 20 · `node_modules` presente · `npm ls --depth=0` sin conflictos · un solo lockfile por paquete |
| Lint | `LINT-be`, `LINT-fe`, `LINT-web` | ESLint en los tres paquetes. El backend se compara contra la **línea base de 8 errores**: iguales o menos → `WARN`; más → `FAIL` |
| Tipos | `TS-be`, `TS-fe`, `TS-web` | `npm run typecheck` (src + tests) y `tsc -b` en los dos frontales (`--noEmit` no valdría: hay project references) |
| Builds | `BUILD-be`, `BUILD-fe`, `BUILD-web` | `tsc` del backend y `vite build` de los dos frontales. El prerender de `webpage` (Puppeteer) degrada a `WARN` si falla solo él |
| Prisma | `PRI-1`, `PRI-2`, `PRI-3` | `prisma validate` · hay historial de migraciones · `prisma migrate status` (**solo lectura**; `--skip-db` lo omite) |
| Entorno | `ENV-0` … `ENV-T:*` | Presencia y **forma** de las variables de `src/config/env.ts`, reglas condicionales (`EMAIL_PROVIDER=resend` ⇒ `RESEND_APIKEY`, `COOKIE_SAMESITE=none` ⇒ `COOKIE_SECURE`, Embedded Signup, demo de WhatsApp, producción), `.env.test` apuntando a una base `_test`, y existencia de las cuatro plantillas |
| Secretos | `SEC-1` … `SEC-5` | Variables `VITE_` con nombre de secreto · **valores reales del backend dentro de `frontend/dist` y `webpage/dist`** · cadenas con forma de credencial en el bundle · `.env` versionados en git (severidad por contenido) · plantillas con credenciales de verdad |
| Configuración | `CFG-*` | `.gitignore` cubre `.env` · `dist/` fuera de git · el build usa `tsc -b` · la guarda y los scripts de prueba existen · **el `healthcheckPath` de `railway.json` corresponde a una ruta real** · los scripts que cita el runbook existen |

**Regla de secretos:** el script imprime solo `PRESENT`, `MISSING` o
`INVALID CONFIGURATION`, nunca un valor. Las URL de base de datos salen
enmascaradas. Los valores se leen en memoria únicamente para buscarlos dentro de
los bundles públicos; si hubiera fuga se reporta el **nombre** de la variable y
el archivo.

---

## Herramientas

**Instaladas y en uso:** `node:test` (runner nativo), `tsx`, `supertest`,
`cross-env`, `dotenv`, ESLint 9 + typescript-eslint (los tres paquetes),
`bcryptjs` y Prisma Client en las factories.

**No instaladas:** Vitest · Jest · React Testing Library · Playwright · Cypress ·
MSW · nock · jsdom · c8 / nyc · Testcontainers.

Los dobles de OpenAI y Meta (`tests/helpers/external-mocks.ts`) son código
propio sobre `fetch` y axios: no se instaló nock ni MSW.

---

## Huecos conocidos, por prioridad

| # | Área sin cobertura | Por qué importa |
|---|---|---|
| 1 | **Webhook de WhatsApp: firma HMAC y audio** | Verificación `GET`, parseo, ruteo e idempotencia ya los cubre `test:http:conversations`. La firma `X-Hub-Signature-256` **no se puede probar: el código no la valida** (riesgo R9). El audio entrante sigue sin prueba |
| 2 | **Frontend completo** | 32 páginas, 41 componentes, 0 pruebas funcionales. Incluye el gate `RequireActiveSubscription`, única parte del invariante SUPER_ADMIN sin cubrir (el **backend** de ese gate ya lo cubre `test:http:gates`) |
| 3 | **Billing**: firma del webhook de LemonSqueezy, cambios de plan, contadores | Toca dinero. El **aislamiento** de los datos de facturación sí está cubierto |
| 4 | **Google OAuth, reset de contraseña, uso del enlace de verificación** | Puerta de entrada de todo cliente nuevo. El registro en sí ya está cubierto (30 casos) |
| 5 | **Onboarding**: creación de la empresa, transiciones de `lifecycleStatus` | Decide qué ve un cliente recién registrado. La **lectura** del gate (`activation-status`) ya está cubierta |
| 6 | **Inbox**: etiquetas, asignación (`/assign`, `/unassign`), perfil de contacto, filtros y paginación | Estados, takeover, release, reply y cierre ya los cubre `test:http:conversations` |
| 7 | **Runtime de agentes: acciones** (catálogo, cotización PDF, citas), precheck y control de gasto | Los dobles de OpenAI ya existen (`external-mocks.ts`); faltan las pruebas. El camino básico (modelo, prompt, historial, respuesta, escalamiento) sí está cubierto |
| 8 | **Rate limiting, CORS, helmet, cifrado de tokens** | Desactivados o no ejercitados en pruebas. Ver el riesgo del `keyGenerator` con IPv6 en `LAST_QA_REPORT.md` |
| 9 | **Aislamiento de knowledge, automations, quotes, voice y maintenance por HTTP** | Los módulos con más tráfico ya están cubiertos; estos cinco siguen sin prueba de aislamiento por endpoint |
