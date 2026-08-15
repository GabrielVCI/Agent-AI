import type { Request, Response } from "express";
import {
  handleIncomingWhatsappAudioMessage,
  handleIncomingWhatsappMessage,
  handleUnsupportedWhatsappMessage,
  resolveAgentByPhoneNumberId,
  UNSUPPORTED_MESSAGE_FALLBACK,
} from "../services/whatsapp.service.js";
import {
  sendWhatsappDocumentMessage,
  sendWhatsappTextMessage,
  uploadWhatsappDocumentMedia,
} from "../services/meta-whatsapp.service.js";
import { reserveIdempotency, saveIdempotency } from "../lib/idempotency.js";
import {
  resolveSendCredentials,
  verifyWebhookToken,
} from "../services/whatsapp-integration.service.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

// GET de verificación de Meta. Acepta el verify token global (compat con la
// config actual) o el verifyToken de cualquier WhatsAppIntegration de tenant
// (cada cliente configura su propia app de Meta con su propio token).
export async function verifyMetaWhatsappWebhookController(req: Request, res: Response) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && typeof token === "string" && typeof challenge === "string") {
    try {
      if (await verifyWebhookToken(token)) {
        return res.status(200).send(challenge);
      }
    } catch (err) {
      logger.error("[WHATSAPP WEBHOOK] error verificando token:", err);
    }
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

        // Credenciales de envío: token propio del tenant (integración
        // CONNECTED) o fallback global SOLO si está permitido (dev/demo).
        // Sin credenciales no procesamos (evita gastar IA sin poder responder).
        const credentials = await resolveSendCredentials(phoneNumberId);
        if (!credentials) {
          logger.warn(
            `[WHATSAPP WEBHOOK] sin credenciales de envío para phone_number_id ${phoneNumberId} (tenant ${tenantId}): integración no CONNECTED y fallback global deshabilitado. No se responde.`
          );
          continue;
        }

        for (const message of messages) {
          const phone: string = message.from;
          const messageId: string = message.id;
          const messageType: string = message.type;

          if (!phone || !messageId) continue;

          // Idempotencia: RESERVAMOS la clave de forma atómica ANTES de procesar.
          // Así un reintento concurrente de Meta no puede generar doble respuesta.
          const idempotencyKey = `wa:${messageId}`;
          const reservation = await reserveIdempotency(idempotencyKey, "webhook", tenantId);
          if (!reservation.reserved) {
            logger.info(`[WHATSAPP WEBHOOK] duplicate message ignored: ${messageId}`);
            continue;
          }
          logger.info(`[WHATSAPP WEBHOOK] idempotency reserved: ${messageId}`);

          try {
            const timestamp = message.timestamp
              ? new Date(Number(message.timestamp) * 1000).toISOString()
              : new Date().toISOString();

            const contact = contacts.find((c: any) => c.wa_id === phone);
            const customerName = contact?.profile?.name || phone;

            // Audio: descargar de Meta → transcribir (ElevenLabs) → runtime
            // textual → responder. Todo fallo degrada a un mensaje controlado.
            if (messageType === "audio" || messageType === "voice") {
              const mediaId: string | undefined = message.audio?.id ?? message.voice?.id;
              logger.info(`[WHATSAPP WEBHOOK] audio recibido (media: ${mediaId ?? "?"})`);

              const result = await handleIncomingWhatsappAudioMessage({
                tenantId,
                agentId,
                agentConfig: agent,
                phone,
                customerName,
                messageId,
                mediaId,
                timestamp,
                credentials,
              });

              if (!result.skipReply && result.replyText) {
                await sendWhatsappTextMessage({
                  to: phone,
                  text: result.replyText,
                  phoneNumberId,
                  credentials,
                });
                logger.info(`[WHATSAPP WEBHOOK] respuesta a audio enviada (${phone})`);

                if (result.pdfPath && result.pdfFilename) {
                  try {
                    const uploaded = await uploadWhatsappDocumentMedia({
                      filePath: result.pdfPath,
                      phoneNumberId,
                      credentials,
                    });
                    await sendWhatsappDocumentMessage({
                      to: phone,
                      mediaId: uploaded.id,
                      filename: result.pdfFilename,
                      caption: "Aquí tienes tu cotización en PDF.",
                      phoneNumberId,
                      credentials,
                    });
                  } catch (pdfErr) {
                    logger.error("[Webhook] Error sending PDF:", pdfErr);
                  }
                }
              }

              await saveIdempotency(idempotencyKey, "webhook", 200, { processedAudio: true }, tenantId);
              logger.info(`[WHATSAPP WEBHOOK] idempotency completed: ${messageId}`);
              continue;
            }

            // Mensajes NO de texto: guardamos + fallback de texto (sin OpenAI,
            // sin descargar media). El agente activo ya quedó garantizado arriba.
            if (messageType !== "text") {
              logger.info(`[WHATSAPP WEBHOOK] unsupported message type: ${messageType}`);

              const handled = await handleUnsupportedWhatsappMessage({
                tenantId,
                agentId,
                phone,
                customerName,
                messageId,
                messageType,
                timestamp,
              });

              if (handled.sendFallback) {
                await sendWhatsappTextMessage({
                  to: phone,
                  text: UNSUPPORTED_MESSAGE_FALLBACK,
                  phoneNumberId,
                  credentials,
                });
                logger.info(`[WHATSAPP WEBHOOK] sent unsupported message fallback`);
              }

              await saveIdempotency(
                idempotencyKey,
                "webhook",
                200,
                { unsupported: messageType },
                tenantId
              );
              logger.info(`[WHATSAPP WEBHOOK] idempotency completed: ${messageId}`);
              continue;
            }

            const text: string = message.text?.body ?? "";
            if (!text) {
              await saveIdempotency(
                idempotencyKey,
                "webhook",
                200,
                { skipped: "empty-text" },
                tenantId
              );
              logger.info(`[WHATSAPP WEBHOOK] idempotency completed: ${messageId}`);
              continue;
            }

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

            if (!result.skipReply) {
              await sendWhatsappTextMessage({
                to: phone,
                text: result.replyText,
                phoneNumberId,
                credentials,
              });
              logger.info(`[WHATSAPP WEBHOOK] respuesta enviada a WhatsApp (${phone})`);

              if (result.pdfPath && result.pdfFilename) {
                try {
                  const uploaded = await uploadWhatsappDocumentMedia({
                    filePath: result.pdfPath,
                    phoneNumberId,
                    credentials,
                  });
                  await sendWhatsappDocumentMessage({
                    to: phone,
                    mediaId: uploaded.id,
                    filename: result.pdfFilename,
                    caption: "Aquí tienes tu cotización en PDF.",
                    phoneNumberId,
                    credentials,
                  });
                } catch (pdfErr) {
                  logger.error("[Webhook] Error sending PDF:", pdfErr);
                }
              }
            }

            // Marcamos como completado (consolidando la reserva previa).
            await saveIdempotency(idempotencyKey, "webhook", 200, { processed: true }, tenantId);
            logger.info(`[WHATSAPP WEBHOOK] idempotency completed: ${messageId}`);
          } catch (procErr) {
            // El webhook nunca crashea: ya respondimos 200 a Meta. La reserva
            // queda registrada para no reintentar/duplicar la respuesta.
            logger.error(
              `[WHATSAPP WEBHOOK] idempotency failed: ${messageId} - ${
                procErr instanceof Error ? procErr.message : String(procErr)
              }`
            );
          }
        }
      }
    }
  } catch (error) {
    logger.error("❌ Error procesando webhook de Meta:", error);
  }
}
