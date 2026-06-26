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
