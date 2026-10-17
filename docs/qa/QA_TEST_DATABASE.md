# Sendwary — Base de datos de pruebas y baseline de migraciones

> **Creado:** 2026-09-09 · Paso 2 del plan de QA (`QA_INITIAL_AUDIT.md` §13).
> Resuelve los dos bloqueadores de la auditoría: **H1** (drift de Prisma) y
> **H2** (las pruebas escribían en la base de desarrollo).

---

## 1. Para empezar (máquina nueva)

```bash
cd backend
cp .env.test.example .env.test     # ajusta la contraseña de PostgreSQL
npm run test:db:setup              # crea la base de pruebas y la migra
npm run test:db                    # 112 casos de integración
```

`test:db:setup` es **idempotente**: si la base ya existe, no la toca; si ya está
migrada, no aplica nada. Nunca borra la base ni sus datos.

---

## 2. Qué bases existen ahora

| Base | Para qué | Quién escribe |
|---|---|---|
| `ferreteria_ai_agent` | Desarrollo diario | La app (`npm run dev`) |
| `ferreteria_ai_agent_test` | **Pruebas de integración** | Solo las suites |
| `ferreteria_ai_agent_shadow` | Base desechable de Prisma | Prisma la **vacía** en cada uso |

⚠️ La base *shadow* se reinicia sola: **nunca apuntarla a datos reales**.

---

## 3. La guarda de seguridad

`backend/tests/setup/use-test-db.ts` se carga con `--import` **antes** que
cualquier suite y aborta la corrida si la base no es de pruebas:

```
✖ Las pruebas apuntan a una base que NO es de pruebas
  Base detectada : ferreteria_ai_agent
  Se exige que el nombre termine en: _test
```

Comprueba tres cosas:

1. `DATABASE_URL` apunta a una base cuyo nombre **termina en `_test`**.
2. `DATABASE_POOL_URL`, si existe, también — porque `src/config/prisma.ts` la
   prefiere sobre `DATABASE_URL` y si no se mirara, mandaría sobre la regla 1.
3. Fija `NODE_ENV=test` y `AUTOMATION_WORKER_ENABLED=false`, para que ninguna
   suite arranque el worker y procese jobs reales.

**Verificado el 2026-09-09**: apuntada a propósito a la base de desarrollo, la
guarda abortó antes de abrir una sola conexión.

> Convención: cualquier suite nueva que toque la base debe ejecutarse con
> `--import ./tests/setup/use-test-db.ts`. Sin eso, no hay red de seguridad.

---

## 4. El baseline de migraciones (cómo se resolvió el drift)

### El problema

Entre junio y septiembre de 2026 el esquema creció con `prisma db push` + los
scripts manuales de `prisma/sql/`. El historial quedó congelado:

```
43 tablas en la base   ·   3 migraciones registradas   ·   42 modelos en el schema
```

No se podía reconstruir la base desde cero → ni base de pruebas, ni CI.

### La solución

Se generó una migración de puesta al día con el diff **exacto** entre el
historial y el schema:

```bash
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema=prisma/schema.prisma \
  --script
```

→ `prisma/migrations/20260909221900_catchup_schema_modulos_0_4/migration.sql`
(1043 líneas: 21 `CREATE TABLE`, 40 `CREATE TYPE`, 89 índices, 44 `ALTER TABLE`;
**cero** `DROP TABLE`, `DROP COLUMN`, `TRUNCATE` o `DELETE`).

Luego se registró como aplicada en desarrollo **sin ejecutar el SQL**:

```bash
npx prisma migrate resolve --applied 20260909221900_catchup_schema_modulos_0_4
```

`migrate resolve --applied` solo inserta una fila en `_prisma_migrations`. La
base de desarrollo no se tocó: se verificó antes y después (43 tablas,
11 tenants / 14 usuarios / 13 clientes / 9 citas / 9 conversaciones, idénticos).

### La prueba de que funciona

Sobre la base de pruebas **vacía**, `prisma migrate deploy` reconstruyó el
esquema completo: **43 tablas**, y el diff contra `schema.prisma` salió
**vacío**. Es decir, el historial vuelve a ser capaz de crear la base desde cero.

---

## 5. Estado tras el paso 2 **[VERIFICADO ejecutando]**

| Comando | Resultado |
|---|---|
| `npm run test:unit` | 56/56 ✅ |
| `npm run test:db:setup` | 43 tablas, esquema idéntico al schema ✅ |
| `npm run test:db` | **112/112 ✅** (primera vez que se verifican) |
| `npm run typecheck` | exit 0 ✅ |
| `npx prisma migrate status` (dev) | *Database schema is up to date!* ✅ |

**168 de 168 casos verdes**, y ninguno escribe ya en la base de desarrollo.

---

## 6. Deuda conocida que queda

### 6.1 Cuatro `DEFAULT` de más en la base de desarrollo

> **Actualización 2026-09-23:** el drift de dev creció. Ahora también hay dos
> columnas de `Plan` fuera del schema **con datos** (`LemonSqueezyID`,
> `LemonSqueezyVariantID`), así que `migrate dev` en dev **ya no es seguro**:
> generaría un `DROP COLUMN`. Ver `QA_DATABASE.md` §2 (R16).

`migrate diff` entre la base de dev y el schema reporta:

```sql
ALTER TABLE "AppointmentLine" ALTER COLUMN "unitPriceSnapshot" DROP DEFAULT,
  ALTER COLUMN "totalSnapshot" DROP DEFAULT,
  ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "CustomerCategory" ALTER COLUMN "updatedAt" DROP DEFAULT;
```

Son residuo de los SQL manuales, que añadieron columnas con `DEFAULT` para poder
hacerlo sobre tablas que ya tenían filas. **No se aplicó la corrección**: tocar
la base de desarrollo no era necesario y el paso 2 era de infraestructura.

Impacto real: **ninguno en las pruebas**. Prisma siempre envía valores
explícitos, así que el default nunca se usa. La base de pruebas y la de CI se
construyen desde migraciones y **no** tienen esos defaults, así que el entorno de
pruebas es el correcto; el desviado es dev.

Cuándo resolverlo: en la próxima ventana de mantenimiento de dev, o dejarlo
morir cuando se recree la base. **No** ejecutar ese ALTER en producción sin
comprobar antes que producción tiene el mismo desvío.

### 6.2 Producción todavía no tiene el baseline registrado

Cuando se despliegue, producción tendrá el esquema (creado con `db push` + SQL
manual) pero solo 3 migraciones registradas. **Antes del primer `migrate deploy`
en producción** hay que registrar la migración de puesta al día igual que en dev:

```bash
# En producción, UNA SOLA VEZ, con DIRECT_URL apuntando a la base real:
npx prisma migrate resolve --applied 20260909221900_catchup_schema_modulos_0_4
```

⚠️ Si se ejecuta `migrate deploy` **sin** ese `resolve`, Prisma intentará crear
tablas que ya existen, la migración quedará marcada como fallida y el despliegue
se bloqueará. Verificar antes con `npx prisma migrate status`.

### 6.3 `[DEBUG-AUTH]` se activa en `NODE_ENV=test`

Las guardas de log en `auth.middleware.ts`, `roles.middleware.ts` y
`auth.service.ts` usan `NODE_ENV !== "production"`. Hoy no molesta (las suites de
servicio no pasan por los middlewares), pero **sepultará la salida de las pruebas
HTTP del paso 5**. Cambiar a `NODE_ENV === "development"` antes de escribirlas.

---

## 7. Recetas

**Recrear la base de pruebas desde cero** (si se corrompe):

```bash
psql "postgresql://postgres:PASS@localhost:5432/postgres" \
  -c 'DROP DATABASE ferreteria_ai_agent_test'
npm run test:db:setup
```

**Comprobar que la base de desarrollo sigue en sync con el schema:**

```bash
npx prisma migrate status
npx prisma migrate diff --from-config-datasource \
  --to-schema=prisma/schema.prisma --exit-code   # 0 = sin diferencias
```

**Añadir un cambio de esquema a partir de ahora** — ya se puede usar el flujo
normal de Prisma, que es la razón de haber hecho todo esto:

```bash
npx prisma migrate dev --name descripcion_del_cambio
```

> El aviso de la auditoría de **no ejecutar `migrate dev`** queda **levantado**
> para desarrollo: ya no hay drift, así que Prisma no propondrá ningún reset.
> Si alguna vez lo propone, **cancelar** y revisar el drift antes de continuar —
> nunca aceptar un reset sobre una base con datos.

---

## 8. Qué NO cambió en este paso

Ni una línea de código funcional. El paso 2 tocó solo:

| Archivo | Cambio |
|---|---|
| `prisma.config.ts` | +`shadowDatabaseUrl` (opt-in; sin la variable, comportamiento idéntico al anterior) |
| `package.json` | +`test:db:setup`; los `test:db:*` ahora cargan la guarda |
| `prisma/migrations/20260909221900_.../migration.sql` | **nuevo** (baseline) |
| `tests/setup/use-test-db.ts` | **nuevo** (guarda) |
| `scripts/setup-test-db.ts` | **nuevo** (preparación reproducible) |
| `.env.test.example` | **nuevo** (plantilla versionable) |
| `.env.test` | **nuevo**, ignorado por git (lleva contraseña local) |
| `.env.example` | +`DIRECT_URL`, +`SHADOW_DATABASE_URL` documentadas |
| `.gitignore` | +`.env.test` |

Backup previo de la base de desarrollo:
`../ferreteria-ai-agent-backups/pre-qa-baseline_20260909_221839.dump`
(206 KB, formato custom de `pg_dump` 18.3, **fuera del repositorio**).

Restaurar, si alguna vez hiciera falta:

```bash
pg_restore --clean --if-exists -d "postgresql://…/ferreteria_ai_agent" archivo.dump
```
