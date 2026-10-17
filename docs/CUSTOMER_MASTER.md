# Maestro de Clientes — Módulo 1

Fuente de verdad de la identidad de los clientes de cada tenant. Todo lo que
Sendwary sabe de una persona (conversaciones, citas, cotizaciones, visitas,
automatizaciones) cuelga de aquí.

```text
WhatsApp · Llamadas · Citas · Importación · Alta manual
                        ↓
                    Customer
                        ↓
           identidad normalizada (E.164)
                        ↓
             historial y métricas reales
                        ↓
                 Automation Core (Módulo 0)
                        ↓
   seguimientos · cumpleaños · VIP · riesgo · promociones
```

---

## 1. Modelo

Se **extendió** el modelo `Customer` que ya existía (lo usan conversaciones,
cotizaciones, inbox, llamadas y el motor de automatizaciones). No se creó un
segundo modelo ni un servicio paralelo.

| Campo | Para qué |
|---|---|
| `name` | Nombre para mostrar. Campo legado que consumen inbox, PDF de cotización y executors. Se mantiene en sincronía con `firstName + lastName`. |
| `firstName` / `lastName` | Nombre estructurado (alta manual e importación). |
| `phone` | Lo que llegó (wa_id, lo que tecleó el negocio). |
| `phoneNormalized` | **E.164**. Es la clave real de deduplicación. |
| `phoneCountry` | ISO-2 detectado al normalizar. |
| `email`, `documentId`, `address`, `birthDate`, `notes` | Datos de ficha. Los cuatro últimos son sensibles: no salen en el listado. |
| `stage` | `CONTACT` · `CLIENT` · `ARCHIVED`. |
| `source` | `WHATSAPP` · `MANUAL` · `APPOINTMENT` · `IMPORT` · `VOICE` · `API`. |
| `clientSince` | Cuándo dejó de ser contacto. |
| `tags` | Segmentación por persona (`text[]`). |
| `isVip`, `vipSince`, `riskStatus` | Estados que hoy fija el negocio (o el motor); **no hay score automático todavía**. |
| `firstVisitAt`, `lastVisitAt`, `visitCount` | Métricas de visita derivadas (ver §5). |

`Appointment.customerId` (nuevo, nullable) vincula cada cita con su cliente.
`customerName`/`customerPhone` se conservan como copia histórica de lo que se
agendó ese día.

---

## 2. Contacto ≠ Cliente

Sendwary **no tiene** una tabla de contactos separada: toda conversación exige
un `Customer`. La distinción conceptual vive en `stage`:

| Situación | Resultado |
|---|---|
| Alguien escribe "Hola" por WhatsApp | Fila `CONTACT`. No es cliente. |
| Se le agenda una cita (pendiente) | Sigue `CONTACT`. |
| **La cita se confirma** | Pasa a `CLIENT` (`promoteToClient`). |
| Se completa una cita | `CLIENT` + suma una visita. |
| Alta manual / importación | Nace `CLIENT`. |

El listado muestra ambos por defecto, con filtro por tipo y una insignia por
fila; los archivados quedan fuera salvo que se pidan.

---

## 3. Teléfonos

`backend/src/utils/phone.ts` (libphonenumber-js, metadata oficial de Google).
No hay limpieza casera de símbolos.

```text
8095555555 · +18095555555 · 1-809-555-5555 · (809) 555-5555 · 1 809 555 5555
                              → +18095555555
```

- **País por defecto**: sale de `Tenant.timezone` (`America/Santo_Domingo` → DO,
  `Europe/Madrid` → ES…). Último recurso: `DEFAULT_PHONE_COUNTRY` (default `DO`).
  República Dominicana **no** está grabada en el dominio.
- Un número con código internacional ignora el país del tenant.
- **wa_id de Meta**: llega como dígitos sin `+`. Si la primera lectura falla, se
  reintenta anteponiendo `+` cuando la longitud es internacional plausible.
- Un teléfono no interpretable deja `phoneNormalized = null` y `valid = false`.
  No se inventa un canónico.

### Unicidad y concurrencia

```prisma
@@unique([tenantId, phone])            // ya existía
@@unique([tenantId, phoneNormalized])  // NUEVO: la barrera real
```

`phoneNormalized` es nullable y en PostgreSQL los `NULL` no colisionan: los
teléfonos legados ilegibles conviven sin bloquear la constraint.

`findFirst()` + `create()` **no** es la protección contra duplicados — es solo
la ruta feliz. La carrera real (WhatsApp confirma una cita mientras el ADMIN
crea el cliente a mano) la resuelve la constraint: el perdedor captura `P2002`
y relee la fila del ganador, sin emitir un segundo `CUSTOMER_CREATED`. En el
alta manual, el perdedor recibe un **409 con el id del cliente existente** para
que la UI ofrezca "ver su ficha" (nunca un 500).

Multi-tenant: el mismo número puede existir en Tenant A y Tenant B.

---

## 4. Alta automática

```text
WhatsApp → webhook → findOrCreateCustomer (stage CONTACT)
                          ↓
                    Conversation
                          ↓
              Appointment (customerId vinculado)
                          ↓
              APPOINTMENT_CONFIRMED
                          ↓
                promoteToClient → stage CLIENT
```

`findOrCreateCustomer` vive en `services/customer/customer.service.ts` y es el
**único** punto de alta. `conversation.service.ts` lo reexporta para no cambiar
los imports de WhatsApp, llamadas y citas.

**Política de enriquecimiento automático**: un flujo automático solo rellena
huecos. Nunca pisa un nombre, correo o etiqueta escrito por una persona. Única
excepción: el placeholder legado `"Cliente"`, que no es un dato y sí se
reemplaza cuando llega un nombre real.

Nombres: WhatsApp entrega un nombre libre. Se guarda tal cual en `name` y se
divide en `firstName`/`lastName` **solo si tiene más de una palabra**. "Gaby"
queda con `lastName = null`: no se inventa un apellido.

---

## 5. Qué es una visita

> **Una visita = una cita con `status = COMPLETED`.**
> Fecha de la visita = `Appointment.scheduledAt` (el día que se atendió).

No cuentan: citas canceladas, `NO_SHOW`, pendientes ni mensajes de WhatsApp.
Una cita con tres servicios sigue siendo **una** visita.

`firstVisitAt` / `lastVisitAt` / `visitCount` se persisten porque el listado
filtra y ordena por "sin regresar en X días" y eso necesita índice. Pero
**nunca se incrementan a mano**: `recalculateCustomerVisitStats()` los recalcula
enteros con un `aggregate` sobre las citas completadas. Así la columna no puede
quedar a la deriva si una cita cambia de estado, se mueve de contacto o entra
por importación.

Se recalcula al completar una cita y al cambiar el teléfono de una cita ya
completada.

---

## 6. Métricas comerciales (y qué NO existe todavía)

| Métrica | Fuente real |
|---|---|
| Visitas | `Appointment(status = COMPLETED)` |
| Citas totales / completadas / canceladas / no-show / próximas | `Appointment` por `customerId` |
| **Total cotizado** | `Quote(status ∈ SENT, NEEDS_CONFIRMATION)` |
| Promedio por cotización | total cotizado ÷ cotizaciones emitidas |
| Servicios realizados | `serviceOrProduct` de las citas completadas, agrupado |
| Productos cotizados | `QuoteLine` de esas cotizaciones |
| Conversaciones / mensajes | `Conversation` / `Message` |

> ⚠️ **No hay "total consumido".** `QuoteStatus` solo llega hasta
> `SENT`/`NEEDS_CONFIRMATION`: Sendwary todavía no registra ventas cerradas ni
> cobros. Exponer una cotización como dinero facturado sería inventar una cifra,
> así que la ficha muestra **"Total cotizado"** y lo advierte en pantalla.
> Cuando exista el módulo de ventas, `getCustomerCommercialSummary()` es la
> única función que hay que ampliar.

VIP y riesgo de abandono existen como **estado** (`isVip`, `riskStatus`), listos
para que el motor los use. No hay algoritmo predictivo: nada los calcula solo.

---

## 7. Historial (timeline)

`GET /api/customers/:id/timeline` mezcla por fecha, sin copiar nada a una tabla
"timeline": citas, cotizaciones, conversaciones y mensajes automáticos
(`ScheduledMessage`). Paginado de verdad — para servir `[offset, offset+limit)`
pide como mucho `offset+limit` a cada fuente, con techo de 500.

El outbox aporta estado y canal, nunca el destino ni el contenido: repetir eso
en la ficha multiplicaría la PII sin aportar nada.

---

## 8. Importación

CSV y `.xlsx`. Reutiliza multer en memoria + exceljs (misma infraestructura que
el Excel de citas; no hay un segundo sistema de subida). El archivo **nunca**
toca disco.

- Columnas obligatorias: `Nombre`, `Apellido`, `Teléfono`. Opcionales: `Email`,
  `Fecha de nacimiento`, `Cédula`, `Dirección`, `Notas`, `Etiquetas`. Se
  aceptan alias en inglés y sin tildes.
- Validación: extensión + MIME + firma binaria (un `.xlsx` es un ZIP: empieza
  por `PK`; un Excel renombrado a `.csv` se detecta y se rechaza). 5 MB, 5.000
  filas. Las fórmulas se leen por su resultado cacheado; **nunca se evalúan**.
- **Preview** (`/import/preview`) valida y deduplica sin escribir nada.
- **Idempotencia**: la clave es `(tenantId, teléfono E.164)`. Reimportar el
  mismo archivo no crea duplicados.
- Duplicados **dentro** del archivo: la fila 4 con `809-555-5555` y la 91 con
  `+1 809 555 5555` se detectan como el mismo teléfono.
- **Lotes de 100**, no una transacción gigante. Si un lote falla (carrera con
  otro proceso), se reintenta fila a fila: no se pierden 99 clientes buenos por
  uno conflictivo.
- Resultado por fila: `procesados / creados / ya existían / repetidos / con
  errores`, con el mensaje concreto y el id del cliente existente.

---

## 9. Listado

Todo el filtrado es **server-side** (`services/customer/customer.service.ts`).

- **Búsqueda**: nombre, apellido, nombre para mostrar, email y teléfono. El
  teléfono es tolerante al formato: escribir `8095555555` encuentra
  `+18095555555` porque se buscan también las variantes canónicas.
- **Filtros**: tipo (`stage`), etiqueta, riesgo, VIP, origen, sin regresar
  (15/30/60/90+ días), con/sin visitas, rango de última visita, rango de alta.
- **Orden**: última visita, número de visitas, fecha de alta, nombre.
  `lastVisitAt` y `firstVisitAt` ordenan con `nulls: "last"`: quien nunca vino
  no encabeza el listado.
- "Sin regresar" excluye a quien **nunca** visitó (tiene su propio filtro):
  mezclarlos mandaría un seguimiento a alguien que jamás vino.
- Paginación estándar `{ items, total, page, limit, pages, filters }`.

### DTOs

Dos niveles de exposición:

- `CustomerListItem` (tabla): **sin** cédula, dirección, cumpleaños ni notas.
- `CustomerProfile` (`GET /:id`): la ficha completa.

Los logs usan `maskPhone()` (`•••••1234`) y nunca escriben cédulas.

---

## 10. Integración con el Automation Core

Se reutiliza el motor del Módulo 0. **No hay EventBus paralelo.**

| Evento | Cuándo |
|---|---|
| `CUSTOMER_CREATED` | Al confirmarse el `INSERT`, con `idempotencyKey = customer-created:<id>`. Una sola vez, aunque el webhook se reintente o dos procesos compitan. |
| `CUSTOMER_VISITED` | Al completarse una cita (`customer-visited:appointment:<id>`). Reinicia las secuencias de seguimiento 15/30/60/90. |

Preparados en el catálogo del motor, a la espera de quien los emita:
`CUSTOMER_BIRTHDAY` (`birthDate` es `DATE` puro y `utils/timezone.ts` ya resuelve
la ocurrencia anual, con 29 de febrero incluido), `CUSTOMER_INACTIVE_15/30/60/90_DAYS`,
`CUSTOMER_CHURN_RISK`, `CUSTOMER_BECAME_VIP`.

El executor `UPDATE_CUSTOMER_TAG` ahora etiqueta **al cliente** (`Customer.tags`,
el eje del maestro) además de a la conversación activa. Si el contacto no tiene
conversación pero sí quedó etiquetado, la acción se considera cumplida.

---

## 11. Aislamiento multi-tenant

- El `tenantId` sale **siempre** de la sesión (`req.user.tenantId`, cookie
  httpOnly `sid`). Un `tenantId` en el body o la query se ignora.
- `getOwnCustomer(tenantId, id)` es el único punto de lectura por id y devuelve
  **404** (no 403) para un id ajeno: así ni siquiera confirma que exista.
- Los endpoints de resumen, timeline y citas comprueban la pertenencia **antes**
  de agregar nada.
- Cubierto por tests: listado, lectura, edición y agregados.

---

## 12. Eliminación

**No hay `DELETE` físico.** De un cliente cuelgan conversaciones, mensajes,
citas, cotizaciones y jobs de automatización. `PATCH /:id/archive` lo pasa a
`ARCHIVED` (`archivedAt`); restaurar lo devuelve a `CLIENT` o `CONTACT` según
tuviera `clientSince`.

---

## 13. Endpoints

```text
GET    /api/customers                    listado (search, filtros, orden, paginación)
GET    /api/customers/counters           contadores del encabezado
GET    /api/customers/tags               etiquetas en uso (filtro por categoría)
POST   /api/customers                    alta manual            [OWNER/ADMIN]
GET    /api/customers/:id                ficha completa
PATCH  /api/customers/:id                edición                [OWNER/ADMIN]
PATCH  /api/customers/:id/archive        archivar/restaurar     [OWNER/ADMIN]
GET    /api/customers/:id/summary        métricas comerciales
GET    /api/customers/:id/timeline       historial paginado
GET    /api/customers/:id/appointments   citas paginadas
GET    /api/customers/import/template    plantilla .xlsx        [OWNER/ADMIN]
POST   /api/customers/import/preview     validar sin escribir   [OWNER/ADMIN]
POST   /api/customers/import             importar               [OWNER/ADMIN]
```

Todos bajo `requireAuth` + `requireTenantAccess`. Los uploads pasan además por
`uploadRateLimit`.

---

## 14. Migración y backfill

```bash
# 1. Esquema (idempotente, solo ADD/CREATE IF NOT EXISTS)
psql "$DIRECT_URL" -f backend/prisma/sql/2026-08-17_customer_master.sql

# 2. Datos (idempotente; --dry informa sin escribir)
npm run backfill:customers -- --dry
npm run backfill:customers
```

El backfill, por tenant:

1. `phoneNormalized`/`phoneCountry` de quien no lo tenga. Si dos contactos
   resuelven al **mismo** E.164 (duplicado histórico), solo el más antiguo se
   queda con el canónico; el otro queda intacto y se **reporta**. Nada se
   fusiona ni se borra automáticamente: esa decisión es del negocio.
2. `firstName`/`lastName` desde el nombre para mostrar.
3. `Appointment.customerId` por teléfono normalizado. Una cita con un teléfono
   que nunca escribió por WhatsApp da de alta a ese cliente (nombre y teléfono
   salen de la propia cita).
4. `stage = CLIENT` para quien ya tenía cita confirmada o completada.
5. Métricas de visita desde las citas `COMPLETED`.

---

## 15. Riesgos conocidos

| Riesgo | Estado |
|---|---|
| Duplicados históricos con el mismo E.164 | El backfill los reporta; no se fusionan solos. Falta UI de fusión. |
| "Total consumido" real | Bloqueado por la falta de módulo de ventas/cobros. Hoy se muestra lo cotizado, avisando. |
| VIP y riesgo automáticos | Solo el estado, sin evaluador. Los eventos del motor ya existen. |
| Citas con teléfono ilegible | Quedan sin `customerId`; el backfill las cuenta y se vinculan solas si el teléfono se corrige. |
| Importaciones muy grandes | Tope de 5.000 filas por archivo, síncrono. Si crece, moverlo a un job del Módulo 0. |
