/**
 * Ciclo de vida de los jobs de automatización.
 *
 * Todas las funciones reciben tenantId explícito y lo aplican en el WHERE: no
 * existe ninguna operación "por id" que no verifique pertenencia al tenant
 * (salvo las funciones de worker, que son de plataforma y procesan la cola
 * global, y las admin, marcadas como tales).
 *
 * Transacciones: cortas y siempre alrededor de cambios de estado. Las llamadas
 * HTTP externas (WhatsApp, email) ocurren FUERA de cualquier transacción:
 *   TX corta (reservar) → commit → llamada externa → TX corta (resultado).
 */
import { Prisma } from "@prisma/client";
import type {
  AutomationActionType,
  AutomationEntityType,
  AutomationEventType,
  AutomationJob,
  AutomationJobStatus,
} from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { logger } from "../../config/logger.js";
import { nextRetryAt } from "./automation-schedule.js";
import type { AutomationJobPayload } from "./automation.types.js";

/** Estados en los que un job todavía puede ejecutarse. */
export const ACTIVE_JOB_STATUSES: AutomationJobStatus[] = [
  "PENDING",
  "SCHEDULED",
  "RETRY_PENDING",
];

/** Estados reclamables por el worker (PROCESSING se recupera por lease). */
const CLAIMABLE_STATUSES: AutomationJobStatus[] = ["PENDING", "SCHEDULED", "RETRY_PENDING"];

export interface ScheduleJobInput {
  tenantId: string;
  automationRuleId: string;
  eventType: AutomationEventType;
  entityType: AutomationEntityType;
  entityId: string;
  customerId?: string | null;
  actionType: AutomationActionType;
  scheduledFor: Date;
  idempotencyKey: string;
  priority?: number;
  maxAttempts?: number;
  payload?: AutomationJobPayload;
  correlationId?: string | null;
  /** Datos del mensaje programado asociado (outbox), si la acción envía uno. */
  scheduledMessage?: {
    channel: "WHATSAPP" | "EMAIL";
    destination?: string | null;
    conversationId?: string | null;
    agentId?: string | null;
    templateKey?: string | null;
  } | null;
}

export type ScheduleJobOutcome = "CREATED" | "RESCHEDULED" | "REACTIVATED" | "SKIPPED_DUPLICATE";

export interface ScheduleJobResult {
  outcome: ScheduleJobOutcome;
  job: AutomationJob | null;
}

/**
 * Crea o reprograma un job de forma idempotente.
 *
 * Se apoya en el UNIQUE (tenantId, idempotencyKey):
 *  - no existe            → CREATED
 *  - existe y está activo → RESCHEDULED (cambia fecha/payload, NO duplica)
 *  - existe y CANCELLED   → REACTIVATED (el cliente volvió a calificar)
 *  - existe y COMPLETED   → SKIPPED_DUPLICATE (jamás se ejecuta dos veces)
 *  - existe y PROCESSING  → SKIPPED_DUPLICATE (lo está corriendo un worker)
 *  - existe y FAILED      → REACTIVATED (nuevo evento = nueva oportunidad)
 */
export async function scheduleJob(input: ScheduleJobInput): Promise<ScheduleJobResult> {
  const payloadJson = (input.payload ?? {}) as Prisma.InputJsonValue;

  return prisma.$transaction(async (tx) => {
    const existing = await tx.automationJob.findUnique({
      where: {
        tenantId_idempotencyKey: {
          tenantId: input.tenantId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });

    if (!existing) {
      const job = await tx.automationJob.create({
        data: {
          tenantId: input.tenantId,
          automationRuleId: input.automationRuleId,
          eventType: input.eventType,
          entityType: input.entityType,
          entityId: input.entityId,
          customerId: input.customerId ?? null,
          actionType: input.actionType,
          scheduledFor: input.scheduledFor,
          status: "SCHEDULED",
          priority: input.priority ?? 0,
          maxAttempts: input.maxAttempts ?? 5,
          idempotencyKey: input.idempotencyKey,
          payloadJson,
          correlationId: input.correlationId ?? null,
        },
      });

      if (input.scheduledMessage) {
        await tx.scheduledMessage.create({
          data: {
            tenantId: input.tenantId,
            automationJobId: job.id,
            customerId: input.customerId ?? null,
            conversationId: input.scheduledMessage.conversationId ?? null,
            agentId: input.scheduledMessage.agentId ?? null,
            channel: input.scheduledMessage.channel,
            templateKey: input.scheduledMessage.templateKey ?? null,
            destination: input.scheduledMessage.destination ?? null,
            scheduledFor: input.scheduledFor,
            status: "SCHEDULED",
            dedupeKey: input.idempotencyKey,
          },
        });
      }

      return { outcome: "CREATED" as const, job };
    }

    if (existing.status === "COMPLETED" || existing.status === "PROCESSING") {
      return { outcome: "SKIPPED_DUPLICATE" as const, job: existing };
    }

    const reactivating = existing.status === "CANCELLED" || existing.status === "FAILED";
    const job = await tx.automationJob.update({
      where: { id: existing.id },
      data: {
        scheduledFor: input.scheduledFor,
        status: "SCHEDULED",
        payloadJson,
        priority: input.priority ?? existing.priority,
        correlationId: input.correlationId ?? existing.correlationId,
        // Un nuevo evento reabre el presupuesto de intentos.
        ...(reactivating
          ? {
              attemptCount: 0,
              cancelledAt: null,
              failedAt: null,
              cancelReason: null,
              lastError: null,
              lastErrorCode: null,
            }
          : {}),
      },
    });

    await tx.scheduledMessage.updateMany({
      where: { tenantId: input.tenantId, dedupeKey: input.idempotencyKey },
      data: {
        scheduledFor: input.scheduledFor,
        status: "SCHEDULED",
        cancelledAt: null,
        failedAt: null,
        lastError: null,
      },
    });

    return { outcome: reactivating ? ("REACTIVATED" as const) : ("RESCHEDULED" as const), job };
  });
}

export interface CancelJobsInput {
  tenantId: string;
  entityType?: AutomationEntityType;
  entityId?: string;
  customerId?: string;
  /** Limita la cancelación a ciertas reglas (ej. las que declaran cancelOn). */
  ruleIds?: string[];
  /** Solo jobs programados a futuro (default true). */
  onlyFuture?: boolean;
  reason: string;
}

/**
 * Cancela jobs pendientes de una entidad/cliente.
 *
 * Es el punto ÚNICO de cancelación: los controladores nunca tocan jobs
 * directamente. Los jobs en PROCESSING no se cancelan (ya están corriendo);
 * los COMPLETED/FAILED tampoco.
 */
export async function cancelJobsForEntity(input: CancelJobsInput): Promise<number> {
  if (!input.entityId && !input.customerId) {
    throw new Error("cancelJobsForEntity requiere entityId o customerId");
  }

  // Cuando llegan entidad Y cliente, el alcance es la UNIÓN: el seguimiento de
  // un cliente puede estar colgado de la cita que lo originó (entityType
  // APPOINTMENT) o del propio contacto (entityType CUSTOMER). Ambos deben
  // cancelarse cuando el cliente vuelve o la cita se cae.
  const scopes: Prisma.AutomationJobWhereInput[] = [];
  if (input.entityId) {
    scopes.push({
      entityId: input.entityId,
      ...(input.entityType ? { entityType: input.entityType } : {}),
    });
  }
  if (input.customerId) scopes.push({ customerId: input.customerId });

  const where: Prisma.AutomationJobWhereInput = {
    tenantId: input.tenantId,
    status: { in: ACTIVE_JOB_STATUSES },
    ...(scopes.length === 1 ? scopes[0] : { OR: scopes }),
    ...(input.ruleIds && input.ruleIds.length > 0
      ? { automationRuleId: { in: input.ruleIds } }
      : {}),
    ...(input.onlyFuture === false ? {} : { scheduledFor: { gt: new Date() } }),
  };

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const targets = await tx.automationJob.findMany({ where, select: { id: true } });
    if (targets.length === 0) return 0;

    const ids = targets.map((t) => t.id);
    await tx.automationJob.updateMany({
      where: { id: { in: ids }, tenantId: input.tenantId },
      data: { status: "CANCELLED", cancelledAt: now, cancelReason: input.reason.slice(0, 200) },
    });
    await tx.scheduledMessage.updateMany({
      where: {
        tenantId: input.tenantId,
        automationJobId: { in: ids },
        status: "SCHEDULED",
      },
      data: { status: "CANCELLED", cancelledAt: now },
    });

    logger.info(
      `automation.job.cancelled tenantId=${input.tenantId} count=${ids.length} reason=${input.reason}`
    );
    return ids.length;
  });
}

/** Cancela un job concreto del tenant (API / admin). */
export async function cancelJobById(input: {
  tenantId: string;
  jobId: string;
  reason: string;
}): Promise<boolean> {
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.automationJob.updateMany({
      where: {
        id: input.jobId,
        tenantId: input.tenantId,
        status: { in: ACTIVE_JOB_STATUSES },
      },
      data: { status: "CANCELLED", cancelledAt: now, cancelReason: input.reason.slice(0, 200) },
    });
    if (updated.count > 0) {
      await tx.scheduledMessage.updateMany({
        where: { tenantId: input.tenantId, automationJobId: input.jobId, status: "SCHEDULED" },
        data: { status: "CANCELLED", cancelledAt: now },
      });
    }
    return updated.count;
  });

  if (result > 0) {
    logger.info(
      `automation.job.cancelled tenantId=${input.tenantId} jobId=${input.jobId} reason=${input.reason}`
    );
  }
  return result > 0;
}

/** Reprograma un job existente del tenant sin duplicarlo. */
export async function rescheduleJob(input: {
  tenantId: string;
  jobId: string;
  scheduledFor: Date;
}): Promise<AutomationJob | null> {
  return prisma.$transaction(async (tx) => {
    const job = await tx.automationJob.findFirst({
      where: { id: input.jobId, tenantId: input.tenantId },
    });
    if (!job) return null;
    if (job.status === "PROCESSING" || job.status === "COMPLETED") return null;

    const updated = await tx.automationJob.update({
      where: { id: job.id },
      data: {
        scheduledFor: input.scheduledFor,
        status: "SCHEDULED",
        cancelledAt: null,
        cancelReason: null,
      },
    });
    await tx.scheduledMessage.updateMany({
      where: { tenantId: input.tenantId, automationJobId: job.id },
      data: { scheduledFor: input.scheduledFor, status: "SCHEDULED", cancelledAt: null },
    });

    logger.info(
      `automation.job.rescheduled tenantId=${input.tenantId} jobId=${job.id} scheduledFor=${input.scheduledFor.toISOString()}`
    );
    return updated;
  });
}

// ─── Worker: claim, lease y cierre ───────────────────────────────────────────

/**
 * Reclama jobs vencidos de forma ATÓMICA para este worker.
 *
 * `FOR UPDATE SKIP LOCKED` es lo que permite que N instancias de Railway
 * consuman la misma cola sin ejecutar el mismo job dos veces: la fila queda
 * bloqueada dentro del UPDATE y las demás instancias simplemente la saltan.
 * El cambio de estado a PROCESSING + lockedBy hace el reclamo visible para
 * cualquier otro proceso.
 */
export async function claimDueJobs(input: {
  workerId: string;
  batchSize: number;
  now?: Date;
}): Promise<AutomationJob[]> {
  const now = input.now ?? new Date();
  const statuses = Prisma.join(CLAIMABLE_STATUSES.map((s) => Prisma.sql`${s}::"AutomationJobStatus"`));

  const rows = await prisma.$queryRaw<AutomationJob[]>`
    UPDATE "AutomationJob" AS j
    SET status = 'PROCESSING'::"AutomationJobStatus",
        "lockedAt" = ${now},
        "lockedBy" = ${input.workerId},
        "startedAt" = ${now},
        "attemptCount" = j."attemptCount" + 1,
        "updatedAt" = ${now}
    WHERE j.id IN (
      SELECT c.id
      FROM "AutomationJob" c
      WHERE c.status IN (${statuses})
        AND c."scheduledFor" <= ${now}
      ORDER BY c.priority DESC, c."scheduledFor" ASC
      LIMIT ${input.batchSize}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING j.*;
  `;

  return rows;
}

/**
 * Recupera jobs abandonados: un worker que murió deja el job en PROCESSING con
 * un lease vencido. Se devuelven a la cola (o se marcan FAILED si ya agotaron
 * los intentos) para que nunca queden colgados.
 */
export async function recoverStaleJobs(input: {
  leaseMs: number;
  now?: Date;
}): Promise<number> {
  const now = input.now ?? new Date();
  const cutoff = new Date(now.getTime() - input.leaseMs);

  const stale = await prisma.automationJob.findMany({
    where: { status: "PROCESSING", lockedAt: { lt: cutoff } },
    select: { id: true, tenantId: true, attemptCount: true, maxAttempts: true },
    take: 200,
  });
  if (stale.length === 0) return 0;

  const exhausted = stale.filter((j) => j.attemptCount >= j.maxAttempts).map((j) => j.id);
  const retryable = stale.filter((j) => j.attemptCount < j.maxAttempts).map((j) => j.id);

  await prisma.$transaction([
    ...(retryable.length > 0
      ? [
          prisma.automationJob.updateMany({
            where: { id: { in: retryable } },
            data: {
              status: "RETRY_PENDING",
              scheduledFor: now,
              lockedAt: null,
              lockedBy: null,
              lastError: "El worker no terminó el job (lease vencido)",
              lastErrorCode: "WORKER_LEASE_EXPIRED",
            },
          }),
        ]
      : []),
    ...(exhausted.length > 0
      ? [
          prisma.automationJob.updateMany({
            where: { id: { in: exhausted } },
            data: {
              status: "FAILED",
              failedAt: now,
              lockedAt: null,
              lockedBy: null,
              lastError: "El worker no terminó el job y se agotaron los intentos",
              lastErrorCode: "WORKER_LEASE_EXPIRED",
            },
          }),
          prisma.scheduledMessage.updateMany({
            where: { automationJobId: { in: exhausted }, status: "SCHEDULED" },
            data: { status: "FAILED", failedAt: now, lastError: "Lease del worker vencido" },
          }),
        ]
      : []),
  ]);

  logger.warn(
    `automation.job.stale_recovered count=${stale.length} retry=${retryable.length} failed=${exhausted.length}`
  );
  return stale.length;
}

/** Marca el job como COMPLETED y cierra su mensaje programado. */
export async function completeJob(input: {
  tenantId: string;
  jobId: string;
  summary: string;
  startedAt: Date;
  attemptNumber: number;
  ruleId: string;
  correlationId?: string | null;
  /** true = la acción no aplicaba (ej. conversación en modo humano). */
  skipped?: boolean;
}): Promise<void> {
  const now = new Date();
  const summary = input.summary.slice(0, 300);

  await prisma.$transaction([
    prisma.automationJob.update({
      where: { id: input.jobId },
      data: {
        status: "COMPLETED",
        completedAt: now,
        lockedAt: null,
        lockedBy: null,
        lastError: null,
        lastErrorCode: null,
      },
    }),
    prisma.automationExecution.create({
      data: {
        tenantId: input.tenantId,
        jobId: input.jobId,
        ruleId: input.ruleId,
        attemptNumber: input.attemptNumber,
        startedAt: input.startedAt,
        finishedAt: now,
        status: input.skipped ? "SKIPPED" : "SUCCESS",
        resultSummary: summary,
        durationMs: now.getTime() - input.startedAt.getTime(),
        correlationId: input.correlationId ?? null,
      },
    }),
    prisma.scheduledMessage.updateMany({
      where: { tenantId: input.tenantId, automationJobId: input.jobId },
      data: input.skipped
        ? { status: "CANCELLED", cancelledAt: now }
        : { status: "SENT", sentAt: now, attemptCount: input.attemptNumber },
    }),
  ]);

  logger.info(
    `automation.job.completed tenantId=${input.tenantId} jobId=${input.jobId} ruleId=${input.ruleId} attempt=${input.attemptNumber} skipped=${Boolean(input.skipped)}`
  );
}

/**
 * Registra el fallo de un intento: programa retry con backoff o marca FAILED
 * definitivo. Un error NON_RETRYABLE nunca se reintenta (no gastamos cuota en
 * algo que va a fallar igual).
 */
export async function failJobAttempt(input: {
  tenantId: string;
  jobId: string;
  ruleId: string;
  attemptNumber: number;
  maxAttempts: number;
  startedAt: Date;
  errorType: string;
  /** Mensaje YA sanitizado. */
  errorMessage: string;
  retryable: boolean;
  correlationId?: string | null;
  now?: Date;
}): Promise<{ retryScheduled: boolean; nextAttemptAt: Date | null }> {
  const now = input.now ?? new Date();
  const canRetry = input.retryable && input.attemptNumber < input.maxAttempts;
  const nextAttemptAt = canRetry ? nextRetryAt(input.attemptNumber, now) : null;

  await prisma.$transaction([
    prisma.automationJob.update({
      where: { id: input.jobId },
      data: canRetry
        ? {
            status: "RETRY_PENDING",
            scheduledFor: nextAttemptAt as Date,
            lockedAt: null,
            lockedBy: null,
            lastError: input.errorMessage,
            lastErrorCode: input.errorType,
          }
        : {
            status: "FAILED",
            failedAt: now,
            lockedAt: null,
            lockedBy: null,
            lastError: input.errorMessage,
            lastErrorCode: input.errorType,
          },
    }),
    prisma.automationExecution.create({
      data: {
        tenantId: input.tenantId,
        jobId: input.jobId,
        ruleId: input.ruleId,
        attemptNumber: input.attemptNumber,
        startedAt: input.startedAt,
        finishedAt: now,
        status: canRetry ? "RETRY_SCHEDULED" : "FAILED",
        errorType: input.errorType,
        errorMessage: input.errorMessage,
        durationMs: now.getTime() - input.startedAt.getTime(),
        correlationId: input.correlationId ?? null,
      },
    }),
    ...(canRetry
      ? []
      : [
          prisma.scheduledMessage.updateMany({
            where: { tenantId: input.tenantId, automationJobId: input.jobId },
            data: {
              status: "FAILED",
              failedAt: now,
              lastError: input.errorMessage,
              attemptCount: input.attemptNumber,
            },
          }),
        ]),
  ]);

  if (canRetry) {
    logger.warn(
      `automation.job.retry tenantId=${input.tenantId} jobId=${input.jobId} attempt=${input.attemptNumber}/${input.maxAttempts} errorType=${input.errorType} nextAttemptAt=${nextAttemptAt?.toISOString()}`
    );
  } else {
    logger.error(
      `automation.job.failed tenantId=${input.tenantId} jobId=${input.jobId} attempt=${input.attemptNumber}/${input.maxAttempts} errorType=${input.errorType}`
    );
  }

  return { retryScheduled: canRetry, nextAttemptAt };
}

// ─── Consultas (siempre por tenant) ──────────────────────────────────────────

export interface ListJobsFilters {
  status?: AutomationJobStatus;
  eventType?: AutomationEventType;
  ruleId?: string;
  entityId?: string;
  page?: number;
  limit?: number;
}

export async function listJobs(tenantId: string, filters: ListJobsFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(Math.max(1, filters.limit ?? 20), 100);

  const where: Prisma.AutomationJobWhereInput = {
    tenantId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.eventType ? { eventType: filters.eventType } : {}),
    ...(filters.ruleId ? { automationRuleId: filters.ruleId } : {}),
    ...(filters.entityId ? { entityId: filters.entityId } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.automationJob.findMany({
      where,
      orderBy: [{ scheduledFor: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      include: { rule: { select: { id: true, name: true } } },
    }),
    prisma.automationJob.count({ where }),
  ]);

  return {
    items: rows.map(serializeJob),
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
    filters: {
      status: filters.status ?? null,
      eventType: filters.eventType ?? null,
      ruleId: filters.ruleId ?? null,
      entityId: filters.entityId ?? null,
    },
  };
}

type JobWithRule = AutomationJob & { rule?: { id: string; name: string } | null };

export function serializeJob(job: JobWithRule) {
  return {
    id: job.id,
    ruleId: job.automationRuleId,
    ruleName: job.rule?.name ?? null,
    eventType: job.eventType,
    entityType: job.entityType,
    entityId: job.entityId,
    customerId: job.customerId,
    actionType: job.actionType,
    status: job.status,
    priority: job.priority,
    scheduledFor: job.scheduledFor,
    attemptCount: job.attemptCount,
    maxAttempts: job.maxAttempts,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    failedAt: job.failedAt,
    cancelledAt: job.cancelledAt,
    cancelReason: job.cancelReason,
    lastError: job.lastError,
    lastErrorCode: job.lastErrorCode,
    correlationId: job.correlationId,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

export interface ListExecutionsFilters {
  jobId?: string;
  ruleId?: string;
  status?: "SUCCESS" | "FAILED" | "RETRY_SCHEDULED" | "SKIPPED";
  page?: number;
  limit?: number;
}

export async function listExecutions(tenantId: string, filters: ListExecutionsFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(Math.max(1, filters.limit ?? 20), 100);

  const where: Prisma.AutomationExecutionWhereInput = {
    tenantId,
    ...(filters.jobId ? { jobId: filters.jobId } : {}),
    ...(filters.ruleId ? { ruleId: filters.ruleId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.automationExecution.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.automationExecution.count({ where }),
  ]);

  return {
    items: rows,
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
    filters: {
      jobId: filters.jobId ?? null,
      ruleId: filters.ruleId ?? null,
      status: filters.status ?? null,
    },
  };
}

/** Métricas de salud del motor. Sin tenantId = vista de plataforma (admin). */
export async function getAutomationHealth(tenantId?: string) {
  const scope: Prisma.AutomationJobWhereInput = tenantId ? { tenantId } : {};

  const [byStatus, nextDue, lastFailed, staleProcessing] = await Promise.all([
    prisma.automationJob.groupBy({
      by: ["status"],
      where: scope,
      _count: { _all: true },
    }),
    prisma.automationJob.findFirst({
      where: { ...scope, status: { in: ACTIVE_JOB_STATUSES } },
      orderBy: { scheduledFor: "asc" },
      select: { id: true, scheduledFor: true, eventType: true },
    }),
    prisma.automationJob.findFirst({
      where: { ...scope, status: "FAILED" },
      orderBy: { failedAt: "desc" },
      select: {
        id: true,
        failedAt: true,
        lastError: true,
        lastErrorCode: true,
        attemptCount: true,
        automationRuleId: true,
        entityType: true,
        entityId: true,
      },
    }),
    prisma.automationJob.count({
      where: {
        ...scope,
        status: "PROCESSING",
        lockedAt: { lt: new Date(Date.now() - 15 * 60 * 1000) },
      },
    }),
  ]);

  const counts: Record<string, number> = {
    PENDING: 0,
    SCHEDULED: 0,
    PROCESSING: 0,
    COMPLETED: 0,
    FAILED: 0,
    CANCELLED: 0,
    RETRY_PENDING: 0,
  };
  for (const row of byStatus) counts[row.status] = row._count._all;

  return {
    counts,
    pending: counts.PENDING + counts.SCHEDULED + counts.RETRY_PENDING,
    nextDue,
    lastFailed,
    staleProcessing,
  };
}
