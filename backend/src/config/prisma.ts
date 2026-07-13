import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const { Pool } = pg;

/**
 * Conexión a PostgreSQL (Prisma 7 + driver adapter node-postgres).
 *
 * Producción (Railway/Azure + PgBouncer):
 *  - DATABASE_POOL_URL: URL del pooler (PgBouncer en transaction mode) que usa
 *    la app en runtime. Si no existe, se usa DATABASE_URL (dev local directo).
 *  - DIRECT_URL: URL directa a PostgreSQL SOLO para migraciones/db push
 *    (ver prisma.config.ts) — PgBouncer en transaction mode no soporta los
 *    advisory locks que usa Prisma Migrate.
 *  - node-postgres envía las queries como texto simple (sin prepared
 *    statements con nombre), por lo que es compatible con transaction mode
 *    sin parámetros extra.
 *  - DB_POOL_MAX limita las conexiones del proceso; con PgBouncer delante
 *    puede quedarse bajo (el pooler multiplexa).
 */
const connectionString = process.env.DATABASE_POOL_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL no está definida en el archivo .env");
}

const pool = new Pool({
  connectionString,
  max: Number(process.env.DB_POOL_MAX ?? 10),
  idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_MS ?? 30_000),
  connectionTimeoutMillis: Number(process.env.DB_POOL_CONNECT_TIMEOUT_MS ?? 10_000),
});

const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({
  adapter,
  log:
    process.env.NODE_ENV === "development"
      ? ["query", "info", "warn", "error"]
      : ["error"],
});
