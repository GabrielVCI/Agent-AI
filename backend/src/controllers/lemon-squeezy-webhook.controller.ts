import type { Request, Response } from "express";

import { logger } from "../config/logger.js";
import { asyncHandler } from "../errors/async-handler.js";
import { isLemonSqueezyWebhookConfigured } from "../services/billing/lemon-squeezy/lemonSqueezy.config.js";
import { verifyWebhookSignature } from "../services/billing/lemon-squeezy/lemonSqueezy.webhook-signature.service.js";
import { processWebhook } from "../services/billing/lemon-squeezy/lemonSqueezy.webhook.service.js";
import type { LemonWebhookPayload } from "../services/billing/lemon-squeezy/lemonSqueezy.types.js";

/**
 * Webhook de LemonSqueezy.
 *
 * Deliberadamente pequeño: cuerpo crudo → firma → parseo → servicio → status.
 * Toda la lógica de negocio vive en LemonSqueezyWebhookService.
 *
 * NO usa la cookie de sesión: la autenticidad la da la firma `X-Signature`
 * sobre el cuerpo crudo. `app.ts` conserva ese buffer en `req.rawBody`
 * (opción `verify` de express.json) porque si Express re-serializara el JSON
 * la firma dejaría de coincidir.
 *
 * Contrato de status hacia LemonSqueezy:
 *   200 → procesado, ignorado a propósito o duplicado (no reintentar)
 *   503 → no pudimos verificar el pago contra LemonSqueezy: que lo reintente
 *   401 → firma ausente/inválida
 *   503 → aún no hay webhook secret configurado en este ambiente
 *   5xx → fallo real y transitorio nuestro (LS reintentará)
 */
export const lemonSqueezyWebhookController = asyncHandler(
  async (req: Request, res: Response) => {
    if (!isLemonSqueezyWebhookConfigured()) {
      logger.warn("[LEMONSQUEEZY] webhook recibido sin webhook secret configurado");
      res.status(503).json({
        success: false,
        message: "El proveedor de pagos aún no está configurado.",
        error: { code: "LEMON_CONFIGURATION_ERROR", message: "Webhook no configurado." },
      });
      return;
    }

    const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
    const signature = req.headers["x-signature"];
    const signatureHeader = Array.isArray(signature) ? signature[0] : signature;

    const verification = verifyWebhookSignature(rawBody, signatureHeader);
    if (!verification.valid) {
      // El motivo va al log, nunca a la respuesta (no se le dice a quien
      // sondea si falló por falta de firma o por firma incorrecta).
      logger.warn("[LEMONSQUEEZY] firma de webhook rechazada", {
        reason: verification.reason,
      });
      res.status(401).json({
        success: false,
        message: "No pudimos verificar el origen de la notificación.",
        error: { code: "INVALID_WEBHOOK_SIGNATURE", message: "Firma inválida." },
      });
      return;
    }

    logger.info("[LEMONSQUEEZY] billing.webhook.verified");

    const result = await processWebhook({
      payload: req.body as LemonWebhookPayload,
      rawBody: rawBody as Buffer,
    });

    // RETRY: fallo TRANSITORIO nuestro (la API de LemonSqueezy no respondió).
    // Se contesta 503 a propósito para que LemonSqueezy REINTENTE el evento; el
    // servicio ya liberó la clave de dedupe para que el reintento sí se procese.
    if (result.outcome === "RETRY") {
      res.status(503).json({
        success: false,
        message: "No pudimos confirmar el pago en este momento. Se reintentará.",
        error: { code: "LEMON_API_ERROR", message: "Verificación diferida." },
      });
      return;
    }

    // Procesado, duplicado e ignorado responden 200: ninguno se arregla con un
    // reintento de LemonSqueezy. Un FAILED de correlación tampoco (los datos no
    // van a cambiar solos), pero queda en la tabla de eventos para revisión.
    res.status(200).json({ success: true, data: { outcome: result.outcome, event: result.eventName } });
  }
);
