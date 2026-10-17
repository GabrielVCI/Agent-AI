# Automation Core — Módulo 0

Motor central de eventos, reglas, jobs y mensajes programados de Sendwary.
Toda automatización futura (recordatorios, seguimiento 15/30/60/90, cumpleaños,
mantenimiento, VIP, riesgo de abandono, promociones, encuestas) debe apoyarse
en este motor: **no se crean cronjobs ni lógica de scheduling por feature**.

---

## 1. Flujo

```text
Evento  →  Reglas del tenant  →  Condiciones  →  Job programado
                                                     ↓
                        Worker (claim con SKIP LOCKED, lote + concurrencia)
                                                     ↓
                             Executor (WhatsApp / Email / Nota / Etiqueta)
                                                     ↓
                    Execution (historial) + ScheduledMessage (outbox)
```

Un módulo de negocio solo hace esto:

```ts
await emitAutomationEvent({
  tenantId,
  type: "APPOINTMENT_COMPLETED",
  source: "appointments",
  entityType: "APPOINTMENT",
  entityId: appointment.id,
  customerId,
  payload: { scheduledAt, serviceOrProduct, ... },
  idempotencyKey: `APPOINTMENT_COMPLETED:${appointment.id}`,
});
```

No conoce el scheduler, los reintentos ni los executors. `emitAutomationEvent`
**nunca lanza**: una automatización mal configurada no puede romper una cita ni
una respuesta de WhatsApp.

---

## 2. Archivos

```text
backend/src/services/automation/
  automation.types.ts            catálogo de eventos + contratos (envelope, configs)
  automation-events.service.ts   emit(): validar → registrar → reglas → jobs → cancelaciones
  automation-rules.service.ts    CRUD de reglas (siempre por tenant) + matching
  automation-jobs.service.ts     schedule/cancel/reschedule/claim/complete/fail + consultas
  automation-worker.ts           loop del worker: lote, concurrencia, lease, stale recovery
  automation-schedule.ts         estrategias de fecha + idempotency key + backoff
  automation-conditions.ts       DSL de condiciones (evaluador puro)
  automation-errors.ts           clasificación RETRYABLE/NON_RETRYABLE + saneamiento
  automation-render.ts           render de plantillas {{nombre}}, {{fecha}}...
  automation-templates.ts        plantillas de Sendwary (en código, no en BD)
  executors/                     whatsapp-message | email | internal-notification | customer-tag
backend/src/utils/timezone.ts    helpers timezone-aware (UTC ↔ hora local del tenant)
backend/src/controllers/automation.controller.ts        API de tenant
backend/src/controllers/admin-automation.controller.ts  API de SUPER_ADMIN
backend/src/routes/automation.routes.ts                 /api/automations
```

---

## 3. Modelo de datos

| Modelo | Para qué | Constraint clave |
|---|---|---|
| `AutomationEvent` | Traza de cada evento recibido + dedupe a nivel evento | `UNIQUE(tenantId, idempotencyKey)` |
| `AutomationRule` | Automatización configurable del tenant | `UNIQUE(tenantId, templateKey)` |
| `AutomationJob` | Ejecución futura/pendiente | `UNIQUE(tenantId, idempotencyKey)` |
| `AutomationExecution` | Historial real de cada intento | — |
| `ScheduledMessage` | Outbox de mensajes programados | `UNIQUE(tenantId, dedupeKey)` |

Índices pensados para las consultas reales: `(status, scheduledFor)` (claim del
worker), `(tenantId, status, scheduledFor)` (panel), `(tenantId, entityType,
entityId, status)` y `(tenantId, customerId, status)` (cancelación de
secuencias), `lockedAt` (recuperación de jobs abandonados).

Todos los modelos tienen FK a `Tenant` con `onDelete: Cascade`: borrar un tenant
no deja jobs huérfanos.

---

## 4. Idempotencia

Dos barreras, ambas respaldadas por índices UNIQUE de PostgreSQL (nunca por
comprobaciones en memoria):

1. **Evento**: `AutomationEvent(tenantId, idempotencyKey)`. Un webhook
   reentregado ni siquiera vuelve a evaluar reglas.
2. **Job**: `AutomationJob(tenantId, idempotencyKey)` con la clave

   ```text
   rule:<ruleId>|evt:<eventType>|ent:<entityType>:<entityId>|w:<ventana>[|tag:<etapa>]
   ```

   La ventana la decide `scheduleConfig.dedupeWindow`:
   `entity` (default, una por entidad y regla), `day` (una por día local del
   tenant), `occurrence` (una por instante programado).
   `dedupeTag` separa etapas de una misma secuencia (15/30/60/90).

`scheduleJob()` resuelve el choque de clave así:

| Estado del job existente | Resultado |
|---|---|
| No existe | `CREATED` |
| SCHEDULED / PENDING / RETRY_PENDING | `RESCHEDULED` (se mueve la fecha, no se duplica) |
| CANCELLED / FAILED | `REACTIVATED` (nuevo evento = nuevo presupuesto de intentos) |
| COMPLETED / PROCESSING | `SKIPPED_DUPLICATE` (jamás se ejecuta dos veces) |

---

## 5. Concurrencia

El worker reclama jobs con un único statement:

```sql
UPDATE "AutomationJob" SET status='PROCESSING', "lockedBy"=$worker, ...
WHERE id IN (
  SELECT id FROM "AutomationJob"
  WHERE status IN ('PENDING','SCHEDULED','RETRY_PENDING') AND "scheduledFor" <= now()
  ORDER BY priority DESC, "scheduledFor" ASC
  LIMIT $batch
  FOR UPDATE SKIP LOCKED
) RETURNING *;
```

`SKIP LOCKED` es lo que permite tener el worker encendido en **todas** las
instancias de Railway sin ejecutar el mismo job dos veces.

**Jobs abandonados**: si el proceso muere en `PROCESSING`, el `lockedAt` envejece;
pasado `AUTOMATION_JOB_LEASE_MS` el job vuelve a `RETRY_PENDING` (o a `FAILED`
si ya agotó intentos). Nunca queda un job eternamente en `PROCESSING`.

**Por qué no BullMQ/Redis**: Redis es opcional en este stack (rate limiting; el
backend arranca con Redis caído). Hacerlo obligatorio complicaría el despliegue
sin aportar nada que `FOR UPDATE SKIP LOCKED` no resuelva. Si en el futuro hace
falta más throughput, el motor puede cambiar de cola sin tocar reglas,
executors ni productores de eventos.

---

## 6. Reintentos

Backoff con jitter ±20 %: **30 s → 2 min → 10 min → 30 min → 2 h** (tope), como
máximo `maxAttempts` de la regla o `AUTOMATION_MAX_ATTEMPTS`.

| Clasificación | Ejemplos | Comportamiento |
|---|---|---|
| `RETRYABLE` | timeout, 429, 5xx, red caída, correo rechazado por el proveedor | Programa el próximo intento |
| `NON_RETRYABLE` | tenant/cliente inexistente, integración no conectada, número de otro tenant, plantilla vacía, límite del plan | `FAILED` inmediato |

Los errores externos se **sanean** antes de persistirse o loguearse
(`sanitizeErrorText`): se eliminan `Bearer …`, tokens de Meta (`EAA…`), claves
de OpenAI/Resend y cualquier `token/secret/password=…`.

---

## 7. Multi-tenancy

- Todos los servicios reciben `tenantId` explícito y lo aplican en el `WHERE`.
- El `tenantId` sale de la **sesión** (`req.user.tenantId`), nunca del body.
- `emit()` verifica el tenant contra la BD y descarta tenants no `ACTIVE`.
- El executor de WhatsApp comprueba que el `phoneNumberId` pertenece a una
  `WhatsAppIntegration` **del mismo tenant** antes de resolver credenciales; si
  no, falla `CROSS_TENANT_INTEGRATION` y no envía nada.
- No existen reglas globales en BD: las plantillas viven en código y se
  instancian por tenant (`templateKey` único por tenant).

---

## 8. Zonas horarias

Persistencia en **UTC**; cálculos comerciales en `Tenant.timezone` (default
`America/Santo_Domingo`). `utils/timezone.ts` convierte hora de pared ↔ UTC con
doble pasada (correcto en bordes de DST) sin dependencias externas.

- `DAILY_AT_LOCAL_TIME` respeta la hora local del negocio (no se escribe a
  clientes a las 3 a. m. porque el job venció de madrugada).
- Cumpleaños: `nextAnnualOccurrence`. **Decisión: un 29 de febrero se celebra el
  28 de febrero en años no bisiestos** (se mantiene dentro del mes).

---

## 9. API

### Tenant (`/api/automations`, sesión `sid` + OWNER/ADMIN para escribir)

```text
GET    /api/automations/catalog          eventos, acciones y plantillas disponibles
GET    /api/automations/health           cola del tenant (pendientes, fallidos, próximo)
GET    /api/automations/rules
POST   /api/automations/rules
POST   /api/automations/rules/from-template
GET    /api/automations/rules/:id
PATCH  /api/automations/rules/:id
DELETE /api/automations/rules/:id        archiva la regla y cancela sus jobs
GET    /api/automations/jobs
POST   /api/automations/jobs/:id/cancel
GET    /api/automations/executions
```

### SUPER_ADMIN (`/api/admin/automations`)

```text
GET  /api/admin/automations/health         (?tenantId= opcional)
GET  /api/admin/automations/jobs           (por defecto FAILED)
POST /api/admin/automations/jobs/:id/retry
POST /api/admin/automations/jobs/:id/cancel
```

Contrato de respuesta y paginación: el estándar del proyecto
(`{ success, data: { items, total, page, limit, pages, filters } }`).

### Panel (`/automatizaciones`)

El motor dejó de ser solo-API: `frontend/src/pages/AutomationsPage.tsx` lo expone
al negocio. Traduce la regla a tres preguntas —**Cuando… / Entonces… / ¿Cuándo?**—
más *Solo si…* y *Cancelar lo pendiente si…*.

Decisiones que importan:

| Decisión | Por qué |
|---|---|
| Los selects se llenan **desde `/catalog`**, no desde una lista del frontend | Si mañana se registra un executor nuevo, el panel lo ofrece sin tocar la UI; y nunca se ofrece una acción sin motor detrás. |
| Un evento con `implemented: false` se marca **"(aún no disponible)"** y avisa antes de guardar | La regla se guarda, pero no se deja creer que va a dispararse. |
| Toda regla nueva nace **DRAFT** | Activar es un acto explícito: el panel escribe a clientes reales. |
| `RELATIVE_TO_FIELD` solo ofrece los campos de fecha que **ese** evento emite | Elegir una fecha que nunca llega en el payload produciría una regla muerta. |
| El editor de condiciones cubre un nivel (`all`/`any` de hojas). Un DSL más complejo se muestra **en solo lectura** y se conserva intacto al guardar | Es preferible no poder editar algo a destruirlo silenciosamente. |
| Los minutos se editan en minutos/horas/días | Nadie debería teclear `2880`. |
| Las variables de plantilla se ofrecen como botones | Evita `{{apellido}}`, que saldría vacío en el mensaje real. |

Tras crear, editar o archivar una regla, el controller llama a
`syncCategoryManagement()`: una categoría gestionada por una regla se muestra
como **automática** en el Módulo 2, y vuelve a **manual** cuando la regla se
archiva. Así el panel de segmentación nunca dice "automática" sobre algo que ya
no mantiene nadie.

---

## 10. Reglas: forma

```jsonc
{
  "name": "Recordatorio de cita 24 h antes",
  "eventType": "APPOINTMENT_CREATED",
  "status": "ACTIVE",
  "conditions": { "all": [{ "field": "status", "op": "ne", "value": "CANCELLED" }] },
  "actionType": "SEND_WHATSAPP_MESSAGE",
  "actionConfig": { "template": "Hola {{nombre}}, tu {{servicio}} es el {{fecha}} a las {{hora}}." },
  "scheduleStrategy": "RELATIVE_TO_FIELD",
  "scheduleConfig": { "field": "scheduledAt", "offsetMinutes": -1440 },
  "cancelOnEventTypes": ["APPOINTMENT_CANCELLED"],
  "priority": 10
}
```

**Estrategias**: `IMMEDIATE`, `DELAY` (+`delayMinutes`), `RELATIVE_TO_FIELD`
(campo de fecha del payload ± offset), `DAILY_AT_LOCAL_TIME` (+`localTime`).

**Condiciones**: `{field, op, value}` con `eq|ne|gt|gte|lt|lte|in|nin|exists|contains`
y grupos `all|any|not`. Evaluador puro, sin `eval`. Condición malformada ⇒ la
regla **no** se ejecuta (fail-closed).

**Acciones** (cada una con executor real):
`SEND_WHATSAPP_MESSAGE` (Cloud API oficial del tenant), `SEND_EMAIL`
(Resend/SMTP con el layout de marca), `CREATE_INTERNAL_NOTIFICATION` (mensaje
SYSTEM en el inbox, el cliente no lo recibe), `UPDATE_CUSTOMER_TAG`
(etiqueta de conversación). La API rechaza reglas con acciones sin executor.

---

## 11. Eventos que ya se emiten

| Evento | Origen |
|---|---|
| `CUSTOMER_CREATED` | `conversation.service.findOrCreateCustomer` (WhatsApp, voz, citas) |
| `APPOINTMENT_CREATED` / `APPOINTMENT_CONFIRMED` | `createAppointment`, `confirmAppointment` |
| `APPOINTMENT_RESCHEDULED` | `rescheduleAppointment` (mueve el recordatorio, no lo duplica) |
| `APPOINTMENT_COMPLETED` + `CUSTOMER_VISITED` | `completeAppointment` |
| `APPOINTMENT_CANCELLED` / `APPOINTMENT_NO_SHOW` | `cancelAppointment`, `markNoShow` (cancelan los jobs de esa cita) |

Declarados en el catálogo pero **sin productor todavía**: `SERVICE_USED`,
`PRODUCT_PURCHASED`, `CUSTOMER_BIRTHDAY`, `MAINTENANCE_DUE`,
`CUSTOMER_INACTIVE_*`, `CUSTOMER_CHURN_RISK`, `CUSTOMER_BECAME_VIP`.
El motor los soporta hoy: solo falta quién los emita.

**Importación masiva de citas por Excel**: usa `createMany` y **no** pasa por
`createAppointment`, así que no emite eventos (evita disparar cientos de
mensajes en una carga). Si se quiere, se conecta en una fase posterior.

---

## 12. Variables de entorno

| Variable | Default | Para qué |
|---|---|---|
| `AUTOMATION_WORKER_ENABLED` | `true` | Enciende el worker en esta instancia |
| `AUTOMATION_BATCH_SIZE` | `50` | Jobs reclamados por ciclo |
| `AUTOMATION_CONCURRENCY` | `5` | Jobs ejecutados en paralelo por lote |
| `AUTOMATION_POLL_INTERVAL_MS` | `5000` | Frecuencia del ciclo |
| `AUTOMATION_JOB_LEASE_MS` | `300000` | Lease: tras esto un `PROCESSING` se recupera |
| `AUTOMATION_MAX_ATTEMPTS` | `5` | Intentos por job si la regla no define otro |

---

## 13. Base de datos

Política vigente del proyecto (drift conocido): **`prisma db push`, nunca
`migrate dev/reset`**. Los cambios de este módulo son 100 % aditivos (9 enums,
5 tablas, sus índices y FKs; cero `DROP`).

- Local/staging: `npx prisma db push` (usa `DIRECT_URL`).
- Alternativa revisable/ejecutable a mano:
  `backend/prisma/sql/2026-08-16_automation_core.sql`.

---

## 14. Tests

```bash
cd backend
npm run test         # unitarios + integración
npm run test:unit    # sin base de datos
npm run test:db      # contra PostgreSQL real
```

Los tests de integración crean sus propios tenants con prefijo
`__automation_test__` y los borran al terminar: no leen ni modifican datos
existentes.

Cubren: aislamiento multi-tenant (listar/leer/editar/cancelar cruzado),
idempotencia (evento repetido ⇒ una automatización), cancelación al volver el
cliente, reprogramación sin duplicar, concurrencia de dos workers, recuperación
de lease vencido, retries (reintentable vs definitivo, tope de intentos),
regla desactivada, y bloqueo del envío cuando el número es de otro tenant.

---

## 15. Observabilidad

Logs (con `tenantId`, `jobId`, `ruleId`, `eventType`, `correlationId`; nunca
tokens ni payloads sensibles):

```text
automation.event.received | automation.event.duplicate | automation.event.skipped
automation.job.created | automation.job.rescheduled | automation.job.processing
automation.job.completed | automation.job.retry | automation.job.failed
automation.job.cancelled | automation.job.stale_recovered | automation.job.manual_retry
automation.worker.started | automation.worker.tick | automation.worker.stopped
```

Diagnóstico sin salir del panel: `GET /api/automations/health` (tenant) y
`GET /api/admin/automations/health` (plataforma) devuelven conteos por estado,
próximo job, último fallo con su error saneado y cuántos jobs llevan demasiado
tiempo en `PROCESSING`.
