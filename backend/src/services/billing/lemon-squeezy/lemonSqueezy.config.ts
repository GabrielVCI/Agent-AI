import { env } from "../../../config/env.js";
import { AppError } from "../../../errors/AppError.js";

/**
 * ÚNICA fuente de credenciales de LemonSqueezy del backend.
 *
 * Nadie más lee `process.env.LEMONSQUEEZY_*`: quien necesite hablar con LS pasa
 * por `lemonSqueezy.client.ts`, que pide las credenciales aquí. Así la API key
 * vive en un solo sitio, nunca se loguea y nunca puede terminar en una
 * respuesta HTTP.
 *
 * Nada de esto se expone al frontend (ni siquiera el storeId).
 */

export interface LemonSqueezyCredentials {
  apiKey: string;
  storeId: string;
  apiUrl: string;
}

/** Base de la API. Configurable para poder apuntar a un doble en pruebas. */
function apiUrl(): string {
  return (env.LEMONSQUEEZY_API_URL ?? "https://api.lemonsqueezy.com").replace(/\/+$/, "");
}

/** true cuando hay API key y store: el checkout por API es posible. */
export function isLemonSqueezyConfigured(): boolean {
  return Boolean(env.LEMONSQUEEZY_API_KEY && env.LEMONSQUEEZY_STORE_ID);
}

/** true cuando el webhook puede verificarse (hay secret). */
export function isLemonSqueezyWebhookConfigured(): boolean {
  return Boolean(env.LEMONSQUEEZY_WEBHOOK_SECRET);
}

/**
 * Ambiente declarado de LemonSqueezy. Solo informativo/auditoría: la verdad
 * sobre si una suscripción es de prueba la dice `test_mode` del propio evento.
 */
export function isLemonSqueezyTestMode(): boolean {
  return env.LEMONSQUEEZY_TEST_MODE === true;
}

/**
 * Credenciales validadas. Lanza un error OPERACIONAL con mensaje amigable si
 * falta configuración: el usuario ve "los pagos aún no están disponibles",
 * jamás el nombre de la variable ni su valor.
 */
export function requireLemonSqueezyCredentials(): LemonSqueezyCredentials {
  const apiKey = env.LEMONSQUEEZY_API_KEY;
  const storeId = env.LEMONSQUEEZY_STORE_ID;

  if (!apiKey || !storeId) {
    // internalMessage solo nombra QUÉ falta, nunca el valor de nada.
    const missing = [!apiKey && "API key", !storeId && "store id"].filter(Boolean).join(" y ");
    throw AppError.fromCode("LEMON_CONFIGURATION_ERROR", {
      internalMessage: `LemonSqueezy sin configurar: falta ${missing}`,
    });
  }

  return { apiKey, storeId, apiUrl: apiUrl() };
}

/**
 * Cabeceras JSON:API + Authorization. Construirlas aquí es lo que impide que
 * aparezca un `Bearer ${process.env...}` suelto en un controller.
 */
export function buildLemonSqueezyHeaders(credentials: LemonSqueezyCredentials): Record<string, string> {
  return {
    Accept: "application/vnd.api+json",
    "Content-Type": "application/vnd.api+json",
    Authorization: `Bearer ${credentials.apiKey}`,
  };
}

/** Secret del webhook, validado. */
export function requireWebhookSecret(): string {
  const secret = env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret) {
    throw AppError.fromCode("LEMON_CONFIGURATION_ERROR", {
      internalMessage: "LemonSqueezy sin configurar: falta webhook secret",
    });
  }
  return secret;
}
