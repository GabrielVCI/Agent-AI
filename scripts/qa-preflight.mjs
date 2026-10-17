#!/usr/bin/env node
/**
 * qa-preflight — Verificación estática previa a cualquier pasada de QA.
 * ---------------------------------------------------------------------------
 * Comprueba, en los tres paquetes (backend, frontend, webpage):
 *
 *   1. dependencias instaladas y coherentes
 *   2. lint
 *   3. TypeScript (tipos)
 *   4. build de backend
 *   5. build de frontend y de webpage
 *   6. `prisma validate`
 *   7. estado de migraciones (solo lectura; se omite con --skip-db)
 *   8. variables de entorno requeridas
 *   9. ausencia de secretos en bundles públicos y en git
 *  10. configuración básica del repositorio
 *
 * NO ejecuta las suites de pruebas: eso son las fases 4-6 del
 * LOCAL_QA_RUNBOOK. Este script es la fase 0.5 — lo que debe estar verde
 * ANTES de gastar 8 minutos en pruebas.
 *
 * REGLA DE SEGURIDAD (docs/qa/QA_RULES.md §5): este script NUNCA imprime el
 * valor de una variable de entorno ni de un secreto. Solo imprime el NOMBRE y
 * uno de estos estados: PRESENT · MISSING · INVALID CONFIGURATION.
 * Los valores se leen en memoria únicamente para compararlos contra los
 * bundles públicos, y jamás salen por stdout.
 *
 * Uso:
 *   node scripts/qa-preflight.mjs [opciones]
 *   cd backend && npm run qa:preflight
 *
 * Opciones:
 *   --quick        no ejecuta builds (equivale a --skip-build)
 *   --skip-build   no ejecuta builds (el escaneo de bundles usa el dist actual)
 *   --skip-lint    no ejecuta lint
 *   --skip-types   no ejecuta typecheck
 *   --skip-db      no consulta el estado de migraciones (no toca PostgreSQL)
 *   --json         además del informe, imprime el resultado como JSON
 *   --no-color     salida sin códigos ANSI
 *
 * Exit code: 0 si no hay ningún FAIL. 1 si hay al menos uno.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKEND = path.join(ROOT, "backend");
const FRONTEND = path.join(ROOT, "frontend");
const WEBPAGE = path.join(ROOT, "webpage");

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const OPT = {
  build: !(has("--skip-build") || has("--quick")),
  lint: !has("--skip-lint"),
  types: !has("--skip-types"),
  db: !has("--skip-db"),
  json: has("--json"),
  color: !has("--no-color"),
};

/** Errores de lint preexistentes del backend, revisados uno por uno y
 *  documentados en docs/qa/QA_LINT_AND_TYPECHECK.md §6.2. Ninguno es un bug.
 *  Si el número BAJA, actualizar esta constante. Si SUBE, hay errores nuevos
 *  y el preflight falla. */
const BACKEND_LINT_ERROR_BASELINE = 8;

/** Node mínimo soportado. */
const MIN_NODE_MAJOR = 20;

// ───────────────────────────── infraestructura ─────────────────────────────

const results = [];
/** ESC (0x1b) construido en código: así el archivo no lleva caracteres de
 *  control literales, que algunos editores y diffs destrozan. */
const E = String.fromCharCode(27);
const C = OPT.color
  ? {
      red: `${E}[31m`,
      green: `${E}[32m`,
      yellow: `${E}[33m`,
      gray: `${E}[90m`,
      cyan: `${E}[36m`,
      bold: `${E}[1m`,
      off: `${E}[0m`,
    }
  : { red: "", green: "", yellow: "", gray: "", cyan: "", bold: "", off: "" };

const BADGE = {
  PASS: `${C.green}PASS${C.off}`,
  FAIL: `${C.red}FAIL${C.off}`,
  WARN: `${C.yellow}WARN${C.off}`,
  SKIP: `${C.gray}SKIP${C.off}`,
};

function record(id, area, name, status, detail, extra = {}) {
  const r = { id, area, name, status, detail, ...extra };
  results.push(r);
  const cmd = extra.cmd
    ? `${C.gray} [${extra.cmd}${extra.exit !== undefined ? ` → exit ${extra.exit}` : ""}]${C.off}`
    : "";
  console.log(`  ${BADGE[status]}  ${id.padEnd(10)} ${name}${detail ? ` — ${detail}` : ""}${cmd}`);
  return r;
}

function section(title) {
  console.log(`\n${C.bold}${C.cyan}${title}${C.off}`);
}

/** Ejecuta un comando y devuelve {exit, out}. Nunca lanza. */
function run(cmd, cwd, timeout = 600_000) {
  const started = Date.now();
  const res = spawnSync(cmd, { cwd, shell: true, encoding: "utf8", timeout, windowsHide: true });
  const out = `${res.stdout || ""}${res.stderr || ""}`;
  return {
    exit: res.status === null ? -1 : res.status,
    out,
    ms: Date.now() - started,
    timedOut: res.error?.code === "ETIMEDOUT",
  };
}

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

/** Parser mínimo de .env. Devuelve un Map nombre→valor. No imprime nada. */
function readEnvFile(file) {
  const map = new Map();
  if (!exists(file)) return map;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, "");
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    map.set(key, value);
  }
  return map;
}

/** Enmascara una URL de base de datos: postgresql://user:pass@host/db → ***. */
function maskDbUrl(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//***@${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return "(URL no parseable)";
  }
}

function listFilesRecursive(dir, exts, acc = []) {
  if (!exists(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listFilesRecursive(full, exts, acc);
    else if (exts.some((e) => entry.name.endsWith(e))) acc.push(full);
  }
  return acc;
}

const PACKAGES = [
  { name: "backend", dir: BACKEND },
  { name: "frontend", dir: FRONTEND },
  { name: "webpage", dir: WEBPAGE },
];

// ───────────────────────────── 1 · dependencias ─────────────────────────────

function checkDependencies() {
  section("1 · Dependencias");

  const major = Number(process.versions.node.split(".")[0]);
  record(
    "DEP-node",
    "deps",
    `Node ${process.versions.node}`,
    major >= MIN_NODE_MAJOR ? "PASS" : "FAIL",
    major >= MIN_NODE_MAJOR ? `>= ${MIN_NODE_MAJOR} requerido` : `se requiere Node >= ${MIN_NODE_MAJOR}`
  );

  for (const pkg of PACKAGES) {
    const id = `DEP-${pkg.name.slice(0, 3)}`;
    if (!exists(path.join(pkg.dir, "package.json"))) {
      record(id, "deps", `${pkg.name}: package.json`, "FAIL", "no existe");
      continue;
    }
    if (!exists(path.join(pkg.dir, "node_modules"))) {
      record(id, "deps", `${pkg.name}: node_modules`, "FAIL", "faltan dependencias — ejecutar `npm install`");
      continue;
    }
    const { exit, out } = run("npm ls --depth=0 --silent", pkg.dir, 180_000);
    if (exit === 0) {
      record(id, "deps", `${pkg.name}: árbol de dependencias`, "PASS", "coherente", {
        cmd: `${pkg.name}: npm ls --depth=0`,
        exit,
      });
    } else {
      const problems = out
        .split(/\r?\n/)
        .filter((l) => /UNMET|invalid|missing|extraneous/i.test(l))
        .slice(0, 3);
      record(
        id,
        "deps",
        `${pkg.name}: árbol de dependencias`,
        "FAIL",
        problems.length ? problems.join(" · ").slice(0, 220) : "npm ls devolvió error",
        { cmd: `${pkg.name}: npm ls --depth=0`, exit }
      );
    }

    // Lockfiles duplicados: npm y pnpm resolviendo el mismo árbol acaban en
    // versiones distintas entre tu máquina y el servidor de despliegue.
    const locks = ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb"].filter((f) =>
      exists(path.join(pkg.dir, f))
    );
    if (locks.length === 0) {
      record(`${id}-lock`, "deps", `${pkg.name}: lockfile`, "FAIL", "no hay lockfile: la instalación no es reproducible");
    } else if (locks.length > 1) {
      record(
        `${id}-lock`,
        "deps",
        `${pkg.name}: lockfile`,
        "WARN",
        `hay ${locks.length} lockfiles (${locks.join(", ")}): el despliegue puede resolver versiones distintas`
      );
    } else {
      record(`${id}-lock`, "deps", `${pkg.name}: lockfile`, "PASS", locks[0]);
    }
  }
}

// ───────────────────────────────── 2 · lint ─────────────────────────────────

function parseEslintCounts(out) {
  // "✖ 42 problems (8 errors, 34 warnings)"
  const m = out.match(/(\d+)\s+problems?\s+\((\d+)\s+errors?,\s+(\d+)\s+warnings?\)/);
  if (m) return { errors: Number(m[2]), warnings: Number(m[3]) };
  return null;
}

function checkLint() {
  section("2 · Lint");
  if (!OPT.lint) {
    record("LINT", "lint", "lint de los tres paquetes", "SKIP", "--skip-lint");
    return;
  }

  for (const pkg of PACKAGES) {
    const { exit, out } = run("npm run lint --silent", pkg.dir, 300_000);
    const counts = parseEslintCounts(out) || { errors: exit === 0 ? 0 : NaN, warnings: 0 };
    const label = `${pkg.name}: eslint`;
    const detail = Number.isNaN(counts.errors)
      ? "no se pudo interpretar la salida de eslint"
      : `${counts.errors} errores · ${counts.warnings} warnings`;

    if (pkg.name === "backend") {
      // Excepción conocida: QA_RULES.md §7. Los errores preexistentes no
      // bloquean; los NUEVOS sí.
      if (Number.isNaN(counts.errors)) {
        record("LINT-be", "lint", label, "FAIL", detail, { cmd: "backend: npm run lint", exit });
      } else if (counts.errors > BACKEND_LINT_ERROR_BASELINE) {
        record(
          "LINT-be",
          "lint",
          label,
          "FAIL",
          `${detail} — ${counts.errors - BACKEND_LINT_ERROR_BASELINE} error(es) NUEVO(s) sobre la línea base de ${BACKEND_LINT_ERROR_BASELINE}`,
          { cmd: "backend: npm run lint", exit }
        );
      } else if (counts.errors === BACKEND_LINT_ERROR_BASELINE) {
        record("LINT-be", "lint", label, "WARN", `${detail} — línea base conocida (QA_RULES §7), ninguno es un bug`, {
          cmd: "backend: npm run lint",
          exit,
        });
      } else {
        record(
          "LINT-be",
          "lint",
          label,
          "PASS",
          `${detail} — por debajo de la línea base (${BACKEND_LINT_ERROR_BASELINE}): bajar BACKEND_LINT_ERROR_BASELINE en este script`,
          { cmd: "backend: npm run lint", exit }
        );
      }
      continue;
    }

    const id = pkg.name === "frontend" ? "LINT-fe" : "LINT-web";
    record(id, "lint", label, counts.errors === 0 ? "PASS" : "FAIL", detail, {
      cmd: `${pkg.name}: npm run lint`,
      exit,
    });
  }
}

// ────────────────────────────── 3 · TypeScript ──────────────────────────────

function checkTypes() {
  section("3 · TypeScript");
  if (!OPT.types) {
    record("TS", "types", "typecheck", "SKIP", "--skip-types");
    return;
  }

  const be = run("npm run typecheck --silent", BACKEND, 600_000);
  record(
    "TS-be",
    "types",
    "backend: tsc src + tests",
    be.exit === 0 ? "PASS" : "FAIL",
    be.exit === 0 ? "sin errores de tipos" : `${be.out.match(/error TS\d+/g)?.length ?? "?"} errores de tipos`,
    { cmd: "backend: npm run typecheck", exit: be.exit }
  );

  // ⚠️ frontend y webpage usan project references: `tsc --noEmit` NO comprueba
  // nada. Hay que usar `tsc -b`. Documentado en LOCAL_QA_RUNBOOK fase 2.
  for (const pkg of [
    { name: "frontend", dir: FRONTEND, id: "TS-fe" },
    { name: "webpage", dir: WEBPAGE, id: "TS-web" },
  ]) {
    const r = run("npx tsc -b", pkg.dir, 600_000);
    record(
      pkg.id,
      "types",
      `${pkg.name}: tsc -b`,
      r.exit === 0 ? "PASS" : "FAIL",
      r.exit === 0 ? "sin errores de tipos" : `${r.out.match(/error TS\d+/g)?.length ?? "?"} errores de tipos`,
      { cmd: `${pkg.name}: npx tsc -b`, exit: r.exit }
    );
  }
}

// ──────────────────────────────── 4-5 · build ───────────────────────────────

function checkBuilds() {
  section("4-5 · Builds");
  if (!OPT.build) {
    record(
      "BUILD",
      "build",
      "builds de backend, frontend y webpage",
      "SKIP",
      "--skip-build (el escaneo de bundles usará el dist existente)"
    );
    return;
  }

  const be = run("npm run build --silent", BACKEND, 600_000);
  record(
    "BUILD-be",
    "build",
    "backend: tsc → dist/",
    be.exit === 0 ? "PASS" : "FAIL",
    be.exit === 0 ? `dist/ generado en ${(be.ms / 1000).toFixed(1)}s` : "el build falló",
    { cmd: "backend: npm run build", exit: be.exit }
  );

  const fe = run("npm run build --silent", FRONTEND, 600_000);
  record(
    "BUILD-fe",
    "build",
    "frontend: vite build",
    fe.exit === 0 ? "PASS" : "FAIL",
    fe.exit === 0 ? `dist/ generado en ${(fe.ms / 1000).toFixed(1)}s` : "el build falló (es el comando que corre Netlify)",
    { cmd: "frontend: npm run build", exit: fe.exit }
  );

  // webpage tiene prebuild (sitemap) y postbuild (prerender con Puppeteer):
  // si no hay Chrome descargado, el postbuild falla sin que el bundle esté mal.
  const web = run("npm run build --silent", WEBPAGE, 900_000);
  const prerenderFailed = web.exit !== 0 && /puppeteer|chrome|browser was not found|prerender/i.test(web.out);
  record(
    "BUILD-web",
    "build",
    "webpage: vite build + prerender",
    web.exit === 0 ? "PASS" : prerenderFailed ? "WARN" : "FAIL",
    web.exit === 0
      ? `dist/ generado en ${(web.ms / 1000).toFixed(1)}s`
      : prerenderFailed
        ? "el bundle se generó pero el prerender (Puppeteer) falló — revisar antes de desplegar"
        : "el build falló",
    { cmd: "webpage: npm run build", exit: web.exit }
  );
}

// ─────────────────────────── 6-7 · Prisma / migraciones ─────────────────────

function checkPrisma() {
  section("6-7 · Prisma");

  const schema = path.join(BACKEND, "prisma", "schema.prisma");
  if (!exists(schema)) {
    record("PRI-1", "prisma", "prisma/schema.prisma", "FAIL", "no existe");
    return;
  }

  const v = run("npx prisma validate", BACKEND, 180_000);
  record(
    "PRI-1",
    "prisma",
    "prisma validate",
    v.exit === 0 ? "PASS" : "FAIL",
    v.exit === 0 ? "el esquema es válido" : "el esquema NO es válido",
    { cmd: "backend: npx prisma validate", exit: v.exit }
  );

  const migDir = path.join(BACKEND, "prisma", "migrations");
  const migrations = exists(migDir)
    ? fs.readdirSync(migDir, { withFileTypes: true }).filter((d) => d.isDirectory()).length
    : 0;
  record(
    "PRI-2",
    "prisma",
    "historial de migraciones",
    migrations > 0 ? "PASS" : "FAIL",
    `${migrations} migración(es) en prisma/migrations/`
  );

  if (!OPT.db) {
    record("PRI-3", "prisma", "prisma migrate status", "SKIP", "--skip-db: no se consultó PostgreSQL");
    return;
  }

  // `migrate status` es de SOLO LECTURA: consulta _prisma_migrations y compara.
  // No aplica, no borra y no resetea nada. Es el único comando de Prisma que
  // este script ejecuta contra una base (QA_RULES.md §3).
  const st = run("npx prisma migrate status", BACKEND, 180_000);
  const out = st.out;
  const cmdMeta = { cmd: "backend: npx prisma migrate status", exit: st.exit };
  if (/Database connection error|Can't reach database|P1001|ECONNREFUSED/i.test(out)) {
    record("PRI-3", "prisma", "prisma migrate status", "SKIP", "PostgreSQL no responde en local: no se pudo comprobar", cmdMeta);
  } else if (/up to date/i.test(out)) {
    record("PRI-3", "prisma", "prisma migrate status", "PASS", "el esquema de la base coincide con el historial", cmdMeta);
  } else if (/have not yet been applied|not yet been applied/i.test(out)) {
    record("PRI-3", "prisma", "prisma migrate status", "WARN", "hay migraciones pendientes de aplicar en la base local", cmdMeta);
  } else if (/drift|not found in the migrations directory|were modified/i.test(out)) {
    record(
      "PRI-3",
      "prisma",
      "prisma migrate status",
      "FAIL",
      "drift entre la base y el historial — NO ejecutar `migrate dev` sin leer QA_TEST_DATABASE.md",
      cmdMeta
    );
  } else {
    record(
      "PRI-3",
      "prisma",
      "prisma migrate status",
      st.exit === 0 ? "PASS" : "WARN",
      out.split(/\r?\n/).filter(Boolean).slice(-1)[0]?.slice(0, 160) || "salida no reconocida",
      cmdMeta
    );
  }
}

// ───────────────────────── 8 · variables de entorno ─────────────────────────

const isUrl = (v) => {
  try {
    new URL(v);
    return true;
  } catch {
    return false;
  }
};

/** Reglas derivadas de backend/src/config/env.ts (zod). Solo se comprueba
 *  presencia y FORMA; jamás se imprime el valor. */
const ENV_RULES = [
  { key: "DATABASE_URL", required: true, check: (v) => /^postgres(ql)?:\/\/.+/.test(v) || "no es una URL postgresql://" },
  { key: "SESSION_SECRET", required: true, check: (v) => v.length >= 32 || "debe tener al menos 32 caracteres" },
  { key: "ENCRYPTION_KEY", required: false, check: (v) => /^[0-9a-fA-F]{64}$/.test(v) || "debe ser 64 caracteres hex (32 bytes)" },
  { key: "PORT", required: false, check: (v) => /^\d+$/.test(v) || "debe ser numérico" },
  { key: "NODE_ENV", required: false, check: (v) => ["development", "test", "production"].includes(v) || "solo development | test | production" },
  { key: "APP_ENV", required: false, check: (v) => ["development", "staging", "production"].includes(v) || "solo development | staging | production" },
  { key: "BACKEND_PUBLIC_URL", required: false, check: (v) => isUrl(v) || "debe ser una URL absoluta" },
  { key: "FRONTEND_URL", required: false, check: (v) => isUrl(v) || "debe ser una URL absoluta" },
  { key: "APP_BASE_URL", required: false, check: (v) => isUrl(v) || "debe ser una URL absoluta" },
  { key: "CORS_ORIGIN", required: false, check: (v) => v.split(",").every((o) => isUrl(o.trim())) || "lista de orígenes separada por comas" },
  { key: "EMAIL_PROVIDER", required: false, check: (v) => ["resend", "smtp", "log"].includes(v) || "solo resend | smtp | log" },
  { key: "LOG_LEVEL", required: false, check: (v) => ["error", "warn", "info", "debug"].includes(v) || "solo error | warn | info | debug" },
  { key: "COOKIE_SAMESITE", required: false, check: (v) => ["auto", "lax", "strict", "none"].includes(v) || "solo auto | lax | strict | none" },
  { key: "DEFAULT_PHONE_COUNTRY", required: false, check: (v) => /^[A-Za-z]{2}$/.test(v) || "código ISO de 2 letras" },
  { key: "AUDIO_TRANSCRIPTION_PROVIDER", required: false, check: (v) => ["elevenlabs", "openai", "disabled"].includes(v) || "solo elevenlabs | openai | disabled" },
  { key: "SUPPORT_AGENT_TOKEN", required: false, check: (v) => v.length >= 32 || "debe tener al menos 32 caracteres" },
];

function checkEnv() {
  section("8 · Variables de entorno (backend)");

  const envFile = path.join(BACKEND, ".env");
  if (!exists(envFile)) {
    record("ENV-0", "env", "backend/.env", "FAIL", "MISSING — copiar .env.example y completarlo");
    return null;
  }
  record("ENV-0", "env", "backend/.env", "PASS", "PRESENT");

  // El proceso hereda variables del sistema; el .env manda en local.
  const env = readEnvFile(envFile);
  const value = (k) => (env.get(k) ?? process.env[k] ?? "").trim();

  let missing = 0;
  let invalid = 0;
  let present = 0;
  for (const rule of ENV_RULES) {
    const v = value(rule.key);
    if (!v) {
      if (rule.required) {
        record(`ENV:${rule.key}`, "env", rule.key, "FAIL", "MISSING (obligatoria)");
        missing++;
      }
      continue;
    }
    const ok = rule.check ? rule.check(v) : true;
    if (ok === true) {
      present++;
      continue;
    }
    record(`ENV:${rule.key}`, "env", rule.key, "FAIL", `INVALID CONFIGURATION — ${ok}`);
    invalid++;
  }
  record(
    "ENV-1",
    "env",
    "variables obligatorias y formato",
    missing + invalid === 0 ? "PASS" : "FAIL",
    `${present} PRESENT · ${missing} MISSING · ${invalid} INVALID CONFIGURATION`
  );

  // ── Reglas condicionales: cada variable por separado puede estar bien y la
  //    combinación estar rota. Es lo que rompe en producción. ──
  const cond = [];
  const provider = value("EMAIL_PROVIDER") || "resend";
  if (provider === "resend" && !value("RESEND_APIKEY")) {
    cond.push(["RESEND_APIKEY", "MISSING con EMAIL_PROVIDER=resend: no se enviaría ningún correo"]);
  }
  if (!value("RESEND_APIKEY") && value("RESEND_API_KEY")) {
    cond.push([
      "RESEND_APIKEY",
      "INVALID CONFIGURATION — está definida como RESEND_API_KEY; el nombre que lee el backend es RESEND_APIKEY",
    ]);
  }
  if (provider === "smtp") {
    for (const k of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"]) {
      if (!value(k)) cond.push([k, "MISSING con EMAIL_PROVIDER=smtp"]);
    }
  }
  if (value("COOKIE_SAMESITE") === "none" && value("COOKIE_SECURE") !== "true" && value("NODE_ENV") !== "production") {
    cond.push([
      "COOKIE_SECURE",
      "INVALID CONFIGURATION — COOKIE_SAMESITE=none exige COOKIE_SECURE=true; el navegador descartaría la cookie de sesión",
    ]);
  }
  const esOn = ["META_EMBEDDED_SIGNUP_ENABLED", "WHATSAPP_EMBEDDED_SIGNUP_ENABLED"].some((k) =>
    ["true", "1"].includes(value(k))
  );
  if (esOn) {
    for (const k of ["META_APP_ID", "META_APP_SECRET", "META_EMBEDDED_SIGNUP_CONFIG_ID"]) {
      if (!value(k)) cond.push([k, "MISSING con Embedded Signup encendido: el flujo quedaría deshabilitado"]);
    }
  }
  if (["true", "1"].includes(value("WHATSAPP_DEMO_ENABLED")) && !value("WHATSAPP_DEMO_PHONE_NUMBER_ID")) {
    cond.push(["WHATSAPP_DEMO_PHONE_NUMBER_ID", "MISSING con WHATSAPP_DEMO_ENABLED=true"]);
  }
  const isProd = value("NODE_ENV") === "production" || value("APP_ENV") === "production";
  if (isProd && ["true", "1"].includes(value("ALLOW_GLOBAL_META_TOKEN_FALLBACK"))) {
    cond.push([
      "ALLOW_GLOBAL_META_TOKEN_FALLBACK",
      "INVALID CONFIGURATION — debe ser false en producción: cada cliente usa su propio token de Meta",
    ]);
  }
  if (isProd && !value("ENCRYPTION_KEY")) {
    cond.push(["ENCRYPTION_KEY", "MISSING en producción: los tokens cifrados derivarían la clave de SESSION_SECRET"]);
  }
  for (const [k, why] of cond) record(`ENVC:${k}`, "env", k, "FAIL", why);
  record(
    "ENV-2",
    "env",
    "coherencia entre variables",
    cond.length === 0 ? "PASS" : "FAIL",
    cond.length === 0 ? "sin combinaciones inválidas" : `${cond.length} combinación(es) inválida(s)`
  );

  // ── Entorno de pruebas ──
  const testEnvFile = path.join(BACKEND, ".env.test");
  if (!exists(testEnvFile)) {
    record(
      "ENV-3",
      "env",
      "backend/.env.test",
      "WARN",
      "MISSING — las suites con base de datos no podrán ejecutarse (`cp .env.test.example .env.test`)"
    );
  } else {
    const t = readEnvFile(testEnvFile);
    const url = t.get("DATABASE_URL") || "";
    let dbName = "";
    try {
      dbName = new URL(url).pathname.replace(/^\//, "");
    } catch {
      dbName = "";
    }
    if (!url) {
      record("ENV-3", "env", "backend/.env.test → DATABASE_URL", "FAIL", "MISSING");
    } else if (!dbName.endsWith("_test")) {
      // Éste es EL fallo que la guarda use-test-db.ts existe para evitar.
      record(
        "ENV-3",
        "env",
        "backend/.env.test → DATABASE_URL",
        "FAIL",
        `INVALID CONFIGURATION — la base "${dbName}" no termina en _test: las pruebas escribirían fuera de la base de pruebas`
      );
    } else {
      record("ENV-3", "env", "backend/.env.test → DATABASE_URL", "PASS", `PRESENT · ${maskDbUrl(url)}`);
    }
  }

  // Plantillas: sin ellas, una máquina nueva no sabe qué variables definir.
  for (const [label, file] of [
    ["backend/.env.example", path.join(BACKEND, ".env.example")],
    ["backend/.env.test.example", path.join(BACKEND, ".env.test.example")],
    ["frontend/.env.example", path.join(FRONTEND, ".env.example")],
    ["webpage/.env.example", path.join(WEBPAGE, ".env.example")],
  ]) {
    record(`ENV-T:${label}`, "env", label, exists(file) ? "PASS" : "WARN", exists(file) ? "PRESENT" : "MISSING");
  }

  return env;
}

// ─────────────────── 9 · secretos: bundles públicos y git ───────────────────

/** Nombres que designan un secreto. Decide qué NO puede vivir en una variable
 *  VITE_ ni aparecer en un bundle. */
const SECRET_NAME_RE = /(SECRET|TOKEN|PASSWORD|PASSWD|APIKEY|API_KEY|PRIVATE|CREDENTIAL|_PASS$|DATABASE_URL|DIRECT_URL|POOL_URL)/i;

/** Variables VITE_ públicas por diseño, documentadas en los .env.example. */
const PUBLIC_VITE_ALLOWLIST = new Set([
  "VITE_WEB3FORMS_ACCESS_KEY", // identifica el formulario, no autoriza nada
  "VITE_RECAPTCHA_SITE_KEY", // site key: pública por definición
  "VITE_META_APP_ID", // el SDK de Facebook la necesita en el navegador
  "VITE_META_EMBEDDED_SIGNUP_CONFIG_ID",
]);

/** Formas de credencial que no deben aparecer NUNCA en un bundle público. */
const CREDENTIAL_PATTERNS = [
  { name: "clave de OpenAI", re: /sk-[A-Za-z0-9_-]{20,}/ },
  { name: "clave de Resend", re: /\bre_[A-Za-z0-9_-]{20,}/ },
  { name: "token de Meta", re: /\bEAA[A-Za-z0-9]{40,}/ },
  { name: "URL de PostgreSQL con credenciales", re: /postgres(ql)?:\/\/[^\s"'`]+:[^\s"'`]+@/ },
  { name: "clave privada PEM", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "webhook secret de LemonSqueezy", re: /\bwhsec_[A-Za-z0-9_-]{16,}/ },
];

function checkSecrets(backendEnv) {
  section("9 · Secretos: bundles públicos, plantillas y git");

  // 9.1 — Ninguna variable VITE_ puede llamarse como un secreto.
  const viteOffenders = [];
  for (const [label, file] of [
    ["frontend/.env", path.join(FRONTEND, ".env")],
    ["frontend/.env.example", path.join(FRONTEND, ".env.example")],
    ["webpage/.env", path.join(WEBPAGE, ".env")],
    ["webpage/.env.example", path.join(WEBPAGE, ".env.example")],
  ]) {
    for (const key of readEnvFile(file).keys()) {
      if (!key.startsWith("VITE_")) continue;
      if (PUBLIC_VITE_ALLOWLIST.has(key)) continue;
      if (SECRET_NAME_RE.test(key)) viteOffenders.push(`${label} → ${key}`);
    }
  }
  record(
    "SEC-1",
    "secrets",
    "variables VITE_ con nombre de secreto",
    viteOffenders.length === 0 ? "PASS" : "FAIL",
    viteOffenders.length === 0 ? "ninguna: todo lo VITE_ es público por diseño" : viteOffenders.join(" · ")
  );

  // 9.2 — Los VALORES reales del backend no pueden aparecer en el bundle.
  //       Es la comprobación que de verdad demuestra que no hay fuga.
  const secretValues = [];
  if (backendEnv) {
    for (const [k, v] of backendEnv) {
      if (!v || v.length < 12) continue; // valores cortos = ruido
      if (!SECRET_NAME_RE.test(k)) continue;
      secretValues.push([k, v]);
    }
  }

  const bundles = [
    ["frontend/dist", path.join(FRONTEND, "dist")],
    ["webpage/dist", path.join(WEBPAGE, "dist")],
  ];
  const leaks = [];
  const patternHits = [];
  let scanned = 0;

  for (const [label, dir] of bundles) {
    const files = listFilesRecursive(dir, [".js", ".mjs", ".css", ".html", ".json", ".map", ".txt", ".webmanifest"]);
    for (const f of files) {
      let content;
      try {
        content = fs.readFileSync(f, "utf8");
      } catch {
        continue;
      }
      scanned++;
      for (const [k, v] of secretValues) {
        // Solo se reporta el NOMBRE de la variable y el archivo. Nunca el valor.
        if (content.includes(v)) leaks.push(`${k} → ${label}/${path.relative(dir, f)}`);
      }
      for (const p of CREDENTIAL_PATTERNS) {
        if (p.re.test(content)) patternHits.push(`${p.name} en ${label}/${path.relative(dir, f)}`);
      }
    }
  }

  if (scanned === 0) {
    record(
      "SEC-2",
      "secrets",
      "secretos del backend dentro del bundle Vite",
      "SKIP",
      "no hay dist/ que escanear — ejecutar sin --skip-build"
    );
  } else {
    record(
      "SEC-2",
      "secrets",
      "secretos del backend dentro del bundle Vite",
      leaks.length === 0 ? "PASS" : "FAIL",
      leaks.length === 0
        ? `${scanned} archivos escaneados · ninguno de los ${secretValues.length} secretos del backend aparece`
        : `FUGA: ${[...new Set(leaks)].join(" · ")}`
    );
    record(
      "SEC-3",
      "secrets",
      "credenciales por forma en el bundle",
      patternHits.length === 0 ? "PASS" : "FAIL",
      patternHits.length === 0 ? "sin cadenas con forma de credencial" : [...new Set(patternHits)].join(" · ")
    );
  }

  // 9.3 — Ningún .env real versionado. Ojo: hay repos git anidados.
  //
  // Severidad por CONTENIDO, no por nombre: un .env versionado que solo tiene
  // variables VITE_ públicas es desorden (WARN); uno con un nombre o un valor
  // de secreto es un incidente (FAIL), porque queda en el historial de git
  // para siempre aunque se borre después.
  const trackedWithSecrets = [];
  const trackedPublicOnly = [];
  for (const pkg of [...PACKAGES, { name: "raíz", dir: ROOT }]) {
    if (!exists(path.join(pkg.dir, ".git"))) continue;
    const { exit, out } = run("git ls-files", pkg.dir, 60_000);
    if (exit !== 0) continue;
    for (const line of out.split(/\r?\n/)) {
      const rel = line.trim();
      const base = path.basename(rel);
      if (!base) continue;
      if (base !== ".env" && !/^\.env\.(local|development|production|staging|test)$/.test(base)) continue;

      const entries = [...readEnvFile(path.join(pkg.dir, rel))];
      const risky = entries.some(
        ([k, v]) =>
          (SECRET_NAME_RE.test(k) && !PUBLIC_VITE_ALLOWLIST.has(k) && v.length > 0) ||
          CREDENTIAL_PATTERNS.some((p) => p.re.test(v))
      );
      (risky ? trackedWithSecrets : trackedPublicOnly).push(`${pkg.name}/${rel}`);
    }
  }
  if (trackedWithSecrets.length > 0) {
    record(
      "SEC-4",
      "secrets",
      "archivos .env versionados en git",
      "FAIL",
      `${trackedWithSecrets.join(" · ")} contiene(n) secretos y están en el historial de git`
    );
  } else if (trackedPublicOnly.length > 0) {
    record(
      "SEC-4",
      "secrets",
      "archivos .env versionados en git",
      "WARN",
      `${trackedPublicOnly.join(" · ")} versionado(s), solo con variables públicas: sin secretos, pero el próximo que se añada ahí sí quedaría en git`
    );
  } else {
    record("SEC-4", "secrets", "archivos .env versionados en git", "PASS", "ninguno");
  }

  // 9.4 — Las plantillas no deben llevar credenciales con forma real.
  const templateHits = [];
  for (const [label, file] of [
    ["backend/.env.example", path.join(BACKEND, ".env.example")],
    ["backend/.env.test.example", path.join(BACKEND, ".env.test.example")],
    ["frontend/.env.example", path.join(FRONTEND, ".env.example")],
    ["webpage/.env.example", path.join(WEBPAGE, ".env.example")],
  ]) {
    for (const [k, v] of readEnvFile(file)) {
      if (!v) continue;
      const looksReal = CREDENTIAL_PATTERNS.some((p) => p.re.test(v));
      const isFake = /(fake|test|example|placeholder|replace|change|tu_|your|xxx|\.\.\.)/i.test(v);
      // Una URL de PostgreSQL a localhost es la plantilla de desarrollo, no
      // una credencial filtrada: el "secreto" es la contraseña de tu máquina.
      const isLocalDb = /^postgres(ql)?:\/\//.test(v) && /@(localhost|127\.0\.0\.1)[:/]/.test(v);
      if (looksReal && !isFake && !isLocalDb) templateHits.push(`${label} → ${k}`);
    }
  }
  record(
    "SEC-5",
    "secrets",
    "plantillas .env.example sin credenciales",
    templateHits.length === 0 ? "PASS" : "WARN",
    templateHits.length === 0
      ? "solo placeholders"
      : `valor con forma de credencial en ${templateHits.join(" · ")} (usar un placeholder evidente)`
  );
}

// ───────────────────────── 10 · configuración básica ────────────────────────

function checkConfig() {
  section("10 · Configuración básica");

  // .gitignore debe cubrir los .env reales de cada paquete.
  for (const pkg of PACKAGES) {
    const gi = path.join(pkg.dir, ".gitignore");
    const body = exists(gi) ? fs.readFileSync(gi, "utf8") : "";
    const lines = body.split(/\r?\n/).map((l) => l.trim());
    const coversEnv = lines.includes(".env") || lines.includes(".env*") || lines.includes(".env.*");
    record(
      `CFG-gi:${pkg.name}`,
      "config",
      `${pkg.name}: .gitignore cubre .env`,
      coversEnv ? "PASS" : "FAIL",
      coversEnv ? "sí" : "el .env local podría acabar en git"
    );

    // Ignorar también la PLANTILLA impide que una máquina nueva arranque.
    if (lines.includes(".env.example")) {
      record(
        `CFG-gix:${pkg.name}`,
        "config",
        `${pkg.name}: .gitignore ignora .env.example`,
        "WARN",
        "la plantilla no se versiona: un clon nuevo no sabe qué variables definir"
      );
    }
  }

  // dist/ versionado: artefactos de build en git se quedan obsoletos y
  // engañan sobre lo que realmente se despliega.
  for (const pkg of PACKAGES) {
    if (!exists(path.join(pkg.dir, ".git"))) continue;
    const { exit, out } = run("git ls-files dist", pkg.dir, 60_000);
    if (exit !== 0) continue;
    const n = out.split(/\r?\n/).filter(Boolean).length;
    record(
      `CFG-dist:${pkg.name}`,
      "config",
      `${pkg.name}: dist/ fuera de git`,
      n === 0 ? "PASS" : "WARN",
      n === 0 ? "sí" : `${n} archivo(s) de build versionados: quedan obsoletos y confunden`
    );
  }

  // El gotcha de los project references: si el build de front usara
  // `tsc --noEmit` no comprobaría NADA (LOCAL_QA_RUNBOOK fase 2).
  for (const pkg of [
    { name: "frontend", dir: FRONTEND },
    { name: "webpage", dir: WEBPAGE },
  ]) {
    const pj = JSON.parse(fs.readFileSync(path.join(pkg.dir, "package.json"), "utf8"));
    const build = pj.scripts?.build || "";
    const ok = /tsc\s+-b/.test(build);
    record(
      `CFG-tsb:${pkg.name}`,
      "config",
      `${pkg.name}: build usa tsc -b`,
      ok ? "PASS" : "FAIL",
      ok ? build : `"${build}" — con project references, tsc --noEmit no comprueba nada`
    );
  }

  // Infraestructura de pruebas que el runbook da por sentada.
  for (const [label, p] of [
    ["guarda tests/setup/use-test-db.ts", path.join(BACKEND, "tests", "setup", "use-test-db.ts")],
    ["scripts/setup-test-db.ts", path.join(BACKEND, "scripts", "setup-test-db.ts")],
    ["tsconfig.test.json", path.join(BACKEND, "tsconfig.test.json")],
  ]) {
    record(`CFG:${label}`, "config", `backend: ${label}`, exists(p) ? "PASS" : "FAIL", exists(p) ? "PRESENT" : "MISSING");
  }

  // El healthcheck del despliegue debe apuntar a una ruta que EXISTA. Si no,
  // Railway reinicia el servicio en bucle aunque el backend funcione bien
  // (riesgo R5 de LAST_QA_REPORT, detectado por HTTP el 2026-09-10).
  const railwayFile = path.join(BACKEND, "railway.json");
  const appFile = path.join(BACKEND, "src", "app.ts");
  const routesFile = path.join(BACKEND, "src", "routes", "index.ts");
  if (exists(railwayFile) && exists(appFile) && exists(routesFile)) {
    let hcPath = "";
    try {
      hcPath = JSON.parse(fs.readFileSync(railwayFile, "utf8"))?.deploy?.healthcheckPath || "";
    } catch {
      hcPath = "";
    }
    if (!hcPath) {
      record("CFG-health", "config", "railway: healthcheckPath", "WARN", "no declarado en railway.json");
    } else {
      const appSrc = fs.readFileSync(appFile, "utf8");
      const routesSrc = fs.readFileSync(routesFile, "utf8");
      // app.use(router) → prefijo ""; app.use("/api", router) → prefijo "/api".
      const mount = appSrc.match(/app\.use\(\s*(?:["'`]([^"'`]+)["'`]\s*,\s*)?router\s*\)/);
      const prefix = mount?.[1] ?? "";
      const declared = new Set();
      for (const m of routesSrc.matchAll(/router\.(?:get|use)\(\s*["'`]([^"'`]+)["'`]/g)) {
        declared.add(prefix + m[1]);
      }
      const ok = declared.has(hcPath);
      record(
        "CFG-health",
        "config",
        "railway: healthcheckPath existe como ruta",
        ok ? "PASS" : "FAIL",
        ok
          ? hcPath
          : `railway.json apunta a ${hcPath}, pero la ruta declarada es ${[...declared].find((p) => p.endsWith("/health")) || "(ninguna /health)"} — el despliegue se reiniciaría en bucle`
      );
    }
  }

  // Los scripts que el runbook promete deben existir de verdad.
  const bePkg = JSON.parse(fs.readFileSync(path.join(BACKEND, "package.json"), "utf8"));
  const promised = ["typecheck", "lint", "build", "test", "test:unit", "test:db", "test:http", "test:db:setup"];
  const absent = promised.filter((s) => !bePkg.scripts?.[s]);
  record(
    "CFG-scr",
    "config",
    "backend: scripts citados por el runbook",
    absent.length === 0 ? "PASS" : "FAIL",
    absent.length === 0 ? `${promised.length}/${promised.length} presentes` : `faltan: ${absent.join(", ")}`
  );
}

// ──────────────────────────────── ejecución ─────────────────────────────────

console.log(`${C.bold}Sendwary · QA PRE-FLIGHT${C.off}`);
console.log(`${C.gray}${new Date().toISOString()} · node ${process.versions.node} · ${ROOT}${C.off}`);
console.log(`${C.gray}Opciones: build=${OPT.build} lint=${OPT.lint} types=${OPT.types} db=${OPT.db}${C.off}`);
console.log(
  `${C.gray}No ejecuta las suites de pruebas (fases 4-6 del runbook) ni escribe en ninguna base de datos.${C.off}`
);

const t0 = Date.now();
checkDependencies();
checkLint();
checkTypes();
checkBuilds();
checkPrisma();
const backendEnv = checkEnv();
checkSecrets(backendEnv);
checkConfig();

const tally = { PASS: 0, FAIL: 0, WARN: 0, SKIP: 0 };
for (const r of results) tally[r.status]++;

section("Resumen");
console.log(
  `  ${BADGE.PASS} ${tally.PASS}   ${BADGE.FAIL} ${tally.FAIL}   ${BADGE.WARN} ${tally.WARN}   ${BADGE.SKIP} ${tally.SKIP}   ${C.gray}(${((Date.now() - t0) / 1000).toFixed(1)}s)${C.off}`
);

if (tally.FAIL > 0) {
  console.log(`\n${C.red}${C.bold}FALLOS:${C.off}`);
  for (const r of results.filter((x) => x.status === "FAIL")) console.log(`  · [${r.id}] ${r.name} — ${r.detail}`);
}
if (tally.WARN > 0) {
  console.log(`\n${C.yellow}${C.bold}AVISOS:${C.off}`);
  for (const r of results.filter((x) => x.status === "WARN")) console.log(`  · [${r.id}] ${r.name} — ${r.detail}`);
}

console.log(
  tally.FAIL === 0
    ? `\n${C.green}${C.bold}PRE-FLIGHT OK${C.off} — se puede continuar con el LOCAL_QA_RUNBOOK (fase 4 en adelante).`
    : `\n${C.red}${C.bold}PRE-FLIGHT CON FALLOS${C.off} — corregir antes de ejecutar las suites: sobre una base rota los fallos en cascada no significan nada.`
);

if (OPT.json) {
  console.log("\n--- JSON ---");
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), options: OPT, tally, results }, null, 2));
}

process.exit(tally.FAIL === 0 ? 0 : 1);
