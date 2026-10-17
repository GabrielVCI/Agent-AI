# Historial de servicios, visitas y recurrencias — Módulo 3

Convierte una cita completada en actividad comercial real: historial, métricas,
eventos de dominio y seguimientos futuros.

```text
Appointment COMPLETED
        ↓  (una transacción)
completedAt + AppointmentLine (snapshots + próxima fecha)
        ↓  (commit)
métricas del cliente recalculadas
        ↓
APPOINTMENT_COMPLETED · CUSTOMER_VISITED · SERVICE_USED · PRODUCT_PURCHASED
        ↓
Automation Core (Módulo 0)          Segmentación (Módulo 2)
        ↓                                   ↓
  recordatorio de mantenimiento     VIP · frecuencia · riesgo
```

---

## 1. Fuentes de verdad

| Concepto | Quién manda | Por qué |
|---|---|---|
| La cita | `Appointment` | Ya existía y es la entidad operacional. |
| **La visita** | `Appointment(status = COMPLETED)` | Una cita completada **es** la visita. |
| Servicios/productos | `AppointmentLine` | Con snapshot de nombre y precio. |
| `visitCount`, `firstVisitAt`, `lastVisitAt` | `Customer` (derivados) | Se **recalculan enteros**, nunca `++`. |
| Recurrencias programadas | `AutomationJob` (Módulo 0) | No hay tabla de recurrencias. |
| Política de recurrencia | `Product` (itemType = SERVICE) | Tres campos, no un modelo aparte. |

### Por qué NO existe `CustomerVisit`

Las métricas de visita ya se derivaban de `Appointment(COMPLETED)` con un
`aggregate` completo — reconciliable por diseño. Añadir una tabla de visitas
habría creado una **segunda verdad** sobre algo que ya era correcto, con el
riesgo permanente de que las dos se desincronizaran. Lo que faltaba era la marca
temporal: se añadió `Appointment.completedAt`.

Consecuencia útil: la unicidad "una cita = una visita" la da la propia fila. No
hace falta ninguna constraint extra.

---

## 2. Modelo `AppointmentLine`

```text
kind    : SERVICE | PRODUCT_SOLD | PRODUCT_USED
status  : PLANNED | PERFORMED | SKIPPED
```

| Campo | Por qué |
|---|---|
| `nameSnapshot`, `unitPriceSnapshot`, `totalSnapshot` | Si mañana "Corte Premium" sube de 800 a 1.200, quien pagó 800 sigue viendo 800. |
| `performedAt` | Solo en las `PERFORMED`. |
| `nextRecommendedAt` | Calculada al cerrar. `null` si el servicio no tiene recurrencia. |
| `customerId` | Denormalizado: permite el historial del cliente sin join. |

`productId` es `SetNull`: borrar el ítem del catálogo **no** destruye el
historial, que se queda con su snapshot.

### Venta ≠ uso interno

```text
Champú post-color vendido   → PRODUCT_SOLD  → suma al historial → emite PRODUCT_PURCHASED
Tinte gastado en el servicio → PRODUCT_USED  → importe 0         → NO emite nada
```

Cobrarle a la clienta el material que gastó el salón sería inventarle un gasto.

### Agendado ≠ realizado

Una línea `SKIPPED` no entra al historial al cerrar. No se inventa una ejecución
que no ocurrió.

Migración: `prisma/sql/2026-08-18_service_history.sql` (incremental,
idempotente). Backfill: `npm run backfill:service-history`.

---

## 3. Idempotencia y concurrencia

La transición usa un **UPDATE condicional** (compare-and-set):

```sql
UPDATE "Appointment"
   SET status = 'COMPLETED', "completedAt" = now()
 WHERE id = ? AND "tenantId" = ? AND "completedAt" IS NULL
```

De dos peticiones simultáneas PostgreSQL solo deja pasar a una; la otra recibe
`count = 0` y devuelve el estado actual **sin repetir efectos**. Resultado
garantizado y probado:

```text
doble clic · retry HTTP · 2 instancias de Railway
        ↓
1 visita · 1 juego de servicios · 1 juego de recurrencias · 1 evento
```

Completar una cita ya cerrada devuelve **200 con el estado actual**, no un
error: un reintento legítimo no es un fallo.

---

## 4. Transacciones y eventos

```text
BEGIN
  validar cita y tenant
  CAS a COMPLETED + completedAt
  materializar líneas (ensureDefaultLine)
  congelar snapshots
  calcular nextRecommendedAt
COMMIT
─────────────────────────────  ← ninguna llamada externa dentro
  recalcular métricas
  emitir eventos → Automation Core → WhatsApp / correo
```

**Nunca** se mantiene una transacción abierta esperando a Meta ni a OpenAI. Cada
evento lleva su clave de idempotencia derivada de la cita o de la línea
(`customer-visited:appointment:<id>`, `service-used:line:<id>`), así que un
reintento del proceso no vuelve a disparar automatizaciones.

---

## 5. Recurrencias

### Configuración

Vive en el ítem del catálogo (`Product`, itemType = SERVICE):

```text
recurrenceEnabled  : false por defecto
recurrenceInterval : null  por defecto
recurrenceUnit     : DAYS | WEEKS | MONTHS
```

**Apagada y sin intervalo por defecto.** Sendwary no fija plazos comerciales que
el negocio no haya decidido: sin política, completar el servicio no programa
absolutamente nada.

### Cálculo

`resolveNextRecommendedAt()` (módulo puro) trabaja sobre el **calendario del
negocio**, no sumando milisegundos:

- `1 mes` ≠ `30 días` (1 de enero → 1 de febrero vs 31 de enero).
- `31 de enero + 1 mes` → 28/29 de febrero, no el 3 de marzo.
- Cruzar un cambio de horario de verano no corre la hora.
- La fecha cae a las 10:00 **locales del tenant**, no a la hora en que se hizo
  el servicio (ni a la del servidor).

Nunca se deduce del nombre: `if (name.includes("keratina"))` está prohibido y no
existe en el código.

### Programación — sin scheduler nuevo

Una recurrencia programada **es un `AutomationJob`**. El flujo:

```text
SERVICE_USED  (entityId = "<clienteId>:<servicioId>", cancelByCustomer: false)
      ↓
regla con eventType SERVICE_USED
      ↓
scheduleStrategy RELATIVE_TO_FIELD, field = "nextRecommendedAt"
      ↓
AutomationJob programado
```

Plantilla lista: `service-maintenance-reminder`.

### La identidad es la PAREJA cliente + servicio

Si la recurrencia fuese "del cliente", repetir la coloración cancelaría el
mantenimiento de keratina de la misma clienta. Si fuese "del servicio", una
clienta pisaría a otra. Por eso el `entityId` es compuesto y el evento viaja con
`cancelByCustomer: false` (extensión mínima del Módulo 0, compatible hacia
atrás: el default sigue siendo el comportamiento anterior).

### Volver antes de tiempo

```text
Coloración 1 jul  → aviso 10 ago
Coloración 1 ago  → SERVICE_USED cancela el aviso del 10 ago
                  → programa el nuevo desde el 1 ago
```

Invariante garantizado: **nunca hay más de un job vivo por (cliente, servicio)**.
Los que dejan de aplicar quedan `CANCELLED` con su motivo — no se borran filas.

---

## 6. Reapertura y reconciliación

Sin ella, un clic equivocado dejaría métricas fantasma para siempre.

```text
POST /api/appointments/:id/reopen
  → status vuelve a CONFIRMED, completedAt = null
  → líneas vuelven a PLANNED (sueltan performedAt y nextRecommendedAt)
  → métricas del cliente RECALCULADAS enteras
  → seguimientos de esa visita CANCELADOS por el motor
```

Una cita cerrada **no admite editar sus líneas**: la única corrección soportada
es reabrirla, precisamente para que los agregados no queden mintiendo.

---

## 7. Métricas del cliente

| Métrica | Estado | Fuente |
|---|---|---|
| `visitCount` | ✅ | `COUNT` de citas COMPLETED |
| `firstVisitAt` / `lastVisitAt` | ✅ | `MIN`/`MAX` de esas citas |
| `serviced.total` | ✅ | Suma de snapshots de líneas realizadas |
| `serviced.averagePerVisit` | ✅ | total ÷ visitas **con importe** |
| `totalSpent` / `averageSpent` | ❌ **no existe** | No hay pagos de cliente final |

**No se inventó dinero cobrado.** Lo que se expone es el *valor de lo
realizado*, con el precio del catálogo del día, y la UI lo etiqueta así — nunca
como "total pagado". Cuando exista módulo de cobros, esta es la única función
que hay que ampliar.

`recalculateCustomerVisitStats()` es el reconciliador: recalcula desde la fuente
en lugar de incrementar, así que reabrir, corregir o importar deja las cifras
correctas.

---

## 8. Segmentación

Módulo 3 **entrega información**; Módulo 2 **decide clasificación**.

`CUSTOMER_VISITED` es el disparador con el que la segmentación reevalúa
frecuencia, inactividad y riesgo. `AppointmentService` no asigna categorías ni
toca `isVip`: no hay ninguna regla comercial hardcodeada aquí.

---

## 9. Mensajes

```text
❌ appointment.completed → whatsappService.send()
✅ appointment.completed → evento → Automation Core → job → executor → WhatsApp
```

Este módulo no envía nada por sí mismo.

---

## 10. Endpoints

```text
POST   /api/appointments/:id/complete          (idempotente)
POST   /api/appointments/:id/reopen
GET    /api/appointments/:id/lines
POST   /api/appointments/:id/lines
PATCH  /api/appointments/:id/lines/:lineId
DELETE /api/appointments/:id/lines/:lineId

GET    /api/customers/:id/followups
DELETE /api/customers/:id/followups/:jobId     (cancela vía motor)
PATCH  /api/customers/:id/followups/:jobId     (reprograma vía motor)
```

Cancelar/mover un seguimiento pasa por `cancelJobById` / `rescheduleJob`: el job
queda `CANCELLED` con trazabilidad y su mensaje programado se cancela con él.

---

## 11. Aislamiento multi-tenant

Cita, cliente y producto se validan contra el **mismo** tenant antes de escribir.
Un `productId` de otra empresa en una cita propia devuelve 404; un `jobId` de
otro cliente del mismo tenant también. Hay test para cada caso.

---

## 12. Frontend

| Pantalla | Qué hace |
|---|---|
| Citas → "Servicios" | Registrar servicios/productos, marcar lo no realizado, ver el total |
| Citas → "Reabrir" | Corregir un cierre equivocado |
| Catálogo → servicio | Configurar la recurrencia ("cada 40 días") |
| Ficha del cliente | Próximos seguimientos (reales), valor realizado, historial |

Una cita cerrada abre el panel en **solo lectura** y explica que los precios son
los del día en que se realizó.

---

## 13. Pendiente y riesgos conocidos

- **Cobros**: no hay módulo de pagos, así que no hay `totalSpent` real.
- **Recurrencia vs cita ya agendada** (§64): si el cliente ya tiene cita para el
  retoque, el recordatorio se enviaría igual. La arquitectura lo permite resolver
  con una condición en la regla, pero **no se implementó** para no inventar
  lógica frágil.
- **Backfill histórico**: usa el precio ACTUAL del catálogo para las citas ya
  cerradas (no existe el precio de aquel día). De aquí en adelante se congela
  bien. No calcula recurrencias retroactivas a propósito: llenaría la cola de
  avisos vencidos.
- **Stock**: vender un producto en una cita **no** descuenta inventario. No
  existía esa integración y añadirla sin requerimiento sería inventar reglas.

---

## 14. Cronograma de mantenimiento (Módulo 4)

Vista cruzada de **a quién le toca volver**: `/mantenimiento`, servida por
`GET /api/maintenance/schedule`.

### La decisión que hay que entender

La fecha se **calcula con la política ACTUAL** del catálogo, no se lee de
`AppointmentLine.nextRecommendedAt`.

| | `nextRecommendedAt` (Módulo 3) | Cronograma (Módulo 4) |
|---|---|---|
| Qué es | Lo prometido el día que se cerró la cita | Vista de planificación |
| Fuente | Congelado en la línea | `performedAt` + política de hoy |
| Si cambias el intervalo | No se mueve (el recordatorio ya está programado) | Se mueve al instante |

Motivo: si el negocio configura hoy "Tinte cada 30 días", espera ver de
inmediato a quien se tiñó hace 45. Con el valor almacenado esa gente **no
aparecería nunca**, porque sus visitas se cerraron cuando el servicio aún no
tenía recurrencia. El cronograma funciona así de forma retroactiva desde el
primer minuto.

La UI lo dice explícitamente al pie de la pantalla.

### Cómo se construye

```sql
DISTINCT ON (customerId, productId) ... ORDER BY performedAt DESC
```

Solo la **última** vez que ese cliente recibió ese servicio: quien se tiñe cada
mes tiene una fila, no doce. La fecha sale de `make_interval`, que respeta el
calendario igual que el cálculo del Módulo 3 (31 ene + 1 mes = 28 feb).

Se excluye del listado:

- servicios **sin recurrencia activa** (apagarla lo saca al instante);
- clientes **archivados**;
- líneas `PRODUCT_USED` (el material que gasta el negocio no es una recompra);
- por defecto, quien **ya tiene cita futura** para ese servicio.

Ese último punto **cierra el riesgo §64** que quedó abierto en el Módulo 3: la
lista es "a quién contactar", y llamar a alguien que ya está agendado era
justamente el mensaje absurdo que había que evitar. Se pueden ver con el
interruptor "Incluir los que ya tienen cita", y llegan marcados.

### Estados y filtros

```text
OVERDUE    dueAt < hoy          → "Vencido hace N días"
DUE_TODAY  dueAt == hoy         → "Le toca hoy"
UPCOMING   dueAt > hoy          → "En N días"
```

"Hoy" es el día del **negocio** (zona horaria del tenant), no el del servidor.

El filtro `overdueMinDays` cubre el caso "clientes con más de 40 días sin
retoque". El total viaja en la misma consulta (`COUNT(*) OVER ()`) para que
cifras y filas no puedan contradecirse.

### Endpoints

```text
GET /api/maintenance/schedule   ?serviceId= &status= &overdueMinDays=
                                &search= &includeScheduled= &page= &limit=
GET /api/maintenance/counters
GET /api/maintenance/services   servicios con recurrencia real (filtro)
```

Solo lectura: el cronograma se **deriva**. Cambiar una fecha se hace
configurando el servicio en el catálogo o cerrando la cita, nunca escribiendo
aquí.
