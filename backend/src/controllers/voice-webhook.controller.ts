import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import { logger } from "../config/logger.js";
import { AppError } from "../middlewares/error.middleware.js";
import {
  verifyElevenLabsSignature,
  handlePostCallWebhook,
} from "../services/elevenlabs.service.js";
import { getTenantVoiceEntitlement } from "../services/voice.service.js";
import { searchProductForTenant } from "../services/product.service.js";
import { formatCatalogItemReply } from "../utils/product-presenter.js";
import {
  checkSlotAvailability,
  createAppointment,
  getAppointmentSettings,
  formatScheduledAt,
} from "../services/appointment.service.js";
import { findOrCreateCustomer } from "../services/conversation.service.js";

/**
 * Endpoints públicos que consume ElevenLabs:
 * - Webhook post-call (firma HMAC obligatoria).
 * - Tools en vivo durante la llamada (token propio VOICE_TOOLS_TOKEN).
 * Ninguno usa sesión; todos validan tenant vía el agente de ElevenLabs.
 */

// ─── Webhook post-call ───────────────────────────────────────────────────────

export async function elevenLabsWebhookController(req: Request, res: Response) {
  try {
    if (!env.ELEVENLABS_WEBHOOK_SECRET) {
      logger.warn("[ELEVENLABS] webhook recibido pero ELEVENLABS_WEBHOOK_SECRET no está configurado");
      res.status(503).json({ success: false, message: "Webhook secret not configured" });
      return;
    }

    const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
    const signature = req.headers["elevenlabs-signature"] as string | undefined;

    if (!rawBody || !verifyElevenLabsSignature(rawBody, signature)) {
      logger.warn("[ELEVENLABS] firma de webhook inválida");
      res.status(401).json({ success: false, message: "Invalid signature" });
      return;
    }

    const result = await handlePostCallWebhook(req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error(`[ELEVENLABS] error procesando webhook: ${String(err)}`);
    res.status(500).json({ success: false, message: "Webhook processing error" });
  }
}

// ─── Tools en vivo (invocadas por el agente durante la llamada) ─────────────

/**
 * Autentica la tool-call y resuelve tenant/agente. Además valida entitlement:
 * si el tenant perdió el derecho a voz a mitad de mes, las tools responden
 * con un mensaje de cierre en lugar de datos.
 */
async function authorizeToolCall(req: Request) {
  if (!env.VOICE_TOOLS_TOKEN) {
    throw new AppError("Voice tools no configuradas en el servidor", 503);
  }
  const token = req.headers["x-voice-tools-token"] as string | undefined;
  if (!token || token !== env.VOICE_TOOLS_TOKEN) {
    throw new AppError("Token de tools inválido", 401);
  }

  const elevenLabsAgentId =
    (req.body?.elevenLabsAgentId as string | undefined) ??
    (req.body?.agent_id as string | undefined);
  if (!elevenLabsAgentId) throw new AppError("elevenLabsAgentId requerido", 400);

  const agent = await prisma.agent.findUnique({ where: { elevenLabsAgentId } });
  if (!agent) throw new AppError("Agente no vinculado a Sendwary", 404);

  const entitlement = await getTenantVoiceEntitlement(agent.tenantId);
  return { agent, tenantId: agent.tenantId, entitlement };
}

const NOT_ENTITLED_REPLY =
  "En este momento no puedo completar esa acción. Un asesor del negocio dará seguimiento a tu solicitud.";

export async function toolSearchCatalogController(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantId, entitlement } = await authorizeToolCall(req);
    if (!entitlement.canUseVoice) {
      res.json({ success: true, data: { result: NOT_ENTITLED_REPLY } });
      return;
    }

    const query = String(req.body?.query ?? "").trim();
    if (!query) {
      res.json({ success: true, data: { result: "¿Qué producto o servicio deseas consultar?" } });
      return;
    }

    const search = await searchProductForTenant(query, tenantId);
    const result =
      (search.status === "FOUND" || search.status === "NEEDS_CONFIRMATION") && search.product
        ? formatCatalogItemReply(search.product)
        : search.status === "MULTIPLE_MATCHES" && search.suggestions?.length
          ? `Tenemos varias opciones: ${search.suggestions.slice(0, 3).map((p) => p.name).join(", ")}. ¿Cuál te interesa?`
          : "No encontré ese producto en el catálogo. Puedo tomar nota para que un asesor te confirme.";

    res.json({ success: true, data: { result } });
  } catch (err) {
    next(err);
  }
}

const availabilitySchema = z.object({
  isoDateTime: z.coerce.date({ errorMap: () => ({ message: "Fecha/hora inválida" }) }),
});

export async function toolCheckAvailabilityController(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantId, entitlement } = await authorizeToolCall(req);
    if (!entitlement.canUseVoice) {
      res.json({ success: true, data: { available: false, result: NOT_ENTITLED_REPLY } });
      return;
    }

    const parsed = availabilitySchema.safeParse(req.body);
    if (!parsed.success) {
      res.json({
        success: true,
        data: { available: false, result: "Necesito la fecha y hora exactas para verificar." },
      });
      return;
    }

    const check = await checkSlotAvailability(tenantId, parsed.data.isoDateTime);
    const { fecha, hora } = formatScheduledAt(parsed.data.isoDateTime);
    res.json({
      success: true,
      data: {
        available: check.ok,
        result: check.ok
          ? `El horario ${fecha} a las ${hora} está disponible.`
          : `Ese horario no está disponible: ${check.ok === false ? check.detail : ""}. ¿Te sirve otro?`,
      },
    });
  } catch (err) {
    next(err);
  }
}

const createAppointmentSchema = z.object({
  customerName: z.string().min(2).max(120),
  customerPhone: z.string().min(6).max(30),
  serviceOrProduct: z.string().min(2).max(200),
  isoDateTime: z.coerce.date({ errorMap: () => ({ message: "Fecha/hora inválida" }) }),
});

export async function toolCreateAppointmentController(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantId, agent, entitlement } = await authorizeToolCall(req);
    if (!entitlement.canUseVoice) {
      res.json({ success: true, data: { created: false, result: NOT_ENTITLED_REPLY } });
      return;
    }

    const parsed = createAppointmentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.json({
        success: true,
        data: {
          created: false,
          result: "Me falta un dato para la cita (nombre, teléfono, servicio o fecha). ¿Me lo repites?",
        },
      });
      return;
    }

    const settings = await getAppointmentSettings(tenantId);
    const availability = await checkSlotAvailability(tenantId, parsed.data.isoDateTime, settings);
    if (!availability.ok) {
      const { fecha, hora } = formatScheduledAt(parsed.data.isoDateTime);
      res.json({
        success: true,
        data: {
          created: false,
          result: `No puedo agendar para ${fecha} a las ${hora}: ${availability.detail}. ¿Qué otro horario te sirve?`,
        },
      });
      return;
    }

    const canAutoConfirm = settings.autoConfirmAI && settings.weeklySchedule !== null;
    const appointment = await createAppointment(tenantId, {
      customerName: parsed.data.customerName,
      customerPhone: parsed.data.customerPhone,
      scheduledAt: parsed.data.isoDateTime,
      serviceOrProduct: parsed.data.serviceOrProduct,
      notes: "Agendada durante llamada IA (ElevenLabs)",
      source: "AI",
      agentId: agent.id,
      status: canAutoConfirm ? "CONFIRMED" : "PENDING",
    });

    const { fecha, hora } = formatScheduledAt(new Date(appointment.scheduledAt));
    res.json({
      success: true,
      data: {
        created: true,
        appointmentId: appointment.id,
        result: `Cita ${canAutoConfirm ? "confirmada" : "registrada (el negocio la confirmará)"} para ${fecha} a las ${hora} a nombre de ${appointment.customerName}.`,
      },
    });
  } catch (err) {
    next(err);
  }
}

const requestHumanSchema = z.object({
  customerPhone: z.string().min(6).max(30).optional(),
  customerName: z.string().max(120).optional(),
  reason: z.string().max(500).optional(),
});

export async function toolRequestHumanController(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantId, agent } = await authorizeToolCall(req);

    const parsed = requestHumanSchema.safeParse(req.body ?? {});
    const data = parsed.success ? parsed.data : {};

    // Crea el rastro para el equipo: conversación VOICE + handoff abierto
    // (aparece de inmediato en el filtro "Esperando humano" del inbox).
    if (data.customerPhone) {
      const customer = await findOrCreateCustomer({
        tenantId,
        phone: data.customerPhone,
        customerName: data.customerName,
      });
      const conversation = await prisma.conversation.create({
        data: {
          tenantId,
          customerId: customer.id,
          agentId: agent.id,
          whatsappPhone: data.customerPhone,
          customerName: customer.name,
          channel: "VOICE",
          status: "HUMAN_ACTIVE",
          lastMessageAt: new Date(),
          lastMessagePreview: `📞 Cliente pidió hablar con un humano${data.reason ? `: ${data.reason.slice(0, 80)}` : ""}`,
        },
      });
      await prisma.humanHandoff.create({
        data: {
          tenantId,
          conversationId: conversation.id,
          reason: data.reason ?? "Solicitud de humano durante llamada IA",
          status: "OPEN",
        },
      });
    }

    res.json({
      success: true,
      data: {
        result:
          "Entendido, un asesor del negocio te contactará lo antes posible. ¿Algo más en lo que pueda ayudarte?",
      },
    });
  } catch (err) {
    next(err);
  }
}