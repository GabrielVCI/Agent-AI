/**
 * El panel NO guarda credenciales en el navegador.
 *
 * Decisión cerrada del proyecto: la sesión vive en una cookie httpOnly `sid`
 * que el JavaScript no puede leer. Si algún día alguien guardara un token, un
 * usuario o una contraseña en `localStorage` / `sessionStorage`, cualquier XSS
 * podría robarlo — y el httpOnly de la cookie dejaría de servir de nada.
 *
 * Es una prueba ESTÁTICA sobre el código fuente del frontend: no necesita
 * navegador ni base de datos. `frontend/eslint.config.js` ya tiene una regla
 * `no-restricted-syntax` equivalente; esto la duplica a propósito, porque el
 * lint del frontend puede desactivarse con un comentario y esta prueba no.
 *
 * Lo que SÍ se permite: preferencias de interfaz (el estado plegado del menú,
 * un filtro recordado). Lo que no: nada que sirva para autenticarse.
 *
 * Ejecutar: npm run test:unit
 */
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FRONTEND_SRC = path.resolve(BACKEND_DIR, "..", "frontend", "src");

/** Nombres de clave que delatan una credencial guardada en el navegador. */
const CLAVES_PROHIBIDAS =
  /(token|jwt|auth|session|sid|password|passwd|secret|credential|bearer|apikey|api_key)/i;

/** Claves de preferencia de interfaz aceptadas, con su justificación. */
const PREFERENCIAS_PERMITIDAS = new Set([
  // Estado plegado del menú lateral (components/layout/Sidebar.tsx).
  "sendwary.sidebar.collapsed",
]);

function listarFuentes(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) listarFuentes(completo, acc);
    else if (/\.(ts|tsx|js|jsx)$/.test(entrada.name)) acc.push(completo);
  }
  return acc;
}

type Uso = { archivo: string; linea: number; texto: string; clave: string | null };

/** Todas las llamadas a localStorage/sessionStorage del frontend, con su clave. */
function usosDeAlmacenamiento(): Uso[] {
  const usos: Uso[] = [];
  for (const archivo of listarFuentes(FRONTEND_SRC)) {
    const lineas = fs.readFileSync(archivo, "utf8").split(/\r?\n/);
    lineas.forEach((texto, i) => {
      if (!/(localStorage|sessionStorage)\s*\./.test(texto)) return;
      // Clave literal del acceso: getItem('x') / setItem("x", …) / removeItem(`x`)
      const m = texto.match(/(?:get|set|remove)Item\(\s*['"`]([^'"`]+)['"`]/);
      // Constantes: COLLAPSE_KEY, etc. Se resuelven buscando su definición.
      const porConstante = texto.match(/(?:get|set|remove)Item\(\s*([A-Z_][A-Z0-9_]*)\s*[,)]/);
      let clave: string | null = m?.[1] ?? null;
      if (!clave && porConstante) {
        const def = fs
          .readFileSync(archivo, "utf8")
          .match(new RegExp(`${porConstante[1]}\\s*=\\s*['"\`]([^'"\`]+)['"\`]`));
        clave = def?.[1] ?? porConstante[1];
      }
      usos.push({
        archivo: path.relative(FRONTEND_SRC, archivo).replace(/\\/g, "/"),
        linea: i + 1,
        texto: texto.trim(),
        clave,
      });
    });
  }
  return usos;
}

describe("frontend: credenciales fuera del navegador", () => {
  test("el código del panel existe y es analizable", () => {
    const fuentes = listarFuentes(FRONTEND_SRC);
    assert.ok(
      fuentes.length > 50,
      `solo se encontraron ${fuentes.length} archivos en frontend/src: la prueba no estaría mirando nada`
    );
  });

  test("ninguna clave de localStorage/sessionStorage parece una credencial", () => {
    const sospechosos = usosDeAlmacenamiento().filter(
      (u) => u.clave !== null && !PREFERENCIAS_PERMITIDAS.has(u.clave) && CLAVES_PROHIBIDAS.test(u.clave)
    );

    assert.deepEqual(
      sospechosos.map((u) => `${u.archivo}:${u.linea} → "${u.clave}"`),
      [],
      "🚨 hay credenciales guardadas en el almacenamiento del navegador"
    );
  });

  test("toda clave usada está declarada como preferencia conocida", () => {
    // Guarda de vigilancia: si alguien añade un uso nuevo, esta prueba obliga a
    // decidir explícitamente si es una preferencia (allowlist) o una credencial.
    const desconocidos = usosDeAlmacenamiento().filter(
      (u) => u.clave === null || !PREFERENCIAS_PERMITIDAS.has(u.clave)
    );

    assert.deepEqual(
      desconocidos.map((u) => `${u.archivo}:${u.linea} → ${u.clave ?? "(clave dinámica)"}`),
      [],
      "uso nuevo de almacenamiento en el navegador: revisarlo y, si es una preferencia, añadirlo a PREFERENCIAS_PERMITIDAS"
    );
  });

  test("el cliente HTTP autentica por cookie, no por cabecera Authorization", () => {
    const api = fs.readFileSync(path.join(FRONTEND_SRC, "lib", "api.ts"), "utf8");

    assert.ok(api.includes("credentials: 'include'"), "el cliente no envía la cookie de sesión");
    assert.ok(
      !/Authorization\s*:/.test(api),
      "el cliente construye una cabecera Authorization: eso implica un token en el navegador"
    );
  });

  test("ningún archivo del panel construye un `Bearer` con algo del almacenamiento", () => {
    const ofensores: string[] = [];
    for (const archivo of listarFuentes(FRONTEND_SRC)) {
      const contenido = fs.readFileSync(archivo, "utf8");
      if (/Bearer\s*\$\{/.test(contenido) || /Authorization['"\s]*:\s*[`'"]Bearer/.test(contenido)) {
        ofensores.push(path.relative(FRONTEND_SRC, archivo).replace(/\\/g, "/"));
      }
    }
    assert.deepEqual(ofensores, [], "hay cabeceras Bearer construidas en el frontend");
  });
});
