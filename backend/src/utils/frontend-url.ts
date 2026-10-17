import { env } from "../config/env.js";

/**
 * Construcción de URLs del panel (Netlify/staging/local) desde el backend.
 *
 * Existe para que ningún dominio quede escrito a mano: la misma build sirve
 * para `http://localhost:5173`, `https://staging.sendwary.com` y producción
 * cambiando solo `FRONTEND_URL`.
 *
 * SEGURIDAD: el `path` lo decide SIEMPRE el backend, nunca el cliente. Si una
 * request pudiera elegir a dónde redirigir (un `redirectUrl` en el body), la
 * URL de retorno del checkout se convertiría en un open redirect: bastaría con
 * mandar a la víctima a un dominio propio con la marca de Sendwary. Por eso
 * esta función solo acepta rutas internas y descarta cualquier cosa que
 * pretenda ser absoluta.
 */

/** Ruta del panel a la que vuelve el cliente tras pagar. */
export const DASHBOARD_PATH = "/dashboard";

export function buildFrontendUrl(path: string): string {
  const base = env.FRONTEND_URL.replace(/\/+$/, "");
  // `//otro-dominio.com` y `https://…` se neutralizan: solo rutas internas.
  const clean = path.replace(/^(?:[a-z][a-z0-9+.-]*:)?\/\//i, "/").replace(/^\/*/, "/");
  return `${base}${clean}`;
}
