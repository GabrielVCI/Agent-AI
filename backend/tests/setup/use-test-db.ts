/**
 * Guarda de seguridad de las pruebas de integración.
 *
 * Se carga con `--import` ANTES que cualquier suite, de modo que cuando la
 * suite ejecuta su `import "dotenv/config"` las variables ya están puestas
 * (dotenv NO sobrescribe variables existentes, así que este archivo gana).
 *
 * Hace tres cosas y ninguna más:
 *   1. Carga `backend/.env.test`.
 *   2. ABORTA si `DATABASE_URL` no apunta a una base cuyo nombre termina en
 *      `_test`. Es la única barrera que impide que una suite escriba en la
 *      base de desarrollo o —peor— en la de producción.
 *   3. Apaga el worker de automatizaciones por si algún import lo arrancara.
 *
 * No importa Prisma ni ningún servicio: debe poder abortar sin abrir conexiones.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, "..", "..");
const envTestPath = path.join(backendRoot, ".env.test");

/** Sufijo obligatorio del nombre de la base de datos de pruebas. */
const REQUIRED_SUFFIX = "_test";

function abort(title: string, detail: string): never {
  console.error(`\n\x1b[31m✖ ${title}\x1b[0m\n${detail}\n`);
  process.exit(1);
}

// ── 1. Cargar .env.test ──────────────────────────────────────────────────────
if (!fs.existsSync(envTestPath)) {
  abort(
    "No existe backend/.env.test",
    [
      "Las pruebas de integración necesitan su propia base de datos.",
      "",
      "  1. cp backend/.env.test.example backend/.env.test",
      "  2. Ajusta DATABASE_URL con tu contraseña local de PostgreSQL.",
      "  3. npm run test:db:setup     (crea y migra la base de pruebas)",
    ].join("\n")
  );
}

dotenv.config({ path: envTestPath, override: true });

// ── 2. Verificar que apuntamos a la base de PRUEBAS ──────────────────────────
const rawUrl = process.env.DATABASE_URL;

if (!rawUrl) {
  abort("DATABASE_URL no está definida", "Revisa backend/.env.test.");
}

let dbName: string;
try {
  dbName = decodeURIComponent(new URL(rawUrl).pathname.replace(/^\//, ""));
} catch {
  abort("DATABASE_URL no es una URL válida", "Revisa backend/.env.test.");
}

if (!dbName.endsWith(REQUIRED_SUFFIX)) {
  abort(
    "Las pruebas apuntan a una base que NO es de pruebas",
    [
      `  Base detectada : ${dbName}`,
      `  Se exige que el nombre termine en: ${REQUIRED_SUFFIX}`,
      "",
      "Las suites de integración CREAN Y BORRAN datos. Ejecutarlas contra la",
      "base de desarrollo o de producción es destructivo.",
      "",
      "Corrige DATABASE_URL en backend/.env.test y vuelve a intentarlo.",
    ].join("\n")
  );
}

// La URL del pooler tiene prioridad en src/config/prisma.ts; si quedara una de
// otro entorno, las pruebas escribirían fuera de la base de test.
if (process.env.DATABASE_POOL_URL) {
  const poolDb = (() => {
    try {
      return decodeURIComponent(
        new URL(process.env.DATABASE_POOL_URL!).pathname.replace(/^\//, "")
      );
    } catch {
      return "(ilegible)";
    }
  })();

  if (!poolDb.endsWith(REQUIRED_SUFFIX)) {
    abort(
      "DATABASE_POOL_URL apunta fuera de la base de pruebas",
      [
        `  Base detectada : ${poolDb}`,
        "",
        "src/config/prisma.ts prefiere DATABASE_POOL_URL sobre DATABASE_URL,",
        "así que esta variable mandaría sobre la comprobación anterior.",
        "Bórrala de backend/.env.test o apúntala a la base de pruebas.",
      ].join("\n")
    );
  }
}

// ── 3. Entorno seguro para pruebas ───────────────────────────────────────────
process.env.NODE_ENV = "test";
// El worker procesa jobs reales: jamás debe arrancar dentro de una suite.
process.env.AUTOMATION_WORKER_ENABLED = "false";

console.log(`\x1b[32m✔\x1b[0m base de pruebas: ${dbName}`);
