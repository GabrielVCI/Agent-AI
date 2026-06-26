import type { Request, Response } from "express";
import {
  handleIncomingWhatsappMessage,
  resolveAgentByPhoneNumberId,
} from "../services/whatsapp.service.js";
import {
  sendWhatsappDocumentMessage,
  sendWhatsappTextMessage,
  uploadWhatsappDocumentMedia,
} from "../services/meta-whatsapp.service.js";
import { checkIdempotency, saveIdempotency } from "../lib/idempotency.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

export function verifyMetaWhatsappWebhookController(req: Request, res: Response) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (
    mode === "subscribe" &&
    token === env.META_VERIFY_TOKEN &&
    typeof challenge === "string"
  ) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
}

export async function incomingMetaWhatsappWebhookController(
  req: Request,
  res: Response
) {
  // Respond immediately to Meta
  res.sendStatus(200);

  try {
    const entries = req.body?.entry ?? [];

    for (const entry of entries) {
      const changes = entry?.changes ?? [];

      for (const change of changes) {
        const value = change?.value;
        const messages = value?.messages ?? [];
        const contacts = value?.contacts ?? [];
        const phoneNumberId: string = value?.metadata?.phone_number_id ?? env.META_PHONE_NUMBER_ID ?? "";

        logger.info(`[WHATSAPP WEBHOOK] mensaje recibido (${messages.length} mensaje(s))`);
        logger.info(`[WHATSAPP WEBHOOK] phone_number_id: ${phoneNumberId || "(vacío)"}`);

        // Resolve tenant+agent from phone number ID
        const resolved = await resolveAgentByPhoneNumberId(phoneNumberId);

        if (!resolved) {
          logger.warn(
            `[WHATSAPP WEBHOOK] agente no encontrado para phone_number_id: ${phoneNumberId} (no se responde automáticamente)`
          );
          continue;
        }

        logger.info(
          `[WHATSAPP WEBHOOK] agente encontrado: ${resolved.agentId} (tenant: ${resolved.tenantId})`
        );

        const { tenantId, agentId, agent } = resolved;

        for (const message of messages) {
          const phone: string = message.from;
          const messageId: string = message.id;
          const messageType: string = message.type;

          if (!phone || !messageId) continue;

          // Idempotency: skip duplicate webhook deliveries
          const idempotencyKey = `wa:${messageId}`;
          const existing = await checkIdempotency(idempotencyKey, "webhook", tenantId);
          if (existing.exists) {
            logger.info(`[WHATSAPP WEBHOOK] duplicado ignorado: ${messageId}`);
            continue;
          }

          const timestamp = message.timestamp
            ? new Date(Number(message.timestamp) * 1000).toISOString()
            : new Date().toISOString();

          const contact = contacts.find((c: any) => c.wa_id === phone);
          const customerName = contact?.profile?.name || phone;

          // Only process text messages for now (audio/image support can be added later)
          if (messageType !== "text") {
            logger.info(
              `[WHATSAPP WEBHOOK] tipo no soportado (${messageType}), no se responde automáticamente`
            );
            await saveIdempotency(idempotencyKey, "webhook", 200, { skipped: true }, tenantId);
            continue;
          }

          const text: string = message.text?.body ?? "";
          if (!text) continue;

          const result = await handleIncomingWhatsappMessage({
            tenantId,
            agentId,
            agentConfig: agent,
            phone,
            customerName,
            message: text,
            messageId,
            timestamp,
          });

          // Mark as processed
          await saveIdempotency(idempotencyKey, "webhook", 200, { processed: true }, tenantId);

          if (result.skipReply) continue;

          try {
            await sendWhatsappTextMessage({
              to: phone,
              text: result.replyText,
              phoneNumberId,
            });
            logger.info(`[WHATSAPP WEBHOOK] respuesta enviada a WhatsApp (${phone})`);
          } catch (sendErr) {
            logger.error(
              `[WHATSAPP WEBHOOK] error enviando respuesta a WhatsApp: ${
                sendErr instanceof Error ? sendErr.message : String(sendErr)
              }`
            );
            continue;
          }

          if (result.pdfPath && result.pdfFilename) {
            try {
              const uploaded = await uploadWhatsappDocumentMedia({
                filePath: result.pdfPath,
                phoneNumberId,
              });
              await sendWhatsappDocumentMessage({
                to: phone,
                mediaId: uploaded.id,
                filename: result.pdfFilename,
                caption: "Aquí tienes tu cotización en PDF.",
                phoneNumberId,
              });
            } catch (pdfErr) {
              logger.error("[Webhook] Error sending PDF:", pdfErr);
            }
          }
        }
      }
    }
  } catch (error) {
    logger.error("❌ Error procesando webhook de Meta:", error);
  }
}
