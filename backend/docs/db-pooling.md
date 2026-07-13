# Connection pooling en producción (PgBouncer / Railway / Azure)

La app usa Prisma 7 con el driver adapter de node-postgres (`@prisma/adapter-pg`),
por lo que el pooling del proceso lo maneja `pg.Pool` y es **compatible con
PgBouncer en transaction mode** sin parámetros especiales (node-postgres envía
las queries como texto simple, sin prepared statements con nombre).

## Variables de entorno

| Variable | Uso | Ejemplo |
|---|---|---|
| `DATABASE_URL` | Conexión por defecto (dev local: directa) | `postgresql://user:pass@localhost:5432/sendwary` |
| `DATABASE_POOL_URL` | Runtime en producción, apuntando al **pooler** (PgBouncer, puerto 6432 típico) | `postgresql://user:pass@pooler-host:6432/sendwary` |
| `DIRECT_URL` | **Solo migraciones/`db push`/seed**: conexión directa a PostgreSQL (PgBouncer transaction mode no soporta los locks de Prisma Migrate) | `postgresql://user:pass@db-host:5432/sendwary` |
| `DB_POOL_MAX` | Conexiones máximas del proceso (default 10) | `10` |
| `DB_POOL_IDLE_MS` | Cierre de conexiones ociosas (default 30000) | `30000` |
| `DB_POOL_CONNECT_TIMEOUT_MS` | Timeout de conexión (default 10000) | `10000` |

Resolución en código:
- Runtime (`src/config/prisma.ts`): `DATABASE_POOL_URL || DATABASE_URL`.
- Migraciones (`prisma.config.ts`): `DIRECT_URL || DATABASE_URL`.

**Dev local no cambia**: con solo `DATABASE_URL` todo funciona igual que antes.

## PgBouncer recomendado

```ini
[pgbouncer]
pool_mode = transaction
max_client_conn = 200
default_pool_size = 20
; ignorar parámetros de sesión que node-pg puede enviar
ignore_startup_parameters = extra_float_digits
```

Notas:
- **Transaction mode**: no usar `SET` de sesión ni `LISTEN/NOTIFY` (la app no los usa).
- Si el proveedor es **Azure Database for PostgreSQL Flexible Server**, tiene
  PgBouncer integrado (puerto 6432): activa "PgBouncer" en el portal y usa esa
  URL como `DATABASE_POOL_URL`; la del puerto 5432 va en `DIRECT_URL`.
- En **Railway Postgres** (sin PgBouncer propio) puedes desplegar PgBouncer como
  servicio aparte o, con poco tráfico, usar la URL directa y `DB_POOL_MAX` bajo
  (cada réplica del backend abre hasta `DB_POOL_MAX` conexiones).
- Dimensionamiento: `réplicas × DB_POOL_MAX` debe quedar por debajo del
  `max_connections` de PostgreSQL (o del `default_pool_size` de PgBouncer).

## Checklist de despliegue

1. `DATABASE_POOL_URL` → pooler (runtime).
2. `DIRECT_URL` → PostgreSQL directo (migraciones).
3. `npx prisma db push` / `migrate deploy` se ejecutan con `DIRECT_URL` automáticamente (prisma.config.ts).
4. Ajustar `DB_POOL_MAX` según réplicas.
