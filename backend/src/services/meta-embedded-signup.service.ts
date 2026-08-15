import axios from "axios";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { metaErrorMessage } from "./whatsapp-providers/meta-cloud.provider.js";

/**
 * Meta WhatsApp Embedded Signup — llamadas server-to-server.
 *
 * Flujo oficial (docs de Meta, Embedded Signup v4):
 *  1. El navegador ejecuta FB.login con `config_id` y `response_type: "code"`;
 *     Meta devuelve un `code` con TTL de 30 segundos y, por postMessage
 *     (`WA_EMBEDDED_SIGNUP`), los ids: waba_id, phone_number_id, business_id.
 *  2. El backend intercambia el code por un **business token** del cliente
 *     (customer-scoped) en GET /{version}/oauth/access_token.
 *  3. Se suscribe la app a los webhooks de la WABA del cliente:
 *     POST /{waba-id}/subscribed_apps.
 *  4. Se registra el número para Cloud API: POST /{phone-number-id}/register.
 *  5. Se listan los números de la WABA: GET /{waba-id}/phone_numbers.
 *
 * Requiere advanced access aprobado de `whatsapp_business_management` y
 * `whatsapp_business_messaging`. Sin esa aprobación, Meta rechaza el
 * onboarding de clientes — por eso el flujo viene deshabilitado por defecto.
 *
 * Seguridad: el APP_SECRET y el token del System User nunca salen de aquí, y
 * ningún token se escribe en logs.
 */

const GRAPH = "https://graph.facebook.com";

function graphUrl(path: string): string {
  return `${GRAPH}/${env.META_GRAPH_API_VERSION}/${path}`;
}

export function isEmbeddedSignupConfigured(): boolean {
  return Boolean(
    (env.META_EMBEDDED_SIGNUP_ENABLED || env.WHATSAPP_EMBEDDED_SIGNUP_ENABLED) &&
      env.META_APP_ID &&
      env.META_APP_SECRET &&
      env.META_EMBEDDED_SIGNUP_CONFIG_ID
  );
}

/** Config PÚBLICA para el SDK del navegador. Nunca incluye el app secret. */
export function getEmbeddedSignupPublicConfig(): {
  enabled: boolean;
  appId: string | null;
  configId: string | null;
  graphApiVersion: string;
} {
  const enabled = isEmbeddedSignupConfigured();
  return {
    enabled,
    appId: enabled ? env.META_APP_ID! : null,
    configId: enabled ? env.META_EMBEDDED_SIGNUP_CONFIG_ID! : null,
    graphApiVersion: env.META_GRAPH_API_VERSION,
  };
}

export interface MetaCallResult<T> {
  ok: boolean;
  data?: T;
  /** Mensaje ya traducido para el usuario (nunca error crudo ni token). */
  error?: string;
}

/**
 * Paso 2: intercambia el `code` de Embedded Signup por el business token del
 * cliente (customer-scoped). GET /{version}/oauth/access_token con
 * client_id + client_secret + code. Sin redirect_uri: el code viene del SDK.
 */
export async function exchangeCodeForBusinessToken(
  code: string
): Promise<MetaCallResult<{ accessToken: string; tokenType: string | null; expiresIn: number | null }>> {
  if (!env.META_APP_ID || !env.META_APP_SECRET) {
    return {
      ok: false,
      error: "La conexión con Meta no está configurada en este entorno.",
    };
  }

  try {
    const res = await axios.get(graphUrl("oauth/access_token"), {
      params: {
        client_id: env.META_APP_ID,
        client_secret: env.META_APP_SECRET,
        code,
      },
      timeout: 20000,
    });
    const data = res.data as {
      access_token?: string;
      token_type?: string;
      expires_in?: number;
    };
    if (!data.access_token) {
      logger.error("[EMBEDDED SIGNUP] Meta no devolvió access_token en el intercambio del code");
      return { ok: false, error: "Meta no devolvió las credenciales de tu cuenta. Intenta nuevamente." };
    }
    // Nunca se loguea el token: solo la confirmación del intercambio.
    logger.info("[EMBEDDED SIGNUP] code intercambiado por business token correctamente");
    return {
      ok: true,
      data: {
        accessToken: data.access_token,
        tokenType: data.token_type ?? null,
        expiresIn: typeof data.expires_in === "number" ? data.expires_in : null,
      },
    };
  } catch (err) {
    logger.error(`[EMBEDDED SIGNUP] fallo intercambiando el code: ${metaErrorMessage(err)}`);
    return { ok: false, error: metaErrorMessage(err) };
  }
}

export interface WabaPhoneNumber {
  id: string;
  display_phone_number: string | null;
  verified_name: string | null;
  quality_rating: string | null;
  status: string | null;
}

/**
 * Paso 5: números de una WABA. GET /{waba-id}/phone_numbers.
 * Tolerante: si Meta no devuelve algún campo opcional, se deja en null.
 */
export async function getWabaPhoneNumbers(input: {
  wabaId: string;
  accessToken: string;
}): Promise<MetaCallResult<WabaPhoneNumber[]>> {
  try {
    const res = await axios.get(graphUrl(`${input.wabaId}/phone_numbers`), {
      params: { fields: "id,display_phone_number,verified_name,quality_rating,status" },
      headers: { Authorization: `Bearer ${input.accessToken}` },
      timeout: 20000,
    });
    const rows = (res.data as { data?: Record<string, unknown>[] }).data ?? [];
    return {
      ok: true,
      data: rows.map((r) => ({
        id: String(r.id ?? ""),
        display_phone_number: (r.display_phone_number as string) ?? null,
        verified_name: (r.verified_name as string) ?? null,
        quality_rating: (r.quality_rating as string) ?? null,
        status: (r.status as string) ?? null,
      })),
    };
  } catch (err) {
    return { ok: false, error: metaErrorMessage(err) };
  }
}

/**
 * Paso 3: suscribe la app de Sendwary a los webhooks de la WABA del cliente.
 * POST /{waba-id}/subscribed_apps con el token del cliente.
 */
export async function subscribeAppToWaba(input: {
  wabaId: string;
  accessToken: string;
}): Promise<MetaCallResult<{ success: boolean }>> {
  try {
    const res = await axios.post(
      graphUrl(`${input.wabaId}/subscribed_apps`),
      {},
      {
        headers: { Authorization: `Bearer ${input.accessToken}` },
        timeout: 20000,
      }
    );
    const success = Boolean((res.data as { success?: boolean }).success);
    logger.info(`[EMBEDDED SIGNUP] app suscrita a webhooks de la WABA ${input.wabaId}: ${success}`);
    return { ok: success, data: { success }, ...(success ? {} : { error: "Meta no confirmó la suscripción a webhooks." }) };
  } catch (err) {
    const message = metaErrorMessage(err);
    logger.warn(`[EMBEDDED SIGNUP] no se pudo suscribir la WABA ${input.wabaId}: ${message}`);
    return { ok: false, error: message };
  }
}

/**
 * Paso 4 (opcional): registra el número para Cloud API.
 * POST /{phone-number-id}/register con { messaging_product: "whatsapp", pin }.
 * El PIN es el de verificación en dos pasos del número. Si el cliente ya lo
 * registró durante el flujo, Meta responde error y se ignora sin romper nada.
 */
export async function registerPhoneNumber(input: {
  phoneNumberId: string;
  accessToken: string;
  pin: string;
}): Promise<MetaCallResult<{ success: boolean }>> {
  try {
    const res = await axios.post(
      graphUrl(`${input.phoneNumberId}/register`),
      { messaging_product: "whatsapp", pin: input.pin },
      {
        headers: { Authorization: `Bearer ${input.accessToken}`, "Content-Type": "application/json" },
        timeout: 20000,
      }
    );
    const success = Boolean((res.data as { success?: boolean }).success);
    return { ok: success, data: { success } };
  } catch (err) {
    return { ok: false, error: metaErrorMessage(err) };
  }
}

/**
 * Datos de la WABA (nombre del negocio, moneda…). Best-effort: si falla, la
 * conexión sigue adelante; solo perdemos metadatos de presentación.
 */
export async function getWabaInfo(input: {
  wabaId: string;
  accessToken: string;
}): Promise<MetaCallResult<{ id: string; name: string | null; currency: string | null }>> {
  try {
    const res = await axios.get(graphUrl(input.wabaId), {
      params: { fields: "id,name,currency" },
      headers: { Authorization: `Bearer ${input.accessToken}` },
      timeout: 15000,
    });
    const d = res.data as { id?: string; name?: string; currency?: string };
    return {
      ok: true,
      data: { id: String(d.id ?? input.wabaId), name: d.name ?? null, currency: d.currency ?? null },
    };
  } catch (err) {
    return { ok: false, error: metaErrorMessage(err) };
  }
}
