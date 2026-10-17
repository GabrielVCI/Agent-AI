/**
 * AutomationEventService — puerta de entrada del motor.
 *
 * Los módulos de negocio (citas, clientes, conversaciones…) solo hacen:
 *
 *   await emitAutomationEvent({ tenantId, type: "APPOINTMENT_COMPLETED", ... })
 *
 * y no saben nada del scheduler, de los reintentos ni de los executors.
 *
 * Responsabilidades: validar el evento → validar el tenant → registrar el
 * evento (idempotente) → encontrar reglas aplicables → evaluar condiciones →
 * crear/reprogramar jobs → cancelar secuencias que dejaron de aplicar.
 */
import { Prisma } from "@prisma/client";
import type { AutomationEntityType, AutomationRule } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { logger } from "../../config/logger.js";
import { env } from "../../config/env.js";
import { AUTOMATION_EVENT_CATALOG, isAutomationEventType } from "./automation.types.js";
import type {
  AutomationEmitResult,
  AutomationEventInput,
  AutomationJobPayload,
  AutomationScheduleConfig,
} from "./automation.types.js";
import { evaluateCondition } from "./automation-conditions.js";
import type { AutomationCondition } from "./automation-conditions.js";
import { buildJobIdempotencyKey, resolveScheduledFor } from "./automation-schedule.js";
import { cancelJobsForEntity, scheduleJob } from "./automation-jobs.service.js";
import { findCancellingRules, findMatchingRules } from "./automation-rules.service.js";
import { DEFAULT_TIMEZONE } from "../../utils/timezone.js";

const EMPTY_RESULT: AutomationEmitResult = {
  processed: false,
  eventId: null,
  matchedRules: 0,
  createdJobs: 0,
  cancelledJobs: 0,
};

/** Canal de una acción para el outbox (ScheduledMessage). null = sin mensaje. */
function outboxChannelFor(actionType: string): "WHATSAPP" | "EMAIL" | null {
  if (actionType === "SEND_WHATSAPP_MESSAGE") return "WHATSAPP";
  if (actionType === "SEND_EMAIL") return "EMAIL";
  return null;
}

/**
 * Emite un evento al motor.
 *
 * NUNCA lanza hacia el módulo llamante: una automatización mal configurada no
 * puede romper la creación de una cita ni la respuesta de WhatsApp. Los fallos
 * quedan en el log con su tenantId/correlationId.
 */
export async function emitAutomationEvent(
  input: AutomationEventInput
): Promise<AutomationEmitResult> {
  try {
    return await emitAutomationEventOrThrow(input);
  } catch (error) {
    logger.error(
      `automation.event.error tenantId=${input.tenantId} type=${input.type} error=${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return EMPTY_RESULT;
  }
}

/** Igual que emitAutomationEvent pero propaga errores (tests y jobs internos). */
export async function emitAutomationEventOrThrow(
  input: AutomationEventInput
): Promise<AutomationEmitResult> {
  if (!input.tenantId) throw new Error("emitAutomationEvent requiere tenantId");
  if (!isAutomationEventType(input.type)) {
    throw new Error(`Tipo de evento desconocido: ${String(input.type)}`);
  }

  const occurredAt = input.occurredAt ?? new Date();
  const definition = AUTOMATION_EVENT_CATALOG[input.type];
  const entityType: AutomationEntityType = input.entityType ?? definition.entityType;
  const entityId = input.entityId ?? input.customerId ?? input.tenantId;
  const correlationId = input.correlationId ?? null;

  // El tenant se valida SIEMPRE contra la BD: nunca se confía en el id que
  // llega desde una capa superior sin verificar que existe y está operativo.
  const tenant = await prisma.tenant.findUnique({
    where: { id: input.tenantId },
    select: { id: true, timezone: true, status: true },
  });
  if (!tenant) {
    logger.warn(`automation.event.received tenant_not_found tenantId=${input.tenantId}`);
    return { ...EMPTY_RESULT, reason: "TENANT_INACTIVE" };
  }
  if (tenant.status !== "ACTIVE") {
    logger.info(
      `automation.event.skipped tenantId=${tenant.id} type=${input.type} reason=tenant_${tenant.status}`
    );
    return { ...EMPTY_RESULT, reason: "TENANT_INACTIVE" };
  }

  const timezone = tenant.timezone || DEFAULT_TIMEZONE;

  // ── Registro del evento (idempotencia a nivel evento) ──
  let eventId: string;
  try {
    const created = await prisma.automationEvent.create({
      data: {
        tenantId: tenant.id,
        type: input.type,
        source: input.source.slice(0, 80),
        entityType,
        entityId,
        occurredAt,
        payloadJson: (input.payload ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        correlationId,
        causationId: input.causationId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
      },
      select: { id: true },
    });
    eventId = created.id;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      input.idempotencyKey
    ) {
      logger.info(
        `automation.event.duplicate tenantId=${tenant.id} type=${input.type} key=${input.idempotencyKey}`
      );
      return { ...EMPTY_RESULT, reason: "DUPLICATE" };
    }
    throw error;
  }

  logger.info(
    `automation.event.received tenantId=${tenant.id} eventId=${eventId} type=${input.type} entity=${entityType}:${entityId}${
      correlationId ? ` correlationId=${correlationId}` : ""
    }`
  );

  // ── Cancelaciones: reglas que declaran este evento como cancelador ──
  let cancelledJobs = 0;
  const cancellingRules = await findCancellingRules(tenant.id, input.type);
  if (cancellingRules.length > 0) {
    // Alcance = entidad del evento ∪ contacto: un seguimiento puede estar
    // colgado de la cita que lo originó o del propio cliente.
    cancelledJobs = await cancelJobsForEntity({
      tenantId: tenant.id,
      entityType,
      entityId,
      // Grano fino: un evento por SERVICIO (Módulo 3) cancela solo lo suyo, no
      // todo el seguimiento del contacto. Ver AutomationEventInput.
      customerId: input.cancelByCustomer === false ? undefined : input.customerId,
      ruleIds: cancellingRules.map((r) => r.id),
      reason: `Cancelado por evento ${input.type}`,
    });
  }

  // ── Reglas aplicables ──
  const rules = await findMatchingRules(tenant.id, input.type);
  if (rules.length === 0) {
    await prisma.automationEvent.update({
      where: { id: eventId },
      data: { matchedRules: 0, createdJobs: 0 },
    });
    return {
      processed: true,
      eventId,
      matchedRules: 0,
      createdJobs: 0,
      cancelledJobs,
      reason: cancelledJobs > 0 ? undefined : "NO_RULES",
    };
  }

  const conditionContext = {
    event: {
      type: input.type,
      source: input.source,
      entityType,
      entityId,
      occurredAt,
    },
    payload: input.payload ?? {},
    tenant: { timezone },
  };

  let matchedRules = 0;
  let createdJobs = 0;

  for (const rule of rules) {
    const conditions = rule.conditionsJson as AutomationCondition | null;
    if (!evaluateCondition(conditions, conditionContext)) continue;
    matchedRules += 1;

    const scheduleConfig = (rule.scheduleConfigJson ?? {}) as AutomationScheduleConfig;
    const schedule = resolveScheduledFor({
      rule,
      occurredAt,
      payload: input.payload,
      timezone,
    });

    if (!schedule.ok) {
      logger.info(
        `automation.job.skipped tenantId=${tenant.id} ruleId=${rule.id} eventType=${input.type} reason=${schedule.reason}`
      );
      continue;
    }

    const idempotencyKey = buildJobIdempotencyKey({
      ruleId: rule.id,
      eventType: input.type,
      entityType,
      entityId,
      scheduledFor: schedule.scheduledFor,
      scheduleConfig,
      timezone,
    });

    const payload: AutomationJobPayload = {
      eventPayload: input.payload ?? {},
      ...(typeof input.payload?.conversationId === "string"
        ? { conversationId: input.payload.conversationId }
        : {}),
      ...(typeof input.payload?.agentId === "string" ? { agentId: input.payload.agentId } : {}),
      ...(typeof input.payload?.customerName === "string"
        ? { customerName: input.payload.customerName }
        : {}),
    };

    const channel = outboxChannelFor(rule.actionType);
    const result = await scheduleJob({
      tenantId: tenant.id,
      automationRuleId: rule.id,
      eventType: input.type,
      entityType,
      entityId,
      customerId: input.customerId ?? null,
      actionType: rule.actionType,
      scheduledFor: schedule.scheduledFor,
      idempotencyKey,
      priority: rule.priority,
      maxAttempts: rule.maxAttempts ?? env.AUTOMATION_MAX_ATTEMPTS,
      payload,
      correlationId,
      scheduledMessage: channel
        ? {
            channel,
            conversationId:
              typeof input.payload?.conversationId === "string"
                ? input.payload.conversationId
                : null,
            agentId: typeof input.payload?.agentId === "string" ? input.payload.agentId : null,
            templateKey: rule.templateKey,
          }
        : null,
    });

    if (result.outcome === "CREATED" || result.outcome === "REACTIVATED") createdJobs += 1;

    logger.info(
      `automation.job.${result.outcome === "RESCHEDULED" ? "rescheduled" : "created"} tenantId=${tenant.id} ruleId=${rule.id} jobId=${result.job?.id ?? "-"} outcome=${result.outcome} scheduledFor=${schedule.scheduledFor.toISOString()}`
    );
  }

  await prisma.automationEvent.update({
    where: { id: eventId },
    data: { matchedRules, createdJobs },
  });

  return { processed: true, eventId, matchedRules, createdJobs, cancelledJobs };
}

/**
 * Cancela las automatizaciones pendientes de una entidad. Es el punto que usan
 * los módulos de negocio cuando algo deja de aplicar (cita cancelada, contacto
 * que vuelve) sin tener que conocer reglas ni jobs.
 */
export async function cancelAutomationsForEntity(input: {
  tenantId: string;
  entityType: AutomationEntityType;
  entityId: string;
  reason: string;
}): Promise<number> {
  try {
    return await cancelJobsForEntity({
      tenantId: input.tenantId,
      entityType: input.entityType,
      entityId: input.entityId,
      reason: input.reason,
    });
  } catch (error) {
    logger.error(
      `automation.cancel.error tenantId=${input.tenantId} entity=${input.entityType}:${input.entityId} error=${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return 0;
  }
}

/** Reglas que escuchan un evento (útil para diagnósticos del panel). */
export async function describeRulesForEvent(
  tenantId: string,
  eventType: AutomationEventInput["type"]
): Promise<Pick<AutomationRule, "id" | "name" | "actionType">[]> {
  const rules = await findMatchingRules(tenantId, eventType);
  return rules.map((r) => ({ id: r.id, name: r.name, actionType: r.actionType }));
}
