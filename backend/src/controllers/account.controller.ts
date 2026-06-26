import type { Request, Response, NextFunction } from "express";
import {
  getAccountPlan,
  createCancellationRequest,
  cancellationRequestSchema,
} from "../services/account.service.js";
import { AppError } from "../middlewares/error.middleware.js";

export async function getPlanController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.tenantId) throw new AppError("Empresa no identificada", 403);
    const plan = await getAccountPlan(req.tenantId);
    res.json({ success: true, data: plan });
  } catch (err) { next(err); }
}

export async function getInvoicesController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Placeholder: invoicing system to be integrated with payment provider
    res.json({ success: true, data: [], message: "Integración de facturación pendiente" });
  } catch (err) { next(err); }
}

export async function cancellationRequestController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.tenantId || !req.user) throw new AppError("No autenticado", 401);

    const parsed = cancellationRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, errors: parsed.error.flatten().fieldErrors });
      return;
    }

    const result = await createCancellationRequest({
      tenantId: req.tenantId,
      userId: req.user.id,
      reason: parsed.data.reason,
    });

    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
}
