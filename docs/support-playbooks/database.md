# Playbook: Base de datos (PostgreSQL/Prisma)

- **Feature**: PostgreSQL con Prisma 7 (driver adapter pg), pooling preparado para PgBouncer.
- **Tier por defecto**: TIER_3 · **Riesgo**: CRÍTICO (nada automático, nunca SQL arbitrario)

## Descripción
Runtime usa `DATABASE_POOL_URL || DATABASE_URL`; migraciones usan `DIRECT_URL || DATABASE_URL` (ver `backend/docs/db-pooling.md`). El schema tiene drift conocido: SIEMPRE `prisma db push`, NUNCA `migrate dev` ni `migrate reset`.

## Errores comunes y síntomas
| Síntoma | Causa |
|---|---|
| App entera con 500 / "No se pudo conectar" | DB caída o pool agotado |
| Lentitud generalizada | Conexiones agotadas (réplicas × DB_POOL_MAX > capacidad), consultas pesadas |
| Errores P2021/P2022 de Prisma | Schema desincronizado (falta db push tras deploy) |
| Timeout solo en migraciones | Corriendo migraciones a través de PgBouncer transaction mode (usar DIRECT_URL) |

## Diagnóstico
1. `GET /api/support/health` → db.ok y latencia.
2. Revisar métricas del proveedor (Azure/Railway): conexiones activas, CPU, storage.

## Pasos de solución (humano SIEMPRE)
- Pool agotado → bajar DB_POOL_MAX por réplica o subir default_pool_size de PgBouncer.
- Drift tras deploy → `npx prisma db push` con DIRECT_URL.
- Nunca: reset de BD, borrado de tablas, SQL generado por IA.

## Automatizable por el agente
- SOLO diagnóstico: reportar health y crear el incidente. Ninguna acción de escritura.

## Logs / env / endpoints
- Env: `DATABASE_URL`, `DATABASE_POOL_URL`, `DIRECT_URL`, `DB_POOL_MAX`, `DB_POOL_IDLE_MS`, `DB_POOL_CONNECT_TIMEOUT_MS`.
- Endpoints: `GET /api/support/health`.

## Escalamiento
Cualquier síntoma de DB = Tier 3 directo: crear incidente CRITICAL, notificar SUPER_ADMIN, adjuntar health + hora de inicio, y NO intentar remediación automática.
