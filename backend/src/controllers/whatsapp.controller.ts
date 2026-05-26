import type { Request, Response } from "express";
import { z } from "zod";
import { handleIncomingWhatsappMessage } from "../services/whatsapp.service.js";
import { env } from "process";
import { sendWhatsappDocumentMessage, sendWhatsappTextMessage, uploadWhatsappDocumentMedia } from "../services/meta-whatsapp.service.js";

const incomingWhatsappSchema = z.object({
  phone: z.string().min(5, "El teléfono es obligatorio"),
  customerName: z.string().optional().default("Cliente"),
  message: z.string().min(1, "El mensaje no puede estar vacío"),
  messageId: z.string().optional(),
  timestamp: z.string().optional()
});

export async function incomingWhatsappController(req: Request, res: Response) {
  const parsed = incomingWhatsappSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Datos inválidos",
      errors: parsed.error.flatten().fieldErrors
    });
  }

  const result = await handleIncomingWhatsappMessage(parsed.data);

  res.json(result);
} 
 

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
  // Importante: responder rápido a Meta.
  res.sendStatus(200);

  try {
    const entries = req.body?.entry ?? [];

    for (const entry of entries) {
      const changes = entry?.changes ?? [];

      for (const change of changes) {
        const value = change?.value;
        const messages = value?.messages ?? [];
        const contacts = value?.contacts ?? [];

        for (const message of messages) {
          if (message.type !== "text") {
            continue;
          }

          const phone = message.from;
          const text = message.text?.body;
          const messageId = message.id;
          const timestamp = message.timestamp
            ? new Date(Number(message.timestamp) * 1000).toISOString()
            : new Date().toISOString();

          const contact = contacts.find((c: any) => c.wa_id === phone);
          const customerName =
            contact?.profile?.name || contact?.wa_id || "Cliente";

          if (!phone || !text) {
            continue;
          }

          const result = await handleIncomingWhatsappMessage({
            phone,
            customerName,
            message: text,
            messageId,
            timestamp
          });

          await sendWhatsappTextMessage({
            to: phone,
            text: result.replyText
          });

          if (result.pdfPath && result.pdfFilename) {
            const uploaded = await uploadWhatsappDocumentMedia({
              filePath: result.pdfPath
            });

            await sendWhatsappDocumentMessage({
              to: phone,
              mediaId: uploaded.id,
              filename: result.pdfFilename,
              caption: "Aquí tienes tu cotización en PDF."
            });
          }
        }
      }
    }
  } catch (error) {
    console.error("❌ Error procesando webhook real de Meta:", error);
  }
}