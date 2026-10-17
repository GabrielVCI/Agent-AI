import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import {
  getConversationHistory,
  takeoverConversation,
  releaseConversationToAgent,
  closeConversation,
  saveHumanMessage,
  updateConversationLastMessage,
} from "../services/conversation.service.js";
import { sendWhatsappTextMessage } from "../services/meta-whatsapp.service.js";
import { resolveSendCredentialsForTenant } from "../services/whatsapp-integration.service.js";
import { AppError } from "../middlewares/error.middleware.js";
import { logger } from "../config/logger.js";
import { bumpUsage } from "../services/billing.service.js";

const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  status: z.enum(["OPEN", "BOT_ACTIVE", "HUMAN_ACTIVE", "CLOSED"]).optional(),
  agentId: z.string().optional(),
  search: z.string().optional(),
  /** true => solo conversaciones con handoff humano abierto (pendientes de atención) */
  pendingHuman: z.coerce.boolean().optional(),
  /** true => solo conversaciones con al menos una cotización */
  withQuote: z.coerce.boolean().optional(),
  /** Rango sobre lastMessageAt (YYYY-MM-DD) */
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  /** true => solo conversaciones asignadas al usuario autenticado */
  assignedToMe: z.coerce.boolean().optional(),
  /** true => solo conversaciones sin usuario asignado */
  unassigned: z.coerce.boolean().optional(),
  /** filtrar por etiqueta */
  labelId: z.string().optional(),
  /** true => el último mensaje es del cliente y nadie ha respondido (por responder) */
  awaiting: z.coerce.boolean().optional(),
});

const replySchema = z.object({
  message: z.string().min(1, "Mensaje requerido"),
});

const takeoverSchema = z.object({
  reason: z.string().optional(),
});

export async function listConversationsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.tenantId) throw new AppError("Empresa no identificada", 403);

    const parsed = paginationSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ success: false, errors: parsed.error.flatten().fieldErrors });
      return;
    }

    const {
      page, limit, status, agentId, search, pendingHuman, assignedToMe,
      unassigned, labelId, awaiting, withQuote, dateFrom, dateTo,
    } = parsed.data;
    const skip = (page - 1) * limit;

    const where = {
      tenantId: req.tenantId,
      ...(status ? { status } : {}),
      ...(agentId ? { agentId } : {}),
      ...(withQuote ? { quotes: { some: {} } } : {}),
      ...(dateFrom || dateTo
        ? {
            lastMessageAt: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59.999`) } : {}),
            },
          }
        : {}),
      ...(assignedToMe && req.user ? { assignedToUserId: req.user.id } : {}),
      ...(unassigned ? { assignedToUserId: null } : {}),
      ...(labelId ? { labels: { some: { labelId } } } : {}),
      // "Por responder": el cliente escribió y nadie (IA ni humano) respondió aún.
      // Va en AND para no chocar con el OR de `search`.
      ...(awaiting
        ? {
            lastInboundAt: { not: null },
            AND: [
              {
                OR: [
                  { lastOutboundAt: null },
                  { lastOutboundAt: { lt: prisma.conversation.fields.lastInboundAt } },
                ],
              },
            ],
          }
        : {}),
      ...(search
        ? {
            OR: [
              { customerName: { contains: search, mode: "insensitive" as const } },
              { whatsappPhone: { contains: search, mode: "insensitive" as const } },
              { customer: { is: { phone: { contains: search, mode: "insensitive" as const } } } },
              { customer: { is: { name: { contains: search, mode: "insensitive" as const } } } },
              { lastMessagePreview: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
      ...(pendingHuman ? { handoffs: { some: { status: "OPEN" as const } } } : {}),
    };

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        include: {
          customer: true,
          agent: { select: { id: true, name: true } },
          assignedTo: { select: { id: true, name: true } },
          labels: { include: { label: { select: { id: true, name: true, color: true } } } },
          handoffs: { where: { status: "OPEN" }, select: { id: true }, take: 1 },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          quotes: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { id: true, quoteNumber: true, status: true, total: true },
          },
        },
        orderBy: { lastMessageAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.conversation.count({ where }),
    ]);

    res.json({
      success: true,
      data: conversations.map((c) => ({
        id: c.id,
        status: c.status,
        channel: c.channel,
        whatsappPhone: c.whatsappPhone,
        customerName: c.customerName,
        lastMessageAt: c.lastMessageAt,
        lastMessagePreview: c.lastMessagePreview,
        customer: { id: c.customer.id, name: c.customer.name, phone: c.customer.phone },
        agent: c.agent,
        assignedTo: c.assignedTo,
        labels: c.labels.map((a) => a.label),
        needsHuman: c.handoffs.length > 0,
        awaitingReply: Boolean(
          c.lastInboundAt && (!c.lastOutboundAt || c.lastOutboundAt < c.lastInboundAt)
        ),
        lastInboundAt: c.lastInboundAt,
        lastOutboundAt: c.lastOutboundAt,
        lastMessage: c.messages[0] ?? null,
        currentQuote: c.quotes[0]
          ? { ...c.quotes[0], total: Number(c.quotes[0].total.toString()) }
          : null,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
}

export async function getConversationController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.tenantId) throw new AppError("Empresa no identificada", 403);

    const conversation = await prisma.conversation.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId },
      include: {
        customer: true,
        agent: true,
        quotes: {
          orderBy: { createdAt: "desc" },
          include: { lines: true },
        },
      },
    });

    if (!conversation) {
      res.status(404).json({ success: false, message: "Conversación no encontrada" });
      return;
    }

    res.json({ success: true, data: conversation });
  } catch (err) {
    next(err);
  }
}

export async function getConversationMessagesController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.tenantId) throw new AppError("Empresa no identificada", 403);

    const conversation = await prisma.conversation.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId },
    });

    if (!conversation) {
      res.status(404).json({ success: false, message: "Conversación no encontrada" });
      return;
    }

    // El Inbox muestra una ventana amplia del hilo (los últimos 200); el
    // runtime de la IA usa el default corto.
    const messages = await getConversationHistory(conversation.id, 200);
    // Estado de transcripción de audios (vive en metadata) expuesto plano para
    // el panel. mediaUrl nunca lleva URLs temporales de Meta (no se persisten).
    const data = messages.map((m) => {
      const meta =
        m.metadata && typeof m.metadata === "object" && !Array.isArray(m.metadata)
          ? (m.metadata as Record<string, unknown>)
          : {};
      return {
        ...m,
        transcriptionStatus:
          typeof meta.transcriptionStatus === "string" ? meta.transcriptionStatus : undefined,
        transcriptionProvider:
          typeof meta.transcriptionProvider === "string" ? meta.transcriptionProvider : undefined,
      };
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function takeoverConversationController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.tenantId || !req.user) throw new AppError("No autenticado", 401);

    const parsed = takeoverSchema.safeParse(req.body);

    await takeoverConversation({
      tenantId: req.tenantId,
      conversationId: req.params.id,
      userId: req.user.id,
      reason: parsed.success ? parsed.data.reason : undefined,
    });

    res.json({ success: true, message: "Conversación tomada exitosamente" });
  } catch (err) {
    next(err);
  }
}

export async function releaseToAgentController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.tenantId) throw new AppError("Empresa no identificada", 403);

    await releaseConversationToAgent({
      tenantId: req.tenantId,
      conversationId: req.params.id,
    });

    res.json({ success: true, message: "Conversación devuelta al agente" });
  } catch (err) {
    next(err);
  }
}

export async function replyToConversationController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.tenantId || !req.user) throw new AppError("No autenticado", 401);

    const parsed = replySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Mensaje requerido",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const conversation = await prisma.conversation.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId },
      include: { agent: true },
    });

    if (!conversation) {
      res.status(404).json({ success: false, message: "Conversación no encontrada" });
      return;
    }

    if (conversation.status === "CLOSED") {
      res.status(409).json({
        success: false,
        message: "La conversación está cerrada. Usa «Tomar» para reabrirla y responder.",
      });
      return;
    }

    const savedMessage = await saveHumanMessage({
      tenantId: req.tenantId,
      conversationId: conversation.id,
      textContent: parsed.data.message,
    });

    // La respuesta manual cuenta como mensaje procesado del plan
    await bumpUsage(req.tenantId, { outboundMessages: 1 });

    // La respuesta manual también debe reflejarse en la lista de conversaciones.
    await updateConversationLastMessage({
      conversationId: conversation.id,
      preview: parsed.data.message.slice(0, 120),
    });

    // Send via WhatsApp if we have the phone and a phoneNumberId
    if (conversation.whatsappPhone && conversation.agent?.whatsappPhoneNumberId) {
      // Token del tenant (integración propia) o fallback global si está
      // permitido. Nunca el de otra empresa: si el número del agente es ajeno,
      // el mensaje queda guardado pero no se envía.
      const { allowed, credentials } = await resolveSendCredentialsForTenant(
        req.tenantId,
        conversation.agent.whatsappPhoneNumberId
      );
      if (allowed) await sendWhatsappTextMessage({
        to: conversation.whatsappPhone,
        text: parsed.data.message,
        phoneNumberId: conversation.agent.whatsappPhoneNumberId,
        credentials: credentials ?? undefined,
      }).catch((err) =>
        logger.error(
          `[CONVERSATIONS] error sending manual reply via WhatsApp: ${
            err instanceof Error ? err.message : String(err)
          }`
        )
      );
    }

    res.json({ success: true, data: savedMessage, message: "Mensaje enviado" });
  } catch (err) {
    next(err);
  }
}

export async function closeConversationController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.tenantId) throw new AppError("Empresa no identificada", 403);

    await closeConversation({ tenantId: req.tenantId, conversationId: req.params.id });
    res.json({ success: true, message: "Conversación cerrada" });
  } catch (err) {
    next(err);
  }
}
