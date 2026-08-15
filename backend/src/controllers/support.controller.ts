import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { AppError } from "../middlewares/error.middleware.js";
import {
  getSystemHealth,
  getTenantSupportContext,
  getUserSupportContext,
  getConversationSupportContext,
} from "../services/support-agent/support-tools.service.js";
import {
  createSupportTicket,
  listSupportTickets,
  getSupportTicket,
  updateSupportTicket,
  runSupportAgent,
  logSupportAudit,
  type SupportActor,
} from "../services/support-agent/support-agent.service.js";

/**
 * Controllers de /api/support. Todo pasa por supportAuth (sesión SUPER_ADMIN,
 * token interno del agente IA, o usuario tenant restringido a sus tickets).
 * Nada aquí devuelve secrets: los contextos usan allowlists y máscaras.
 */

function actorOf(req: Request): SupportActor {
  const a = req.supportActor;
  if (!a) throw new AppError("No autenticado", 401);
  return { type: a.type, id: a.id };
}

const isStaff = (req: Request) =>
  req.supportActor?.type === "ADMIN" || req.supportActor?.type === "AI";

// ─── Contexto seguro ─────────────────────────────────────────────────────────

export async function supportHealthController(req: Request, res: Response, next: NextFunction) {
  try {
    const health = await getSystemHealth();
    await logSupportAudit({ actor: actorOf(req), action: "HEALTH_CHECKED" });
    res.json({ success: true, data: health });
  } catch (err) {
    next(err);
  }
}

export async function supportTenantContextController(req: Request, res: Response, next: NextFunction) {
  try {
    const context = await getTenantSupportContext(String(req.params.tenantId));
    await logSupportAudit({
      actor: actorOf(req),
      action: "TENANT_CONTEXT_VIEWED",
      details: { tenantId: req.params.tenantId },
    });
    res.json({ success: true, data: context });
  } catch (err) {
    next(err);
  }
}

export async function supportUserContextController(req: Request, res: Response, next: NextFunction) {
  try {
    const context = await getUserSupportContext(String(req.params.userId));
    await logSupportAudit({
      actor: actorOf(req),
      action: "USER_CONTEXT_VIEWED",
      details: { userId: req.params.userId },
    });
    res.json({ success: true, data: context });
  } catch (err) {
    next(err);
  }
}

export async function supportConversationContextController(req: Request, res: Response, next: NextFunction) {
  try {
    const context = await getConversationSupportContext(String(req.params.id));
    await logSupportAudit({
      actor: actorOf(req),
      action: "CONVERSATION_CONTEXT_VIEWED",
      details: { conversationId: req.params.id },
    });
    res.json({ success: true, data: context });
  } catch (err) {
    next(err);
  }
}

// ─── Tickets ─────────────────────────────────────────────────────────────────

const createTicketSchema = z.object({
  title: z.string().min(4, "Título requerido").max(200),
  description: z.string().min(10, "Describe el problema").max(5000),
  tenantId: z.string().optional().nullable(),
  userId: z.string().optional().nullable(),
  category: z.string().max(80).optional().nullable(),
  tier: z.enum(["TIER_1", "TIER_2", "TIER_3"]).optional(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
});

export async function createTicketController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = createTicketSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: "Datos inválidos", errors: parsed.error.flatten().fieldErrors });
      return;
    }

    const staff = isStaff(req);
    // Usuarios tenant: el ticket queda SIEMPRE anclado a su propio tenant.
    const tenantId = staff ? (parsed.data.tenantId ?? null) : (req.user?.tenantId ?? null);
    if (!staff && !tenantId) throw new AppError("Usuario no asociado a ninguna empresa", 403);

    const ticket = await createSupportTicket(
      {
        ...parsed.data,
        tenantId,
        userId: staff ? (parsed.data.userId ?? null) : req.user?.id ?? null,
        createdByUserId: req.supportActor?.type === "AI" ? null : req.user?.id ?? null,
        source: req.supportActor?.type === "AI" ? "AI" : staff ? "ADMIN" : "USER",
        // Usuarios tenant no eligen tier/severity a su favor: default T2/MEDIUM
        tier: staff ? parsed.data.tier : undefined,
        severity: staff ? parsed.data.severity : undefined,
      },
      actorOf(req)
    );
    res.status(201).json({ success: true, data: ticket });
  } catch (err) {
    next(err);
  }
}

export async function listTicketsController(req: Request, res: Response, next: NextFunction) {
  try {
    const staff = isStaff(req);
    const tickets = await listSupportTickets({
      // Usuarios tenant SOLO ven tickets de su tenant
      tenantId: staff ? (req.query.tenantId as string | undefined) : req.user?.tenantId ?? "__none__",
      status: req.query.status as string | undefined,
      tier: req.query.tier as string | undefined,
      severity: req.query.severity as string | undefined,
      search: typeof req.query.search === "string" ? req.query.search.slice(0, 120) : undefined,
    });
    res.json({ success: true, data: tickets });
  } catch (err) {
    next(err);
  }
}

export async function getTicketController(req: Request, res: Response, next: NextFunction) {
  try {
    const staff = isStaff(req);
    const ticket = await getSupportTicket(
      String(req.params.id),
      staff ? undefined : req.user?.tenantId ?? "__none__"
    );
    res.json({ success: true, data: ticket });
  } catch (err) {
    next(err);
  }
}

const updateTicketSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "WAITING_USER", "RESOLVED", "ESCALATED", "CLOSED"]).optional(),
  tier: z.enum(["TIER_1", "TIER_2", "TIER_3"]).optional(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  assignedToAdminId: z.string().nullable().optional(),
  resolution: z.string().max(5000).nullable().optional(),
  recommendedAction: z.string().max(5000).nullable().optional(),
});

export async function updateTicketController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = updateTicketSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: "Datos inválidos", errors: parsed.error.flatten().fieldErrors });
      return;
    }
    const result = await updateSupportTicket(String(req.params.id), parsed.data, actorOf(req));
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ─── Triage IA ───────────────────────────────────────────────────────────────

const triageSchema = z.object({
  description: z.string().min(10, "Describe el problema").max(5000),
  tenantId: z.string().optional().nullable(),
  userId: z.string().optional().nullable(),
  createTicket: z.boolean().optional(),
});

export async function aiTriageController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = triageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: "Datos inválidos", errors: parsed.error.flatten().fieldErrors });
      return;
    }

    const result = await runSupportAgent({
      description: parsed.data.description,
      tenantId: parsed.data.tenantId ?? null,
      userId: parsed.data.userId ?? null,
      createTicket: parsed.data.createTicket,
      actor: actorOf(req),
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
