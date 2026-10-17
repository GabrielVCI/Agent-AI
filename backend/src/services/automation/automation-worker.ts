/**
 * Worker del motor de automatizaciones (PostgreSQL-backed).
 *
 * Por qué PostgreSQL y no BullMQ/Redis: el proyecto ya usa PostgreSQL como
 * fuente persistente y Redis es OPCIONAL (rate limiting; el backend arranca
 * y funciona con Redis caído). Meter una cola con Redis obligatorio
 * complicaría el despliegue de Railway sin resolver nada que
 * `FOR UPDATE SKIP LOCKED` no resuelva ya con transaccionalidad real.
 *
 * Concurrencia entre instancias: el claim es un UPDATE ... WHERE id IN
 * (SELECT ... FOR UPDATE SKIP LOCKED) — dos instancias jamás reclaman el mismo
 * job. Si un proceso muere durante PROCESSING, el lease vencido lo devuelve a
 * la cola (recoverStaleJobs).
 *
 * Backpressure: lotes de tamaño fijo (AUTOMATION_BATCH_SIZE) procesados con
 * concurrencia limitada (AUTOMATION_CONCURRENCY). Con miles de jobs vencidos
 * el worker avanza en tandas en vez de intentar todo a la vez.
 */
import { randomUUID } from "crypto";
import type { AutomationJob } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { logger } from "../../config/logger.js";
import { env } from "../../config/env.js";
import { claimDueJobs, completeJob, failJobAttempt, recoverStaleJobs } from "./automation-jobs.service.js";
import { classifyError } from "./automation-errors.js";
import { getExecutor } from "./executors/index.js";
import type { AutomationJobPayload } from "./automation.types.js";

export interface WorkerOptions {
  batchSize?: number;
  concurrency?: number;
  pollIntervalMs?: number;
  leaseMs?: number;
  workerId?: string;
}

export interface TickResult {
  claimed: number;
  completed: number;
  failed: number;
  recovered: number;
}

/**
 * Ejecuta UN job ya reclamado (status PROCESSING, attemptCount ya incrementado).
 * Toda llamada externa ocurre fuera de transacción; el resultado se persiste
 * en una transacción corta al final.
 */
export async function runClaimedJob(job: AutomationJob): Promise<"COMPLETED" | "FAILED"> {
  const startedAt = job.startedAt ?? new Date();
  const attemptNumber = job.attemptCount;

  logger.info(
    `automation.job.processing tenantId=${job.tenantId} jobId=${job.id} ruleId=${job.automationRuleId} eventType=${job.eventType} attempt=${attemptNumber}/${job.maxAttempts}`
  );

  try {
    const [rule, tenant] = await Promise.all([
      prisma.automationRule.findFirst({
        where: { id: job.automationRuleId, tenantId: job.tenantId },
      }),
      prisma.tenant.findUnique({
        where: { id: job.tenantId },
        select: { id: true, name: true, timezone: true, status: true },
      }),
    ]);

    if (!tenant) {
      throw Object.assign(new Error("La empresa ya no existe"), { name: "TENANT_NOT_FOUND" });
    }
    if (!rule) {
      throw Object.assign(new Error("La automatización ya no existe"), { name: "RULE_NOT_FOUND" });
    }
    if (rule.status === "ARCHIVED" || !rule.enabled) {
      await completeJob({
        tenantId: job.tenantId,
        jobId: job.id,
        ruleId: job.automationRuleId,
        summary: "Omitido: la automatización está desactivada",
        startedAt,
        attemptNumber,
        correlationId: job.correlationId,
        skipped: true,
      });
      return "COMPLETED";
    }

    const executor = getExecutor(job.actionType);
    if (!executor) {
      throw Object.assign(new Error(`Acción sin executor: ${job.actionType}`), {
        name: "NO_EXECUTOR",
      });
    }

    const result = await executor.execute({
      job,
      rule,
      tenant,
      payload: (job.payloadJson ?? {}) as AutomationJobPayload,
      actionConfig: (rule.actionConfigJson ?? {}) as Record<string, unknown>,
      correlationId: job.correlationId,
    });

    await completeJob({
      tenantId: job.tenantId,
      jobId: job.id,
      ruleId: job.automationRuleId,
      summary: result.summary,
      startedAt,
      attemptNumber,
      correlationId: job.correlationId,
      skipped: result.skipped,
    });
    return "COMPLETED";
  } catch (error) {
    const classified = classifyError(error);
    await failJobAttempt({
      tenantId: job.tenantId,
      jobId: job.id,
      ruleId: job.automationRuleId,
      attemptNumber,
      maxAttempts: job.maxAttempts,
      startedAt,
      errorType: classified.errorType,
      errorMessage: classified.message,
      retryable: classified.kind === "RETRYABLE",
      correlationId: job.correlationId,
    });
    return "FAILED";
  }
}

/** Procesa una lista con concurrencia limitada (sin dependencias externas). */
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  handler: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await handler(items[index]);
    }
  });
  await Promise.all(workers);
}

export class AutomationWorker {
  private readonly workerId: string;
  private readonly batchSize: number;
  private readonly concurrency: number;
  private readonly pollIntervalMs: number;
  private readonly leaseMs: number;

  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private ticking = false;
  private lastRecoveryAt = 0;

  constructor(options: WorkerOptions = {}) {
    this.workerId = options.workerId ?? `${process.pid}-${randomUUID().slice(0, 8)}`;
    this.batchSize = options.batchSize ?? env.AUTOMATION_BATCH_SIZE;
    this.concurrency = options.concurrency ?? env.AUTOMATION_CONCURRENCY;
    this.pollIntervalMs = options.pollIntervalMs ?? env.AUTOMATION_POLL_INTERVAL_MS;
    this.leaseMs = options.leaseMs ?? env.AUTOMATION_JOB_LEASE_MS;
  }

  get id(): string {
    return this.workerId;
  }

  /**
   * Un ciclo: recupera jobs abandonados (como máximo una vez por minuto),
   * reclama un lote y lo procesa con concurrencia limitada.
   */
  async tick(): Promise<TickResult> {
    let recovered = 0;
    if (Date.now() - this.lastRecoveryAt > 60_000) {
      this.lastRecoveryAt = Date.now();
      recovered = await recoverStaleJobs({ leaseMs: this.leaseMs });
    }

    const jobs = await claimDueJobs({ workerId: this.workerId, batchSize: this.batchSize });
    if (jobs.length === 0) return { claimed: 0, completed: 0, failed: 0, recovered };

    let completed = 0;
    let failed = 0;

    await runWithConcurrency(jobs, this.concurrency, async (job) => {
      const outcome = await runClaimedJob(job);
      if (outcome === "COMPLETED") completed += 1;
      else failed += 1;
    });

    return { claimed: jobs.length, completed, failed, recovered };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    logger.info(
      `automation.worker.started workerId=${this.workerId} batchSize=${this.batchSize} concurrency=${this.concurrency} pollMs=${this.pollIntervalMs}`
    );

    const loop = async () => {
      if (!this.running || this.ticking) return;
      this.ticking = true;
      try {
        const result = await this.tick();
        if (result.claimed > 0) {
          logger.info(
            `automation.worker.tick workerId=${this.workerId} claimed=${result.claimed} completed=${result.completed} failed=${result.failed}`
          );
        }
      } catch (error) {
        // Un fallo del ciclo (BD caída) no debe matar el worker: se reintenta
        // en el siguiente intervalo.
        logger.error(
          `automation.worker.error workerId=${this.workerId} error=${
            error instanceof Error ? error.message : String(error)
          }`
        );
      } finally {
        this.ticking = false;
      }
    };

    this.timer = setInterval(() => void loop(), this.pollIntervalMs);
    // No mantiene vivo el proceso si es lo único pendiente (permite salir limpio).
    this.timer.unref?.();
    void loop();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // Espera a que termine el ciclo en curso para no dejar jobs en PROCESSING.
    const deadline = Date.now() + 10_000;
    while (this.ticking && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    logger.info(`automation.worker.stopped workerId=${this.workerId}`);
  }
}

let worker: AutomationWorker | null = null;

/** Arranca el worker del proceso si AUTOMATION_WORKER_ENABLED está activo. */
export function startAutomationWorker(): AutomationWorker | null {
  if (!env.AUTOMATION_WORKER_ENABLED) {
    logger.info("automation.worker.disabled (AUTOMATION_WORKER_ENABLED=false)");
    return null;
  }
  if (worker) return worker;
  worker = new AutomationWorker();
  worker.start();
  return worker;
}

export async function stopAutomationWorker(): Promise<void> {
  if (!worker) return;
  await worker.stop();
  worker = null;
}

export function getAutomationWorker(): AutomationWorker | null {
  return worker;
}
