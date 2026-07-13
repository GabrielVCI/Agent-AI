import type { Request, Response, NextFunction } from "express";
import {
  getTenant,
  updateTenant,
  updateCompanySchema,
} from "../services/company.service.js";
import { AppError } from "../middlewares/error.middleware.js";

export async function getCompanyController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.tenantId) throw new AppError("Empresa no identificada", 403);
    const tenant = await getTenant(req.tenantId);
    res.json({ success: true, data: tenant });
  } catch (err) {
    next(err);
  }
}

export async function updateCompanyController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.tenantId) throw new AppError("Empresa no identificada", 403);

    const parsed = updateCompanySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Datos inválidos",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const tenant = await updateTenant(req.tenantId, parsed.data);
    res.json({ success: true, data: tenant });
  } catch (err) {
    next(err);
  }
}

/** Usuarios activos del tenant (para el selector "Asignar a" del inbox). */
export async function listCompanyUsersController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.tenantId) throw new AppError("Empresa no identificada", 403);
    const { prisma } = await import("../config/prisma.js");
    const users = await prisma.user.findMany({
      where: { tenantId: req.tenantId, status: { not: "DISABLED" } },
      select: { id: true, name: true, lastName: true, role: true },
      orderBy: { name: "asc" },
    });
    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
}
