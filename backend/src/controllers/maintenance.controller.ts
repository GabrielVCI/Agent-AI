/**
 * API del cronograma de mantenimiento (Módulo 4) — /api/maintenance.
 *
 * El tenant sale SIEMPRE de la sesión (cookie httpOnly `sid`). Todo el filtrado
 * y la paginación ocurren en PostgreSQL: el navegador nunca recibe el historial
 * completo para recortarlo por su cuenta.
 */
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { AppError } from "../errors/AppError.js";
import * as maintenance from "../services/appointment/maintenance.service.js";

function tenantIdOf(req: Request): string {
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    throw AppError.fromCode("TENANT_REQUIRED", {
      internalMessage: `usuario ${req.user?.id ?? "anónimo"} sin tenantId en /api/maintenance`,
    });
  }
  return tenantId;
}

function invalid(res: Response, errors: Record<string, string[] | undefined>): void {
  res.status(400).json({
    success: false,
    message: "Revisa los datos ingresados.",
    error: { code: "VALIDATION_ERROR", message: "Revisa los datos ingresados." },
    errors,
  });
}

const scheduleQuerySchema = z.object({
  serviceId: z.string().trim().max(40).optional(),
  status: z.enum(["OVERDUE", "DUE_TODAY", "UPCOMING"]).optional(),
  overdueMinDays: z.coerce.number().int().min(1).max(3650).optional(),
  search: z.string().max(120).optional(),
  includeScheduled: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((value) => value === true || value === "true")
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function maintenanceScheduleController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed = scheduleQuerySchema.safeParse(req.query);
    if (!parsed.success) return invalid(res, parsed.error.flatten().fieldErrors);
    const data = await maintenance.listMaintenanceSchedule(tenantIdOf(req), parsed.data);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function maintenanceCountersController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const data = await maintenance.getMaintenanceCounters(tenantIdOf(req));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function maintenanceServicesController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const data = await maintenance.listMaintenanceServices(tenantIdOf(req));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
