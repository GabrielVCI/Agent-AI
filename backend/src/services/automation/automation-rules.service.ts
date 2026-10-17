/**
 * CRUD y consulta de reglas de automatización. SIEMPRE por tenant.
 *
 * No existen reglas globales en base de datos: las plantillas de Sendwary
 * viven en código (automation-templates.ts) y se instancian como reglas del
 * tenant. Así es imposible que un tenant edite (ni lea) la regla de otro.
 */
import { Prisma } from "@prisma/client";
import type {
  AutomationActionType,
  AutomationEventType,
  AutomationRule,
  AutomationRuleStatus,
  AutomationScheduleStrategy,
} from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../errors/AppError.js";
import { validateCondition } from "./automation-conditions.js";
import { hasExecutor, validateActionConfig } from "./executors/index.js";
import { isAutomationEventType } from "./automation.types.js";
import type { AutomationScheduleConfig } from "./automation.types.js";
import { parseLocalTime } from "../../utils/timezone.js";

export interface RuleInput {
  name: string;
  description?: string | null;
  eventType: AutomationEventType;
  status?: AutomationRuleStatus;
  enabled?: boolean;
  conditions?: unknown;
  actionType: AutomationActionType;
  actionConfig: Record<string, unknown>;
  scheduleStrategy?: AutomationScheduleStrategy;
  delayMinutes?: number;
  scheduleConfig?: AutomationScheduleConfig | null;
  cancelOnEventTypes?: AutomationEventType[];
  priority?: number;
  maxAttempts?: number | null;
}

export function serializeRule(rule: AutomationRule) {
  return {
    id: rule.id,
    name: rule.name,
    description: rule.description,
    eventType: rule.eventType,
    status: rule.status,
    enabled: rule.enabled,
    conditions: rule.conditionsJson,
    actionType: rule.actionType,
    actionConfig: rule.actionConfigJson,
    scheduleStrategy: rule.scheduleStrategy,
    delayMinutes: rule.delayMinutes,
    scheduleConfig: rule.scheduleConfigJson,
    cancelOnEventTypes: rule.cancelOnEventTypes,
    priority: rule.priority,
    maxAttempts: rule.maxAttempts,
    templateKey: rule.templateKey,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  };
}

/** Validación de negocio común a create/update. Lanza AppError 400. */
function assertValidRule(input: RuleInput): void {
  if (!isAutomationEventType(input.eventType)) {
    throw new AppError("El tipo de evento no es válido", 400, { code: "VALIDATION_ERROR" });
  }
  if (!hasExecutor(input.actionType)) {
    throw new AppError(
      "Esa acción todavía no está disponible en el motor de automatizaciones",
      400,
      { code: "VALIDATION_ERROR", internalMessage: `sin executor para ${input.actionType}` }
    );
  }

  const conditionError = validateCondition(input.conditions ?? null);
  if (conditionError) {
    throw new AppError(conditionError, 400, { code: "VALIDATION_ERROR" });
  }

  const actionError = validateActionConfig(input.actionType, input.actionConfig);
  if (actionError) {
    throw new AppError(actionError, 400, { code: "VALIDATION_ERROR" });
  }

  const strategy = input.scheduleStrategy ?? "DELAY";
  const config = input.scheduleConfig ?? {};
  if (strategy === "RELATIVE_TO_FIELD" && !config.field) {
    throw new AppError(
      'La programación relativa necesita el campo de fecha (scheduleConfig.field)',
      400,
      { code: "VALIDATION_ERROR" }
    );
  }
  if (strategy === "DAILY_AT_LOCAL_TIME") {
    if (!config.localTime || !parseLocalTime(config.localTime)) {
      throw new AppError('La hora local debe tener formato "HH:mm"', 400, {
        code: "VALIDATION_ERROR",
      });
    }
  }
  if (input.delayMinutes !== undefined && (input.delayMinutes < 0 || input.delayMinutes > 525_600)) {
    throw new AppError("El retraso debe estar entre 0 minutos y 1 año", 400, {
      code: "VALIDATION_ERROR",
    });
  }
  for (const eventType of input.cancelOnEventTypes ?? []) {
    if (!isAutomationEventType(eventType)) {
      throw new AppError("Uno de los eventos de cancelación no es válido", 400, {
        code: "VALIDATION_ERROR",
      });
    }
  }
}

export async function listRules(
  tenantId: string,
  filters: {
    status?: AutomationRuleStatus;
    eventType?: AutomationEventType;
    page?: number;
    limit?: number;
  } = {}
) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(Math.max(1, filters.limit ?? 20), 100);

  const where: Prisma.AutomationRuleWhereInput = {
    tenantId,
    ...(filters.status ? { status: filters.status } : { status: { not: "ARCHIVED" } }),
    ...(filters.eventType ? { eventType: filters.eventType } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.automationRule.findMany({
      where,
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.automationRule.count({ where }),
  ]);

  return {
    items: rows.map(serializeRule),
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
    filters: { status: filters.status ?? null, eventType: filters.eventType ?? null },
  };
}

export async function getRule(tenantId: string, id: string) {
  const rule = await prisma.automationRule.findFirst({ where: { id, tenantId } });
  if (!rule) {
    throw new AppError("No encontramos esa automatización", 404, { code: "RESOURCE_NOT_FOUND" });
  }
  return serializeRule(rule);
}

export async function createRule(tenantId: string, input: RuleInput, createdBy?: string) {
  assertValidRule(input);

  const rule = await prisma.automationRule.create({
    data: {
      tenantId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      eventType: input.eventType,
      status: input.status ?? "DRAFT",
      enabled: input.enabled ?? true,
      conditionsJson: (input.conditions ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      actionType: input.actionType,
      actionConfigJson: input.actionConfig as Prisma.InputJsonValue,
      scheduleStrategy: input.scheduleStrategy ?? "DELAY",
      delayMinutes: input.delayMinutes ?? 0,
      scheduleConfigJson: (input.scheduleConfig ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      cancelOnEventTypes: input.cancelOnEventTypes ?? [],
      priority: input.priority ?? 0,
      maxAttempts: input.maxAttempts ?? null,
      createdBy: createdBy ?? null,
    },
  });

  return serializeRule(rule);
}

export async function updateRule(
  tenantId: string,
  id: string,
  input: Partial<RuleInput>
) {
  const existing = await prisma.automationRule.findFirst({ where: { id, tenantId } });
  if (!existing) {
    throw new AppError("No encontramos esa automatización", 404, { code: "RESOURCE_NOT_FOUND" });
  }

  // Se valida el resultado FINAL de la regla, no solo el parche.
  const merged: RuleInput = {
    name: input.name ?? existing.name,
    description: input.description ?? existing.description,
    eventType: input.eventType ?? existing.eventType,
    status: input.status ?? existing.status,
    enabled: input.enabled ?? existing.enabled,
    conditions: input.conditions !== undefined ? input.conditions : existing.conditionsJson,
    actionType: input.actionType ?? existing.actionType,
    actionConfig:
      (input.actionConfig as Record<string, unknown> | undefined) ??
      ((existing.actionConfigJson ?? {}) as Record<string, unknown>),
    scheduleStrategy: input.scheduleStrategy ?? existing.scheduleStrategy,
    delayMinutes: input.delayMinutes ?? existing.delayMinutes,
    scheduleConfig:
      input.scheduleConfig !== undefined
        ? input.scheduleConfig
        : ((existing.scheduleConfigJson ?? {}) as AutomationScheduleConfig),
    cancelOnEventTypes: input.cancelOnEventTypes ?? existing.cancelOnEventTypes,
    priority: input.priority ?? existing.priority,
    maxAttempts: input.maxAttempts !== undefined ? input.maxAttempts : existing.maxAttempts,
  };
  assertValidRule(merged);

  const rule = await prisma.automationRule.update({
    where: { id: existing.id },
    data: {
      name: merged.name.trim(),
      description: merged.description?.trim() || null,
      eventType: merged.eventType,
      status: merged.status,
      enabled: merged.enabled,
      conditionsJson: (merged.conditions ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      actionType: merged.actionType,
      actionConfigJson: merged.actionConfig as Prisma.InputJsonValue,
      scheduleStrategy: merged.scheduleStrategy,
      delayMinutes: merged.delayMinutes,
      scheduleConfigJson: (merged.scheduleConfig ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      cancelOnEventTypes: merged.cancelOnEventTypes,
      priority: merged.priority,
      maxAttempts: merged.maxAttempts ?? null,
    },
  });

  return serializeRule(rule);
}

/**
 * "Borrado" de una regla: se ARCHIVA y se cancelan sus jobs pendientes.
 * Nunca se borran filas (el historial de ejecuciones debe sobrevivir a la
 * regla para poder auditar qué pasó).
 */
export async function archiveRule(tenantId: string, id: string): Promise<{ cancelledJobs: number }> {
  const existing = await prisma.automationRule.findFirst({ where: { id, tenantId } });
  if (!existing) {
    throw new AppError("No encontramos esa automatización", 404, { code: "RESOURCE_NOT_FOUND" });
  }

  const now = new Date();
  return prisma.$transaction(async (tx) => {
    await tx.automationRule.update({
      where: { id: existing.id },
      data: { status: "ARCHIVED", enabled: false },
    });
    const jobs = await tx.automationJob.findMany({
      where: {
        tenantId,
        automationRuleId: existing.id,
        status: { in: ["PENDING", "SCHEDULED", "RETRY_PENDING"] },
      },
      select: { id: true },
    });
    if (jobs.length > 0) {
      const ids = jobs.map((j) => j.id);
      await tx.automationJob.updateMany({
        where: { id: { in: ids }, tenantId },
        data: { status: "CANCELLED", cancelledAt: now, cancelReason: "Regla archivada" },
      });
      await tx.scheduledMessage.updateMany({
        where: { tenantId, automationJobId: { in: ids }, status: "SCHEDULED" },
        data: { status: "CANCELLED", cancelledAt: now },
      });
    }
    return { cancelledJobs: jobs.length };
  });
}

/** Reglas ACTIVAS del tenant que escuchan este evento. */
export async function findMatchingRules(
  tenantId: string,
  eventType: AutomationEventType
): Promise<AutomationRule[]> {
  return prisma.automationRule.findMany({
    where: { tenantId, eventType, status: "ACTIVE", enabled: true },
    orderBy: { priority: "desc" },
  });
}

/** Reglas del tenant que declaran este evento como cancelador de sus jobs. */
export async function findCancellingRules(
  tenantId: string,
  eventType: AutomationEventType
): Promise<AutomationRule[]> {
  return prisma.automationRule.findMany({
    where: {
      tenantId,
      status: { in: ["ACTIVE", "INACTIVE"] },
      cancelOnEventTypes: { has: eventType },
    },
  });
}
