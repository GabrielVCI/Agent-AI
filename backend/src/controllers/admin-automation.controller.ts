/**
 * Endpoints operativos del motor de automatizaciones para SUPER_ADMIN.
 *
 * Viven en el patrón administrativo existente (/api/admin, requireSuperAdmin)
 * y NO se mezclan con los endpoints de tenant. A diferencia de aquellos,
 * pueden consultar la cola completa de la plataforma o acotarla a un tenant
 * concreto vía ?tenantId=.
 */
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { AppError } from "../errors/AppError.js";
import {
  cancelJobById,
  getAutomationHealth,
  serializeJob,
} from "../services/automation/automation-jobs.service.js";
import { getAutomationWorker } from "../services/automation/automation-worker.js";
import { logger } from "../config/logger.js";

function invalid(res: Response, errors: Record<string, string[] | undefined>): void {
  res.status(400).json({ success: false, message: "Datos inválidos", errors });
}

const listQuerySchema = z.object({
  tenantId: z.string().max(40).optional(),
  status: z
    .enum([
      "PENDING",
      "SCHEDULED",
      "PROCESSING",
      "COMPLETED",
      "FAILED",
      "CANCELLED",
      "RETRY_PENDING",
    ])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** Salud del motor: cola, último fallo y estado del worker de ESTA instancia. */
export async function adminAutomationHealthController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : undefined;
    const health = await getAutomationHealth(tenantId);
    const worker = getAutomationWorker();

    res.json({
      success: true,
      data: {
        ...health,
        worker: {
          // Con varias instancias, esto describe la instancia que respondió.
          enabledInThisInstance: Boolean(worker),
          workerId: worker?.id ?? null,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

/** Jobs de la plataforma (por defecto los fallidos, que es lo operativo). */
export async function adminListAutomationJobsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) return invalid(res, parsed.error.flatten().fieldErrors);
    const { tenantId, status, page, limit } = parsed.data;

    const where: Prisma.AutomationJobWhereInput = {
      ...(tenantId ? { tenantId } : {}),
      status: status ?? "FAILED",
    };

    const [rows, total] = await Promise.all([
      prisma.automationJob.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          rule: { select: { id: true, name: true } },
          tenant: { select: { id: true, name: true } },
        },
      }),
      prisma.automationJob.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        items: rows.map((row) => ({
          ...serializeJob(row),
          tenant: row.tenant,
        })),
        total,
        page,
        limit,
        pages: Math.max(1, Math.ceil(total / limit)),
        filters: { tenantId: tenantId ?? null, status: status ?? "FAILED" },
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Reintento manual de un job fallido: lo devuelve a la cola con la fecha de
 * ahora y un intento extra de presupuesto. No ejecuta nada en la request: lo
 * recoge el worker (misma ruta que cualquier otro job).
 */
export async function adminRetryAutomationJobController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const job = await prisma.automationJob.findUnique({ where: { id: req.params.id } });
    if (!job) {
      throw AppError.fromCode("RESOURCE_NOT_FOUND", { message: "No encontramos ese job" });
    }
    if (job.status === "PROCESSING") {
      throw new AppError("El job se está ejecutando en este momento", 409, { code: "CONFLICT" });
    }
    if (job.status === "COMPLETED") {
      throw new AppError("El job ya se completó", 409, { code: "CONFLICT" });
    }

    const updated = await prisma.automationJob.update({
      where: { id: job.id },
      data: {
        status: "RETRY_PENDING",
        scheduledFor: new Date(),
        maxAttempts: Math.max(job.maxAttempts, job.attemptCount + 1),
        lockedAt: null,
        lockedBy: null,
        failedAt: null,
        cancelledAt: null,
        cancelReason: null,
      },
    });

    logger.warn(
      `automation.job.manual_retry adminId=${req.user?.id ?? "?"} tenantId=${job.tenantId} jobId=${job.id}`
    );
    res.json({ success: true, data: serializeJob(updated), message: "Job reencolado" });
  } catch (err) {
    next(err);
  }
}

/** Cancelación manual de un job (soporte/operación). */
export async function adminCancelAutomationJobController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const job = await prisma.automationJob.findUnique({
      where: { id: req.params.id },
      select: { id: true, tenantId: true },
    });
    if (!job) {
      throw AppError.fromCode("RESOURCE_NOT_FOUND", { message: "No encontramos ese job" });
    }

    const cancelled = await cancelJobById({
      tenantId: job.tenantId,
      jobId: job.id,
      reason: `Cancelado por SUPER_ADMIN (${req.user?.id ?? "?"})`,
    });
    if (!cancelled) {
      throw new AppError("Ese job ya no se puede cancelar", 409, { code: "CONFLICT" });
    }
    res.json({ success: true, message: "Job cancelado" });
  } catch (err) {
    next(err);
  }
}
