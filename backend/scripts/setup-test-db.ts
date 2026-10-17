/**
 * Prepara la base de datos de PRUEBAS desde cero, de forma reproducible.
 *
 *   npm run test:db:setup
 *
 * Qué hace:
 *   1. Lee backend/.env.test (y exige que la base termine en `_test`).
 *   2. Crea la base si no existe (CREATE DATABASE — nunca la borra).
 *   3. Aplica `prisma migrate deploy`: reconstruye el esquema SOLO desde
 *      prisma/migrations. Si esto falla, el historial de migraciones está roto
 *      otra vez y hay que arreglarlo antes de seguir escribiendo pruebas.
 *   4. Verifica que el esquema resultante coincide con schema.prisma.
 *
 * Es idempotente: correrlo dos veces no cambia nada la segunda vez.
 * NUNCA toca la base de desarrollo ni la de producción.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, "..");
const envTestPath = path.join(backendRoot, ".env.test");

const REQUIRED_SUFFIX = "_test";

function fail(title: string, detail: string): never {
  console.error(`\n\x1b[31m✖ ${title}\x1b[0m\n${detail}\n`);
  process.exit(1);
}

function step(msg: string): void {
  console.log(`\x1b[36m→\x1b[0m ${msg}`);
}

function ok(msg: string): void {
  console.log(`\x1b[32m✔\x1b[0m ${msg}`);
}

// ── 1. Configuración ─────────────────────────────────────────────────────────
if (!fs.existsSync(envTestPath)) {
  fail(
    "Falta backend/.env.test",
    "Cópialo de la plantilla:  cp backend/.env.test.example backend/.env.test"
  );
}

dotenv.config({ path: envTestPath, override: true });

const testUrl = process.env.DATABASE_URL;
if (!testUrl) fail("DATABASE_URL no está definida en .env.test", "");

const parsed = new URL(testUrl);
const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));

if (!dbName.endsWith(REQUIRED_SUFFIX)) {
  fail(
    "La base configurada no es una base de pruebas",
    `  Base : ${dbName}\n  Se exige que el nombre termine en "${REQUIRED_SUFFIX}".`
  );
}

console.log(`\nBase de pruebas: \x1b[1m${dbName}\x1b[0m en ${parsed.host}\n`);

// ── 2. Crear la base si no existe ────────────────────────────────────────────
const adminUrl = new URL(testUrl);
adminUrl.pathname = "/postgres";
adminUrl.search = "";

const admin = new pg.Client({ connectionString: adminUrl.toString() });

step(`Comprobando si existe la base "${dbName}"...`);
await admin.connect();

const existing = await admin.query("select 1 from pg_database where datname = $1", [dbName]);

if (existing.rowCount === 0) {
  // El nombre no puede parametrizarse en DDL; va entrecomillado como identificador.
  await admin.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
  ok(`Base "${dbName}" creada.`);
} else {
  ok(`La base "${dbName}" ya existía (no se toca).`);
}

await admin.end();

// ── 3. Aplicar migraciones ───────────────────────────────────────────────────
step("Aplicando prisma migrate deploy (solo desde prisma/migrations)...");

try {
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: backendRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      // prisma.config.ts usa DIRECT_URL antes que DATABASE_URL.
      DIRECT_URL: testUrl,
    },
  });
} catch {
  fail(
    "migrate deploy falló",
    [
      "El esquema NO se puede reconstruir desde prisma/migrations.",
      "Es el síntoma del drift que la fase de QA vino a resolver: arréglalo",
      "antes de escribir más pruebas (docs/qa/QA_TEST_DATABASE.md).",
    ].join("\n")
  );
}

ok("Migraciones aplicadas.");

// ── 4. Verificar que el esquema coincide con schema.prisma ───────────────────
step("Verificando que el esquema resultante coincide con schema.prisma...");

let drift = false;
try {
  execFileSync(
    "npx",
    [
      "prisma",
      "migrate",
      "diff",
      "--from-config-datasource",
      "--to-schema=prisma/schema.prisma",
      "--exit-code",
    ],
    {
      cwd: backendRoot,
      stdio: "pipe",
      shell: process.platform === "win32",
      env: { ...process.env, DIRECT_URL: testUrl },
    }
  );
} catch (err) {
  // --exit-code: 2 = hay diferencias, 1 = error del comando.
  drift = (err as { status?: number }).status === 2;
  if (!drift) {
    fail("No se pudo verificar el esquema", String((err as Error).message).slice(0, 400));
  }
}

if (drift) {
  fail(
    "La base de pruebas NO coincide con schema.prisma",
    [
      "Las migraciones producen un esquema distinto al del schema.",
      "Genera la migración que falta antes de seguir:",
      "",
      "  npx prisma migrate diff --from-migrations prisma/migrations \\",
      "      --to-schema=prisma/schema.prisma --script",
    ].join("\n")
  );
}

ok("El esquema coincide exactamente con schema.prisma.");

// ── 5. Resumen ───────────────────────────────────────────────────────────────
const client = new pg.Client({ connectionString: testUrl });
await client.connect();
const tables = await client.query(
  "select count(*)::int as n from information_schema.tables where table_schema = 'public'"
);
await client.end();

console.log(
  `\n\x1b[32m✔ Base de pruebas lista\x1b[0m — ${tables.rows[0].n} tablas en "${dbName}".\n` +
    `  Ejecuta las suites con:  npm run test:db\n`
);
