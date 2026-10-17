# Categorías y segmentación de clientes — Módulo 2

Clasificación de personas por empresa. Es el eje **consultable** con el que el
negocio encuentra a sus clientes y con el que después se construyen campañas,
promociones y seguimientos.

```text
Tenant
  ↓
CustomerCategory  ──┐
                    ├── CustomerCategoryAssignment ── Customer
                  ──┘
                    ↓
            Automation Core (Módulo 0)
                    ↓
   campañas · promociones · recordatorios segmentados
```

---

## 1. Por qué un modelo nuevo y no `Category`

Ya existía un modelo `Category`, pero es del **catálogo de productos**:
clasifica lo que se vende, no a quién se le vende. Reutilizarlo habría mezclado
dos dominios que se filtran, se cuentan y se archivan por separado.

También existía `Customer.tags` (`text[]`), que el panel llamaba "categorías".
No servía como base: un array de texto no permite conteos eficientes, ni
archivado, ni distinguir una etiqueta puesta a mano de una calculada. Se
sustituyó por la relación real y **las etiquetas existentes se migraron** con
`npm run backfill:customer-categories` — no hay dos sistemas conviviendo.

`Customer.tags` sigue existiendo porque lo escriben la importación y el executor
`UPDATE_CUSTOMER_TAG`; ahora es un **espejo legado**: cada etiqueta que se
escribe crea/asigna además su categoría equivalente.

---

## 2. Modelo

| Modelo | Para qué |
|---|---|
| `CustomerCategory` | La categoría del tenant. Nunca hay categorías globales editables. |
| `CustomerCategoryAssignment` | Pertenencia **activa** de un cliente a una categoría. |

### Campos que importan

| Campo | Por qué existe |
|---|---|
| `slug` | Nombre normalizado. Es la clave real de unicidad. |
| `type` | `MANUAL` · `AUTOMATIC`. |
| `status` | `ACTIVE` · `ARCHIVED`. No hay borrado físico. |
| `color` | Paleta **cerrada** (`purple`, `info`, `success`, `warning`, `danger`, `default`). Un color libre acabaría en `className`. |
| `isSystem` / `systemKey` | Categorías que mantiene Sendwary desde un campo de la ficha. |
| `source` (asignación) | `MANUAL` · `AUTOMATION` · `SYSTEM` · `IMPORT` · `API`. |
| `reason`, `assignedByUserId`, `assignedAt` | Trazabilidad de quién y por qué. |

### Constraints

```text
UNIQUE (tenantId, slug)          → "VIP" y " vip " son la MISMA categoría
UNIQUE (tenantId, systemKey)     → una sola categoría de sistema por clave
UNIQUE (customerId, categoryId)  → barrera dura contra la doble asignación
```

Migración: `prisma/sql/2026-08-18_customer_categories.sql` (incremental,
idempotente, no destructiva).

---

## 3. Unicidad: por qué "VIP", " vip " y "Vip" son lo mismo

`categorySlug()` (módulo puro `customer-category-names.ts`) normaliza a
minúsculas, quita acentos, colapsa espacios y descarta la puntuación:

```text
"VIP" · " vip " · "Vip" · "--VIP--"   → vip
"Coloración" · "coloracion"           → coloracion
```

La unicidad es **por tenant**: dos empresas pueden tener ambas `vip` sin
problema. Nunca es global.

---

## 4. Manual vs automática

| | MANUAL | AUTOMATIC |
|---|---|---|
| Quién la asigna | Una persona del tenant | El sistema |
| ¿Se edita a mano? | Sí | **No** |
| Ejemplos | Coloración, Keratina, Corporativo | VIP, Riesgo de abandono |

**Política (§23): se IMPIDE la edición manual de una categoría automática.**
Quitar a mano algo cuya condición sigue siendo cierta la devolvería en la
siguiente evaluación; el usuario vería la insignia "volver sola" y perdería la
confianza en el panel. La API responde 409 con el motivo y la UI directamente no
ofrece la X.

---

## 5. VIP y riesgo: una sola fuente de verdad

**`Customer.isVip` y `Customer.riskStatus` (Módulo 1) mandan. La segmentación
los refleja.**

```text
Customer.isVip = true
      ↓  syncDomainCategories()
categoría "VIP" asignada (source = SYSTEM)
```

`syncDomainCategories()` corre en `createCustomer` y en `updateCustomer` cuando
esos campos cambian. Por eso **no puede existir** un `isVip = false` con la
insignia VIP puesta.

Estas dos categorías se provisionan solas (`ensureSystemCategories`,
idempotente), no se pueden archivar y **ninguna regla del motor puede moverlas**
(`applyAutomationAssignment` las rechaza).

### Lo que NO se creó

`Nuevo`, `Frecuente` e `Inactivo` **no existen como categorías de sistema**.
Sendwary no ha definido sus umbrales, y una insignia sin criterio real sería una
implementación falsa. Cuando el negocio los decida entran como reglas del
Automation Core, sin tocar este código.

---

## 6. Idempotencia de las asignaciones

```text
assignCategory(cliente, VIP) × 3   →   1 pertenencia, sin error
```

La barrera es el índice único `(customerId, categoryId)`; el "buscar y crear"
solo evita trabajo. Un P2002 se interpreta como "ya estaba", que es el resultado
esperado de un doble clic o del retry de un worker.

**Solo se emite evento cuando la pertenencia cambia de verdad.** Esa ausencia de
evento en el no-op es lo que corta cualquier realimentación entre reglas de
categorías (§54): una cadena se apaga sola en la primera repetición.

---

## 7. Archivado

| | Comportamiento |
|---|---|
| Nuevas asignaciones | Bloqueadas (409) |
| Asignaciones existentes | **Se conservan** — el cliente no pierde historial |
| Listado | Fuera por defecto; con `includeArchived=true` aparecen |
| Categorías de sistema | No se archivan |

No hay `DELETE` físico de una categoría que estuvo asignada: es historial de
segmentación del negocio.

---

## 8. Integración con el Automation Core

**No se construyó un motor paralelo.** Lo que se añadió:

| Pieza | Qué hace |
|---|---|
| `ASSIGN_CUSTOMER_CATEGORY` / `REMOVE_CUSTOMER_CATEGORY` | Executors nuevos. Una categoría automática es una `AutomationRule` normal. |
| `CUSTOMER_CATEGORY_ASSIGNED` / `CUSTOMER_CATEGORY_REMOVED` | Eventos nuevos. Solo se emiten si hubo cambio real. |
| `syncCategoryManagement()` | Recalcula qué categorías son AUTOMATIC a partir de las reglas vivas. |

### Condición "el cliente tiene la categoría X"

El payload de los eventos de categoría lleva `categoryIds` (todas las activas
del cliente tras el cambio), así que el evaluador de condiciones **que ya
existe** resuelve la pregunta sin código nuevo:

```json
{ "field": "categoryIds", "op": "contains", "value": "<categoryId>" }
```

Por **id**, nunca por nombre.

---

## 9. Filtros del listado de clientes

```text
GET /api/customers?categoryIds=a,b&categoryMatch=all
```

| `categoryMatch` | Semántica |
|---|---|
| `all` (por defecto) | El cliente está en **todas** las seleccionadas |
| `any` | Está en **alguna** |

Se resuelve en PostgreSQL junto al resto de filtros, así que el `total` es el
total filtrado y la paginación sigue siendo real. Se combina con búsqueda y
orden sin romperse.

Las insignias de toda la página se resuelven en **una** consulta
(`getCategoryBadgesFor`): nada de N+1.

---

## 10. Endpoints

```text
GET    /api/customer-categories
POST   /api/customer-categories
GET    /api/customer-categories/:id
PATCH  /api/customer-categories/:id
PATCH  /api/customer-categories/:id/archive
POST   /api/customer-categories/:id/customers   (asignación masiva)

GET    /api/customers/:id/categories
POST   /api/customers/:id/categories/:categoryId
DELETE /api/customers/:id/categories/:categoryId
```

Sesión `sid` obligatoria; escritura solo OWNER/ADMIN. El `tenantId` sale
**siempre** de la sesión.

---

## 11. Aislamiento multi-tenant

Antes de asignar se comprueba que **cliente Y categoría** son del tenant
autenticado. Comprobar solo la categoría dejaría pasar cualquier `customerId` de
la URL; comprobar solo el cliente dejaría entrar una categoría ajena. Ambas
comprobaciones existen y hay un test para cada dirección.

Un id de otra empresa devuelve **404, no 403**: no se confirma siquiera que
exista.

---

## 12. Frontend

| Pantalla | Qué hace |
|---|---|
| `/clientes/categorias` | Listado, alta, edición, archivado, conteo real de clientes |
| Ficha del cliente | Tarjeta de categorías: añadir/quitar manuales, ver automáticas |
| Listado de clientes | Filtro por categorías con selector `Todas`/`Alguna` |

Las automáticas llevan una **chispa** y un tooltip que explica quién las
mantiene, en vez de dar un error cuando alguien intenta quitarlas.

---

## 13. Límites técnicos

Son topes antiabuso, **no** límites comerciales de plan:

```text
200 categorías activas por tenant
 40 caracteres de nombre
200 caracteres de descripción
200 clientes por operación masiva
 10 categorías combinables en un filtro
```

---

## 14. Pendiente

- **Importación**: la columna "Etiquetas" del Excel sigue escribiendo en `tags`
  (que ya crea su categoría). No se añadió una columna de categorías dedicada.
- **Nuevo / Frecuente / Inactivo**: a la espera de que el negocio fije umbrales.
- **UI de reglas de segmentación**: el Automation Core no tiene panel todavía,
  así que las categorías automáticas por regla se configuran vía API.
