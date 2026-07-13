import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { AppError } from "../middlewares/error.middleware.js";
import * as labels from "../services/conversation-labels.service.js";
import {
  assignConversation,
  unassignConversation,
} from "../services/conversation.service.js";

/**
 * Endpoints del Inbox profesional: etiquetas, asignación y perfil de contacto.
 * Todo tenant-scoped; los contratos usan el sobre { success, data } estándar.
 */

function tenantIdOf(req: Request): string {
  const tenantId = req.user?.tenantId ?? req.tenantId;
  if (!tenantId) throw new AppError("Empresa no identificada", 403);
  return tenantId;
}

function invalid(res: Response, errors: Record<string, string[] | undefined>): void {
  res.status(400).json({ success: false, message: "Datos inválidos", errors });
}

// ─── Etiquetas ───────────────────────────────────────────────────────────────

const labelSchema = z.object({
  name: z.string().min(2, "Nombre requerido").max(40),
  color: z.enum(labels.LABEL_COLORS).optional(),
});

export async function listLabelsController(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await labels.listLabels(tenantIdOf(req)) });
  } catch (err) {
    next(err);
  }
}

export async function createLabelController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = labelSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error.flatten().fieldErrors);
    const label = await labels.createLabel(tenantIdOf(req), parsed.data);
    res.status(201).json({ success: true, data: label });
  } catch (err) {
    next(err);
  }
}

export async function updateLabelController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = labelSchema.partial().safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error.flatten().fieldErrors);
    const label = await labels.updateLabel(tenantIdOf(req), req.params.id, parsed.data);
    res.json({ success: true, data: label });
  } catch (err) {
    next(err);
  }
}

export async function deleteLabelController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await labels.deleteLabel(tenantIdOf(req), req.params.id);
    res.json({ success: true, data: result, message: "Etiqueta eliminada" });
  } catch (err) {
    next(err);
  }
}

const attachLabelSchema = z.object({ labelId: z.string().min(1) });

export async function attachLabelController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = attachLabelSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error.flatten().fieldErrors);
    await labels.addLabelToConversation(tenantIdOf(req), req.params.id, parsed.data.labelId);
    res.json({ success: true, message: "Etiqueta agregada" });
  } catch (err) {
    next(err);
  }
}

export async function detachLabelController(req: Request, res: Response, next: NextFunction) {
  try {
    await labels.removeLabelFromConversation(
      tenantIdOf(req),
      req.params.id,
      req.params.labelId
    );
    res.json({ success: true, message: "Etiqueta removida" });
  } catch (err) {
    next(err);
  }
}

// ─── Asignación ──────────────────────────────────────────────────────────────

const assignSchema = z.object({ userId: z.string().min(1) });

export async function assignConversationController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user) throw new AppError("No autenticado", 401);
    const parsed = assignSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error.flatten().fieldErrors);

    // AGENT_OPERATOR solo puede asignarse a sí mismo; OWNER/ADMIN a cualquiera
    const isManager = ["OWNER", "ADMIN"].includes(req.user.role);
    if (!isManager && parsed.data.userId !== req.user.id) {
      throw new AppError("Solo puedes asignarte conversaciones a ti mismo", 403);
    }

    const target = await assignConversation({
      tenantId: tenantIdOf(req),
      conversationId: req.params.id,
      targetUserId: parsed.data.userId,
      byUserId: req.user.id,
    });
    res.json({ success: true, data: { assignedTo: target }, message: `Asignada a ${target.name}` });
  } catch (err) {
    next(err);
  }
}

export async function unassignConversationController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    await unassignConversation({
      tenantId: tenantIdOf(req),
      conversationId: req.params.id,
    });
    res.json({ success: true, message: "Asignación removida" });
  } catch (err) {
    next(err);
  }
}

// ─── Perfil de contacto ──────────────────────────────────────────────────────

export async function conversationProfileController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const tenantId = tenantIdOf(req);
    const conversation = await prisma.conversation.findFirst({
      where: { id: req.params.id, tenantId },
      include: {
        customer: true,
        agent: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true } },
        labels: { include: { label: true } },
        quotes: {
          orderBy: { createdAt: "desc" },
          take: 3,
          select: { id: true, quoteNumber: true, status: true, total: true, createdAt: true },
        },
      },
    });
    if (!conversation) throw new AppError("Conversación no encontrada", 404);

    // Citas del contacto (por teléfono, cubre citas de otras conversaciones)
    const appointments = await prisma.appointment.findMany({
      where: { tenantId, customerPhone: conversation.customer.phone },
      orderBy: { scheduledAt: "desc" },
      take: 5,
      select: {
        id: true,
        serviceOrProduct: true,
        scheduledAt: true,
        status: true,
        source: true,
      },
    });

    // Último producto consultado (contexto del agente en metadata)
    const meta =
      conversation.metadata && typeof conversation.metadata === "object" && !Array.isArray(conversation.metadata)
        ? (conversation.metadata as Record<string, unknown>)
        : {};
    const lastProduct = (meta.lastProductContext as { productName?: string } | undefined)?.productName ?? null;

    res.json({
      success: true,
      data: {
        contact: {
          id: conversation.customer.id,
          name: conversation.customer.name ?? conversation.customerName,
          phone: conversation.customer.phone,
          email: conversation.customer.email,
          notes: conversation.customer.notes,
          lastActivityAt: conversation.customer.lastActivityAt,
        },
        conversation: {
          id: conversation.id,
          status: conversation.status,
          createdAt: conversation.createdAt,
          agent: conversation.agent,
          assignedTo: conversation.assignedTo,
        },
        labels: conversation.labels.map((a) => ({
          id: a.label.id,
          name: a.label.name,
          color: a.label.color,
        })),
        appointments,
        quotes: conversation.quotes.map((q) => ({
          ...q,
          total: Number(q.total.toString()),
        })),
        lastProduct,
      },
    });
  } catch (err) {
    next(err);
  }
}

const contactUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  email: z
    .string()
    .email("Email inválido")
    .nullish()
    .or(z.literal("").transform(() => null)),
  notes: z.string().max(4000).nullish(),
});

export async function updateContactController(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = tenantIdOf(req);
    const parsed = contactUpdateSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error.flatten().fieldErrors);

    const conversation = await prisma.conversation.findFirst({
      where: { id: req.params.id, tenantId },
      select: { id: true, customerId: true },
    });
    if (!conversation) throw new AppError("Conversación no encontrada", 404);

    const customer = await prisma.customer.update({
      where: { id: conversation.customerId },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name.trim() } : {}),
        ...(parsed.data.email !== undefined ? { email: parsed.data.email } : {}),
        ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
      },
    });

    // Mantener el nombre denormalizado de la conversación en sincronía
    if (parsed.data.name !== undefined) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { customerName: customer.name },
      });
    }

    res.json({
      success: true,
      data: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        notes: customer.notes,
      },
    });
  } catch (err) {
    next(err);
  }
}
