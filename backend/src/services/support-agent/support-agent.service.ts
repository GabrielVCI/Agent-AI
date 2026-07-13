import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../middlewares/error.middleware.js";
import { classifyIssue, enrichTriageWithAi, type TriageResult } from "./support-triage.service.js";
import { getPlaybook } from "./support-playbook.service.js";
import { getSystemHealth, getTenantSupportContext } from "./support-tools.service.js";

/**
 * Orquestador del asistente IA de soporte (separado del runtime comercial de
 * los tenants).
 *
 * Política de acciones:
 * - Tier 1: SOLO guía (pasos + playbook). Ninguna escritura automática — la
 *   allowlist de acciones ejecutables nace vacía a propósito.
 * - Tier 2: crea ticket con el resumen y el contexto seguro.
 * - Tier 3: crea incidente ESCALATED/CRITICAL, adjunta health y BLOQUEA
 *   cualquier acción automática.
 * - Todo queda en SupportAuditLog.
 */

export type SupportActor = { type: "AI" | "USER" | "ADMIN" | "SYSTEM"; id: string | null };

export async function logSupportAudit(input: {
  ticketId?: string | null;
  actor: SupportActor;
  action: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.supportAuditLog.create({
      data: {
        supportTicketId: input.ticketId ?? null,
        actorType: input.actor.type,
        actorId: input.actor.id,
        action: input.action,
        detailsJson: (input.details ?? {}) as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    logger.warn(`[SUPPORT AUDIT] no se pudo registrar (${input.action}): ${String(err)}`);
  }
}

// ─── Tickets ─────────────────────────────────────────────────────────────────

const TICKET_STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_USER", "RESOLVED", "ESCALATED", "CLOSED"] as const;

export interface CreateTicketInput {
  tenantId?: string | null;
  userId?: string | null;
  createdByUserId?: string | null;
  title: string;
  description: string;
  tier?: "TIER_1" | "TIER_2" | "TIER_3";
  severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  category?: string | null;
  source?: "USER" | "SYSTEM" | "AI" | "ADMIN";
  aiSummary?: string | null;
  detectedIssue?: string | null;
  recommendedAction?: string | null;
  status?: (typeof TICKET_STATUSES)[number];
  metadataJson?: Record<string, unknown> | null;
}

export async function createSupportTicket(input: CreateTicketInput, actor: SupportActor) {
  const ticket = await prisma.supportTicket.create({
    data: {
      tenantId: input.tenantId ?? null,
      userId: input.userId ?? null,
      createdByUserId: input.createdByUserId ?? null,
      title: input.title.trim().slice(0, 200),
      description: input.description.trim().slice(0, 5000),
      tier: input.tier ?? "TIER_2",
      severity: input.severity ?? "MEDIUM",
      category: input.category ?? null,
      source: input.source ?? "USER",
      aiSummary: input.aiSummary ?? null,
      detectedIssue: input.detectedIssue ?? null,
      recommendedAction: input.recommendedAction ?? null,
      status: input.status ?? "OPEN",
      metadataJson: (input.metadataJson ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });

  await logSupportAudit({
    ticketId: ticket.id,
    actor,
    action: "TICKET_CREATED",
    details: { tier: ticket.tier, severity: ticket.severity, source: ticket.source },
  });

  return ticket;
}

export interface ListTicketsFilters {
  tenantId?: string;
  status?: string;
  tier?: string;
  severity?: string;
  limit?: number;
}

export async function listSupportTickets(filters: ListTicketsFilters) {
  const where: Prisma.SupportTicketWhereInput = {};
  if (filters.tenantId) where.tenantId = filters.tenantId;
  if (filters.status && TICKET_STATUSES.includes(filters.status as never)) {
    where.status = filters.status as Prisma.SupportTicketWhereInput["status"];
  }
  if (filters.tier) where.tier = filters.tier as Prisma.SupportTicketWhereInput["tier"];
  if (filters.severity) where.severity = filters.severity as Prisma.SupportTicketWhereInput["severity"];

  return prisma.supportTicket.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take: Math.min(filters.limit ?? 100, 200),
  });
}

export async function getSupportTicket(id: string, tenantScope?: string) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    include: { auditLogs: { orderBy: { createdAt: "asc" }, take: 50 } },
  });
  if (!ticket) throw new AppError("Ticket no encontrado", 404);
  // Un usuario tenant solo puede ver tickets de SU tenant
  if (tenantScope && ticket.tenantId !== tenantScope) {
    throw new AppError("Ticket no encontrado", 404);
  }
  return ticket;
}

export interface UpdateTicketInput {
  status?: (typeof TICKET_STATUSES)[number];
  tier?: "TIER_1" | "TIER_2" | "TIER_3";
  severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  assignedToAdminId?: string | null;
  resolution?: string | null;
  recommendedAction?: string | null;
}

export async function updateSupportTicket(id: string, input: UpdateTicketInput, actor: SupportActor) {
  const existing = await prisma.supportTicket.findUnique({ where: { id } });
  if (!existing) throw new AppError("Ticket no encontrado", 404);

  const resolving =
    (input.status === "RESOLVED" || input.status === "CLOSED") &&
    existing.status !== "RESOLVED" &&
    existing.status !== "CLOSED";

  const ticket = await prisma.supportTicket.update({
    where: { id },
    data: {
      ...(input.status ? { status: input.status } : {}),
      ...(input.tier ? { tier: input.tier } : {}),
      ...(input.severity ? { severity: input.severity } : {}),
      ...(input.assignedToAdminId !== undefined ? { assignedToAdminId: input.assignedToAdminId } : {}),
      ...(input.resolution !== undefined ? { resolution: input.resolution } : {}),
      ...(input.recommendedAction !== undefined ? { recommendedAction: input.recommendedAction } : {}),
      ...(resolving ? { resolvedAt: new Date() } : {}),
    },
  });

  await logSupportAudit({
    ticketId: ticket.id,
    actor,
    action: "TICKET_UPDATED",
    details: { changes: input as Record<string, unknown> },
  });

  // Aprendizaje: al resolver con solución escrita, generar la sugerencia de
  // playbook (NUNCA se autoedita el playbook; un humano la revisa y pega).
  let playbookSuggestion: string | null = null;
  if (resolving && ticket.resolution) {
    playbookSuggestion = buildPlaybookSuggestion(ticket);
    await logSupportAudit({
      ticketId: ticket.id,
      actor: { type: "AI", id: "support-agent" },
      action: "PLAYBOOK_UPDATE_SUGGESTED",
      details: { suggestion: playbookSuggestion },
    });
  }

  return { ticket, playbookSuggestion };
}

/** Snippet markdown listo para pegar en el playbook correspondiente. */
function buildPlaybookSuggestion(ticket: {
  title: string;
  description: string;
  category: string | null;
  resolution: string | null;
  detectedIssue: string | null;
}): string {
  return [
    `<!-- Sugerencia generada por el asistente de soporte (revisar antes de pegar) -->`,
    `### Caso resuelto: ${ticket.title}`,
    ``,
    `- **Síntoma**: ${ticket.detectedIssue ?? ticket.description.slice(0, 200)}`,
    `- **Solución aplicada**: ${ticket.resolution}`,
    `- **Categoría**: ${ticket.category ?? "General"}`,
    ``,
    `Agregar a la tabla de "Errores comunes" del playbook correspondiente si el caso puede repetirse.`,
  ].join("\n");
}

// ─── Flujo principal del agente ──────────────────────────────────────────────

export interface SupportAgentRunInput {
  description: string;
  tenantId?: string | null;
  userId?: string | null;
  /** Quién dispara el triage (para auditoría y source del ticket). */
  actor: SupportActor;
  /** true = si el triage es Tier 2/3 crea el ticket automáticamente. */
  createTicket?: boolean;
}

export interface SupportAgentRunResult {
  triage: TriageResult;
  playbookExcerpt: string | null;
  tenantContext: Awaited<ReturnType<typeof getTenantSupportContext>> | null;
  health: Awaited<ReturnType<typeof getSystemHealth>> | null;
  ticketId: string | null;
  /** Qué decidió hacer el agente (transparencia total). */
  actionsTaken: string[];
}

export async function runSupportAgent(input: SupportAgentRunInput): Promise<SupportAgentRunResult> {
  const actionsTaken: string[] = [];

  // 1) Clasificación determinística + resumen IA opcional
  let triage = classifyIssue(input.description);
  triage = await enrichTriageWithAi(input.description, triage);
  actionsTaken.push(`Clasificado como ${triage.tier} (${triage.severity}): ${triage.detectedIssue}`);

  await logSupportAudit({
    actor: input.actor,
    action: "TRIAGE_EXECUTED",
    details: {
      tier: triage.tier,
      severity: triage.severity,
      detectedIssue: triage.detectedIssue,
      tenantId: input.tenantId ?? null,
    },
  });

  // 2) Contexto seguro del tenant (si aplica) — solo lectura
  let tenantContext: SupportAgentRunResult["tenantContext"] = null;
  if (input.tenantId) {
    try {
      tenantContext = await getTenantSupportContext(input.tenantId);
      actionsTaken.push("Contexto del tenant consultado (solo lectura, datos enmascarados)");
    } catch (err) {
      actionsTaken.push(`No se pudo cargar contexto del tenant: ${err instanceof AppError ? err.message : "error"}`);
    }
  }

  // 3) Health solo para incidentes (evita tocar la BD extra en casos simples)
  let health: SupportAgentRunResult["health"] = null;
  if (triage.incident) {
    health = await getSystemHealth();
    actionsTaken.push("Snapshot de salud del sistema adjuntado");
  }

  // 4) Extracto del playbook para mostrar en el panel
  const playbook = triage.playbookSlug ? getPlaybook(triage.playbookSlug) : null;
  const playbookExcerpt = playbook ? playbook.content.slice(0, 2500) : null;

  // 5) Decisión por tier
  let ticketId: string | null = null;
  const shouldCreateTicket = input.createTicket ?? triage.tier !== "TIER_1";

  if (triage.tier === "TIER_3") {
    const ticket = await createSupportTicket(
      {
        tenantId: input.tenantId ?? null,
        userId: input.userId ?? null,
        title: `[INCIDENTE] ${triage.detectedIssue}`.slice(0, 200),
        description: input.description,
        tier: "TIER_3",
        severity: "CRITICAL",
        category: triage.category,
        source: "AI",
        status: "ESCALATED",
        aiSummary: triage.aiSummary,
        detectedIssue: triage.detectedIssue,
        recommendedAction: triage.recommendedSteps.join("\n"),
        metadataJson: { health, incident: true, detectedAt: new Date().toISOString() },
      },
      { type: "AI", id: "support-agent" }
    );
    ticketId = ticket.id;
    await logSupportAudit({
      ticketId,
      actor: { type: "AI", id: "support-agent" },
      action: "INCIDENT_CREATED",
      details: { severity: "CRITICAL", automaticActionsBlocked: true },
    });
    actionsTaken.push("Incidente Tier 3 creado y ESCALADO a SUPER_ADMIN. Acciones automáticas bloqueadas.");
  } else if (triage.tier === "TIER_2" && shouldCreateTicket) {
    const ticket = await createSupportTicket(
      {
        tenantId: input.tenantId ?? null,
        userId: input.userId ?? null,
        title: triage.detectedIssue.slice(0, 200),
        description: input.description,
        tier: "TIER_2",
        severity: triage.severity,
        category: triage.category,
        source: "AI",
        aiSummary: triage.aiSummary,
        detectedIssue: triage.detectedIssue,
        recommendedAction: triage.recommendedSteps.join("\n"),
        metadataJson: { playbookSlug: triage.playbookSlug },
      },
      { type: "AI", id: "support-agent" }
    );
    ticketId = ticket.id;
    actionsTaken.push("Ticket Tier 2 creado para triage asistido.");
  } else {
    actionsTaken.push(
      "Tier 1: solución guiada entregada (sin escrituras automáticas; la allowlist de acciones ejecutables está vacía por diseño)."
    );
  }

  return { triage, playbookExcerpt, tenantContext, health, ticketId, actionsTaken };
}
