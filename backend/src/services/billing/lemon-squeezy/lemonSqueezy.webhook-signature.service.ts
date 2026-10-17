import crypto from "node:crypto";

import { requireWebhookSecret } from "./lemonSqueezy.config.js";

/**
 * Verificación de la firma `X-Signature` de los webhooks de LemonSqueezy.
 *
 * LS firma el CUERPO CRUDO con HMAC-SHA256 y el webhook secret. Si el body ya
 * fue re-serializado por Express la firma no coincide: por eso `app.ts`
 * conserva el buffer original en `req.rawBody` (opción `verify` de
 * express.json) y aquí solo se acepta ese buffer.
 *
 * La comparación es en tiempo constante (`crypto.timingSafeEqual`) y las
 * longitudes se igualan ANTES de llamarlo: timingSafeEqual lanza si difieren,
 * y esa excepción sería en sí misma un canal lateral.
 */

export type SignatureResult =
  | { valid: true }
  | { valid: false; reason: "NO_SECRET" | "NO_SIGNATURE" | "NO_RAW_BODY" | "MISMATCH" };

/** HMAC-SHA256 hex del cuerpo crudo. Expuesto para poder probar la firma. */
export function signPayload(rawBody: Buffer | string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

/**
 * ¿La firma corresponde a este cuerpo? Nunca lanza: devuelve el motivo para
 * que el controller decida el status (siempre 4xx, nunca se procesa).
 */
export function verifyWebhookSignature(
  rawBody: Buffer | undefined,
  signatureHeader: string | undefined,
  /**
   * Secret explícito. En producción SIEMPRE se omite: lo aporta la única
   * fuente de credenciales (lemonSqueezy.config). El parámetro existe para que
   * las pruebas puedan verificar el algoritmo sin depender del .env de quien
   * las ejecute.
   */
  secretOverride?: string
): SignatureResult {
  let secret: string;
  if (secretOverride) {
    secret = secretOverride;
  } else {
    try {
      secret = requireWebhookSecret();
    } catch {
      return { valid: false, reason: "NO_SECRET" };
    }
  }

  if (!rawBody || rawBody.length === 0) return { valid: false, reason: "NO_RAW_BODY" };
  if (!signatureHeader) return { valid: false, reason: "NO_SIGNATURE" };

  const expected = Buffer.from(signPayload(rawBody, secret), "utf8");
  const received = Buffer.from(signatureHeader.trim(), "utf8");

  // Longitudes distintas ⇒ firma inválida, sin invocar timingSafeEqual (lanza).
  if (expected.length !== received.length) return { valid: false, reason: "MISMATCH" };

  return crypto.timingSafeEqual(expected, received)
    ? { valid: true }
    : { valid: false, reason: "MISMATCH" };
}
