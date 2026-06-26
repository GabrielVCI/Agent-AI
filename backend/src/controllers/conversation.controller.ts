import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import {
  getConversationHistory,
  takeoverConversation,
  releaseConversationToAgent,
  closeConversation,
  saveHumanMessage,
} from "../services/conversation.service.js";
import {
  sendWhatsappTextMessage,
} from "../services/meta-whatsapp.service.js";
import { AppError } from "../middlewares/error.middleware.js";

const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  status: z.enum(["OPEN", "BOT_ACTIVE", "HUMAN_ACTIVE", "CLOSED"]).optional(),
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

    const { page, limit, status } = parsed.data;
    const skip = (page - 1) * limit;

    const where = {
      tenantId: req.tenantId,
      ...(status ? { status } : {}),
    };

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        include: {
          customer: true,
          agent: { select: { id: true, name: true } },
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
        whatsappPhone: c.whatsappPhone,
        customerName: c.customerName,
        lastMessageAt: c.lastMessageAt,
        lastMessagePreview: c.lastMessagePreview,
        customer: { id: c.customer.id, name: c.customer.name, phone: c.customer.phone },
        agent: c.agent,
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

    const messages = await getConversationHistory(conversation.id);
    res.json({ success: true, data: messages });
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

    await saveHumanMessage({
      tenantId: req.tenantId,
      conversationId: conversation.id,
      textContent: parsed.data.message,
    });

    // Send via WhatsApp if we have the phone and a phoneNumberId
    if (conversation.whatsappPhone && conversation.agent?.whatsappPhoneNumberId) {
      await sendWhatsappTextMessage({
        to: conversation.whatsappPhone,
        text: parsed.data.message,
        phoneNumberId: conversation.agent.whatsappPhoneNumberId,
      }).catch((err) => console.error("Error sending WhatsApp reply:", err));
    }

    res.json({ success: true, message: "Mensaje enviado" });
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
