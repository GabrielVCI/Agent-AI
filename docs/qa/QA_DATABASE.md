# QA de base de datos — Sendwary

> **Pasada:** 2026-09-23 · **Entorno:** solo LOCAL · **Árbol:** sucio (cambios sin
> commitear en `backend/`, igual que en las pasadas anteriores).
> Complementa [QA_TEST_DATABASE.md](QA_TEST_DATABASE.md), que explica cómo se
> montó la base de pruebas y el baseline de migraciones.

**Reglas que se respetaron en esta pasada:** nada de `migrate reset`, `DROP`,
`TRUNCATE` ni borrado de datos reales. La base de **desarrollo** solo se leyó,
siempre dentro de una transacción `BEGIN READ ONLY` que termina en `ROLLBACK`.
Todo lo que escribe corrió en `ferreteria_ai_agent_test`, detrás de la guarda
`tests/setup/use-test-db.ts`.

---

## 1. Qué hay

| Pieza | Valor |
|---|---|
| Motor | PostgreSQL 18.3 (local, `localhost:5432`) |
| ORM | Prisma 7.8 · `@prisma/adapter-pg` (pool `pg`, `DB_POOL_MAX` = 10 por defecto) |
| Schema | `backend/prisma/schema.prisma` — 44 modelos, 60 enums |
| Migraciones | 6 en `prisma/migrations` (init → saas_multiempresa → baseline 09-09 → 2 de LemonSqueezy) |
| SQL manual histórico | `prisma/sql/*.sql` (4 archivos, ya absorbidos por el baseline) |
| Seeds | `prisma/seed.ts` (demo), `scripts/seed-plans.ts` (planes, upsert por `code`) |
| Acceso a datos | Prisma directo desde `src/services/**` (no hay capa de repositorios) |
| Multitenancy | Columna `tenantId` en cada tabla de negocio; filtro en los services |
| Base de dev | `ferreteria_ai_agent`: 45 tablas, 65 FKs, 204 índices (76 únicos), 0 `CHECK` |
| Base de pruebas | `ferreteria_ai_agent_test` (se reconstruye desde migraciones) |

Reglas `ON DELETE` en dev: **44 CASCADE**, **18 SET NULL**, **3 RESTRICT**
(`Subscription→Plan`, `CancellationRequest→Subscription`, `CancellationRequest→User`).

---

## 2. Migraciones **[EJECUTADO]**

| Comprobación | Resultado |
|---|---|
| `prisma migrate status` (dev) | *6 migrations found — Database schema is up to date!* |
| `prisma migrate status` (test) | *Database schema is up to date!* |
| `migrate diff` migraciones → schema (shadow) | *This is an empty migration.* → el historial reproduce el schema exacto |
| `migrate diff` base test → schema | *No difference detected.* (exit 0) |
| `migrate diff` base dev → schema | **Drift** (ver abajo) |
| Migraciones pendientes / fallidas | Ninguna en dev ni en test |

### Clasificación de riesgo de cada migración

| Migración | Operaciones destructivas | Clasificación |
|---|---|---|
| `20260518170658_init` | Ninguna | Segura |
| `20260518171339_add_product_business_sku_unique` | Ninguna | Segura |
| `20260610162201_saas_multiempresa` | `DROP COLUMN businessId` en 5 tablas, cambio de tipo de `ConversationStatus`, `DROP INDEX` | **RISK DETECTED** — ya aplicada en dev. No correr nunca sobre una base con datos pre-SaaS sin backup. En bases nuevas es inocua (tablas vacías). |
| `20260909221900_catchup_schema_modulos_0_4` | Ninguna (solo `DROP NOT NULL` en `sku`, `stock`, `passwordHash`: relaja, no borra) | Segura. ⚠ producción necesita `migrate resolve --applied` antes del primer `deploy` (QA_TEST_DATABASE §6.2) |
| `20260915120000_lemonsqueezy_sync_and_webhook_events` | Ninguna (aditiva, `IF NOT EXISTS`) | Segura |
| `20260917120000_lemonsqueezy_subscription_correlation` | Ninguna (aditiva, `IF NOT EXISTS`) | Segura |

### Drift en la base de desarrollo — **RISK DETECTED (R16)**

`migrate diff --from-config-datasource --to-schema` sobre dev propone:

```sql
ALTER TABLE "AppointmentLine" ALTER COLUMN "unitPriceSnapshot" DROP DEFAULT, ...;  -- ya conocido (QA_TEST_DATABASE §6.1)
ALTER TABLE "CustomerCategory" ALTER COLUMN "updatedAt" DROP DEFAULT;            -- ya conocido
ALTER TABLE "Plan" DROP COLUMN "LemonSqueezyID", DROP COLUMN "LemonSqueezyVariantID";  -- NUEVO
```

Las dos columnas de `Plan` **no están en el schema** y **tienen datos**:
los 6 planes guardan ahí IDs de producto de LemonSqueezy (`1201487`, `1201494`,
`1201495`) que **no existen** en la columna oficial `lemonSqueezyProductId`
(null en los 6). Se añadieron a mano fuera de Prisma.

- **Consecuencia:** un `prisma migrate dev` en esta base generaría una migración
  con ese `DROP COLUMN` → **pérdida de datos**. **No se ejecutó.**
- **Acción recomendada (humana):** copiar esos valores a `lemonSqueezyProductId`
  (o confirmar que no se necesitan) y solo después dejar que Prisma borre las
  columnas. Hasta entonces, **no correr `migrate dev` contra dev** — usar
  `migrate diff` para revisar primero.

---

## 3. Integridad de los datos de desarrollo **[EJECUTADO, solo lectura]**

Consultas en `BEGIN READ ONLY … ROLLBACK`. Conteos: 20 tenants, 24 usuarios,
15 clientes, 9 conversaciones, 81 mensajes, 10 citas, 19 suscripciones.

| Comprobación | Resultado |
|---|---|
| Constraints sin validar / índices inválidos | 0 / 0 |
| Huérfanos en columnas sin FK (10 columnas: `Message.tenantId`, `HumanHandoff.tenantId`, `KnowledgeChunk.tenantId`, `ConversationLabel.tenantId`, …) | 0 en todas |
| Cruce de tenant padre↔hijo (15 relaciones: mensaje↔conversación, cita↔cliente/producto, asignaciones de categoría/etiqueta, …) | **0 en todas** |
| Emails de usuario duplicados (sin distinguir mayúsculas) | 0 |
| Teléfono normalizado duplicado por tenant | 0 |
| `Message.whatsappMessageId` duplicado | 0 |
| **`Agent.whatsappPhoneNumberId` en más de un tenant** | **1** — `1171610362693195` está en 2 agentes de 2 tenants → **F2 ya presente en datos reales** |
| Nombre de plan duplicado | 1 (`Básico`: uno legado inactivo sin suscripciones + el `BASIC` activo) |
| Usuarios no SUPER_ADMIN sin tenant | 3 (registro sin onboarding: esperado) |
| Tenants sin suscripción | 1 (`seed:plans` lo repararía con BASIC/TRIALING) |
| Sesiones expiradas / idempotency keys expiradas | 103 / 39 (no hay purga — ver R17) |

---

## 4. Suite nueva: `tests/db-integrity.test.ts` **[EJECUTADO]**

`npm run test:db:integrity` (incluida en `npm run test:db`). 16 casos sobre la
base de pruebas, con tenants/planes propios `__dbqa_test__` que se borran al final
(verificado: 0 restos).

| Área | Caso | Estado |
|---|---|---|
| Unique | `Customer (tenantId, phone)` duplicado → P2002 | PROBADO CORRECTAMENTE |
| Unique + multitenancy | El mismo teléfono sí puede existir en dos tenants | PROBADO CORRECTAMENTE |
| Unique | `Product (tenantId, sku)` dentro del tenant / libre entre tenants | PROBADO CORRECTAMENTE |
| Unique | Una sola `Subscription` por tenant | PROBADO CORRECTAMENTE |
| Unique | `User.email` exacto duplicado → P2002 | PROBADO CORRECTAMENTE |
| Unique | Email con mayúsculas por la ruta de alta del admin | **FALLA DETECTADA — F4** |
| Nullability | `Message` sin `tenantId` rechazado por la base | PROBADO CORRECTAMENTE |
| Defaults | Tenant (`ACTIVE`, zona horaria), Conversation (`BOT_ACTIVE`), Product (`taxRate 0.18`, `unidad`) | PROBADO CORRECTAMENTE |
| FK | Customer de un tenant inexistente → P2003 | PROBADO CORRECTAMENTE |
| RESTRICT | No se borra un Plan con suscripciones | PROBADO CORRECTAMENTE (ver R15) |
| SET NULL | Borrar Agent/Product deja `agentId`/`catalogItemId` en null | PROBADO CORRECTAMENTE |
| CASCADE | Borrar el tenant elimina clientes, conversaciones, mensajes, handoffs, asignaciones | PROBADO CORRECTAMENTE (y R14) |
| Rollback | Un error dentro de `$transaction` no deja escrituras parciales | PROBADO CORRECTAMENTE |
| Carrera | 8 `findOrCreateCustomer` simultáneos → 1 fila | PROBADO CORRECTAMENTE |
| Carrera | 8 `reserveIdempotency` simultáneos → gana exactamente 1 (dedupe del webhook) | PROBADO CORRECTAMENTE |
| Carrera | Mensajes simultáneos de un cliente abren una sola conversación | **FALLA DETECTADA — F5** |

Resultado: `ℹ tests 16 · pass 14 · fail 0 · todo 2`.

### Ya cubierto por las suites existentes (re-ejecutadas hoy)

`npm test` completo → **446 casos, 443 pass, 0 fail, 3 `todo`** (F2 ×2, F3 ×1,
sin cambios). Incluye CRUD real de clientes, categorías, citas/líneas, motor de
automatizaciones con `SKIP LOCKED`, **soft delete** (clientes archivados que
desaparecen de listas y no se “reviven”; agentes `DISABLED`) y **38 pruebas HTTP
de aislamiento entre tenants** módulo a módulo.

**Total tras esta pasada: 462 casos, 0 fallos, 5 `todo`.**

---

## 5. Fallas detectadas

### F4 🟠 — La unicidad del email distingue mayúsculas según la ruta de alta

- La unique de `User.email` en PostgreSQL es **case-sensitive**.
- `registerUser`, `password-reset`, Google OAuth y verificación de email
  **normalizan a minúsculas**. `loginUser` **no normaliza** (busca tal cual).
  `createUserForTenant` y `createTenantWithOwner` (admin) **guardan el email tal cual**.
- Evidencia: un usuario creado por admin como `…Mixto-…@QA.local` **no se
  encuentra** buscando por su email en minúsculas (`actual: null`).
- Impacto: ese usuario no puede recuperar su contraseña, y alguien puede
  registrarse con la versión en minúsculas → **dos cuentas para el mismo buzón**.
  Un usuario autoregistrado que escribe su correo con mayúsculas al iniciar
  sesión recibe 401.
- Corrección sugerida: normalizar en todas las rutas (o `citext` / índice único
  sobre `lower(email)`, previa comprobación de duplicados: hoy hay 0).

### F5 🟠 — Carrera en `findOrCreateActiveConversation`: conversaciones activas duplicadas

- Patrón *check-then-create* sin barrera en la base (no hay unique parcial
  sobre la conversación activa de un cliente).
- Evidencia: 10 rondas de 10 llamadas simultáneas → conversaciones activas por
  cliente `1,10,10,10,10,10,10,10,10,10`.
- Cuándo pasa en la vida real: un cliente nuevo manda 2–3 mensajes seguidos;
  Meta los entrega como webhooks separados casi a la vez (cada uno con su
  propio `messageId`, así que la idempotencia no los agrupa).
- Impacto: el hilo queda partido en varias conversaciones en el inbox, el
  contador de conversaciones del plan se infla y el agente responde sin el
  contexto del mensaje hermano.
- Corrección sugerida: índice único parcial
  `(tenantId, customerId) WHERE status IN ('BOT_ACTIVE','HUMAN_ACTIVE','OPEN')`
  + capturar P2002 y releer al ganador (el mismo patrón que ya usa
  `findOrCreateCustomer`), o un `pg_advisory_xact_lock` por cliente. Antes de
  crear el índice: comprobar que no haya duplicados activos (hoy en dev: 0).

---

## 6. Riesgos detectados

| Id | Riesgo | Evidencia |
|---|---|---|
| **R14** | `ConversationLabel.tenantId` no tiene FK: al borrar un tenant, sus etiquetas quedan huérfanas. Mismo patrón (sin FK a Tenant) en `Message`, `HumanHandoff`, `KnowledgeChunk`, `AgentLog`, `SupportTicket`, `LemonSqueezy*`; en esos casos el borrado igual llega por el padre o es intencional. Hoy la app **no borra tenants**, así que no hay impacto en producción. | Caso CASCADE: 1 etiqueta sobrevive al tenant |
| **R15** | Con `@prisma/adapter-pg`, una violación `RESTRICT` llega como `DriverAdapterError`, **no** como `P2003`. El middleware de errores solo mapea P2002/P2025: una violación de FK terminaría en 500 genérico. Hoy ningún endpoint borra planes. | Caso RESTRICT (primera ejecución) |
| **R16** | Drift de `Plan` en dev con datos fuera del schema: un `migrate dev` los borraría. | §2 |
| **R17** | No hay purga de `Session` ni `IdempotencyKey` expiradas (103 y 39 filas en dev). No afecta a la corrección porque se filtra por `expiresAt`, pero la tabla crece sin límite. | §3 |
| **R18** | 9 FKs sin índice que las cubra (`Appointment.agentId/catalogItemId/customerId`, `AppointmentLine.customerId/productId`, `CallLog.conversationId/userId`, `CancellationRequest.requestedByUserId`, `Conversation.assignedToUserId`) y `EmailVerificationToken.tenantId` sin índice. Un `SET NULL` sobre el padre recorre la tabla hija completa. Irrelevante con el volumen actual. | Catálogo de dev |
| **R19** | `Agent.whatsappPhoneNumberId` no es único en la base (solo `WhatsAppIntegration.phoneNumberId` lo es): la barrera de F2 depende únicamente del código. | Dato real duplicado en dev (§3) |

---

## 7. Lo que NO se probó

| Qué | Estado | Por qué |
|---|---|---|
| Base de producción | NO PROBADO | Solo existe entorno local; regla de no tocar producción |
| `migrate deploy` sobre una copia de producción | NO PROBADO | No hay copia disponible |
| Rendimiento / planes de consulta con volumen | NO PROBADO | Dev tiene decenas de filas; no representativo |
| PgBouncer (`DATABASE_POOL_URL`) en modo transacción | NO VERIFICABLE EN LOCAL | No hay PgBouncer local |
| Ejecución de `prisma/seed.ts` y `seed:plans` | NO PROBADO | Escriben en la base de desarrollo. Revisados **[LEÍDO]**: solo `upsert` y borrados acotados a su propio tenant demo; ninguno es destructivo sobre datos ajenos |

---

## 8. Cómo repetir esta pasada

```bash
cd backend
npx prisma migrate status                                   # dev
npx prisma migrate diff --from-config-datasource --to-schema=prisma/schema.prisma --script
npm run test:db:integrity                                   # 16 casos, base _test
npm test                                                    # pasada completa
```

Las consultas de integridad de solo lectura (§3) se ejecutaron con un script
`pg` que abre `BEGIN READ ONLY` y termina en `ROLLBACK`; el `psql` del PATH de
esta máquina es la v10 de BioTime y no sirve para PostgreSQL 18.

---

## 9. Corrección de F2, F3, F4 y F5 (2026-09-23) **[EJECUTADO]**

| Falla | Corrección | Archivos |
|---|---|---|
| **F2** 🔴 | Ya estaba corregida en el árbol sin commitear: `assertPhoneNumberBelongsToTenant` rechaza (400) un `phoneNumberId` que no sea de una `WhatsAppIntegration` del tenant, y `resolveAgentByPhoneNumberId` solo acepta agentes del tenant dueño de la integración (con `orderBy` determinista). Se quitaron los `todo`: ambas pruebas pasan. | `agents-crud.service.ts`, `whatsapp.service.ts` |
| **F3** 🟠 | `getConversationHistory(id, limit = 20)` pide los últimos N en orden `desc` (desempate por `id`) y los invierte. El Inbox pide 200; el runtime de la IA mantiene 20. | `conversation.service.ts`, `conversation.controller.ts` |
| **F4** 🟠 | `normalizeEmail()` en toda alta (registro, admin: owner y usuarios, Google) y `findUserByEmail()` —exacta por la forma canónica y, si no hay, insensible a mayúsculas— en login, registro, altas del admin, Google, reset de contraseña y reenvío de verificación. Así también funcionan las filas legadas con mayúsculas. | `utils/email.ts` (nuevo), `services/user-lookup.service.ts` (nuevo), `auth.service.ts`, `admin.service.ts`, `password-reset.service.ts`, `email-verification.service.ts` |
| **F5** 🟠 | `findOrCreateActiveConversation` corre dentro de una transacción con `pg_advisory_xact_lock` por `(tenantId, customerId)`: los webhooks simultáneos del mismo cliente se serializan. Sin migración ni cambio de datos (un índice único parcial no se puede crear hoy: dev ya tiene 1 cliente con 2 conversaciones activas). Compatible con PgBouncer en transaction mode. | `conversation.service.ts` |

**Verificación:** `npm run typecheck` exit 0 · `eslint` sin errores nuevos
(los 8 de la línea base) · `npm test` → **463 / 463 verdes, 0 `todo`**
(exit 0). La suite de integridad sumó una prueba (17): fila legada con
mayúsculas → se encuentra, hace login y bloquea el duplicado en minúsculas.

**Lo que queda (decisión humana, no se tocó ningún dato):**

- **Datos F2 en dev:** el agente `Pedro Livio` (tenant *Gabo Corp*) aún tiene
  guardado el número `1171610362693195`, que es de *Ferretería MiCasa*. El
  webhook ya lo ignora, pero conviene limpiarlo
  (`UPDATE "Agent" SET "whatsappPhoneNumberId" = NULL WHERE id = 'cmrcnew30000vq8ve45aarail'`).
  Correr en producción la consulta de solo lectura de F2 antes de desplegar.
- **Duplicado F5 en dev:** el cliente `cmquze4zm0001zgve49f84554` tiene 2
  conversaciones activas anteriores a la corrección. Si se cierran, se podría
  añadir además el índice único parcial como barrera en la base.
- Las conversaciones que crean los webhooks de voz (`voice-webhook.controller.ts`,
  `elevenlabs.service.ts`) no pasan por `findOrCreateActiveConversation`; no se
  cambiaron.
- R14–R19 siguen abiertos (§6).

---

## Veredicto

**DATABASE QA: WARNING**

*Actualizado 2026-09-23 tras las correcciones (§9).* F2, F3, F4 y F5 están
corregidas y verificadas (463/463 verdes, 0 fallas abiertas). Sigue en WARNING
por el drift con datos de `Plan` que un `migrate dev` destruiría (**R16**), los
datos heredados de F2/F5 en dev pendientes de limpieza y los riesgos R14–R19.
Nada de eso bloquea el trabajo en local.
