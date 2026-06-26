import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  listTenants,
  getTenantById,
  createTenantWithOwner,
  suspendTenant,
  reactivateTenant,
  cancelTenant,
  assignPlanToTenant,
  createUserForTenant,
  listCancellationRequests,
  processCancellationRequest,
  createTenantSchema,
  assignPlanSchema,
} from "../services/admin.service.js";

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["ADMIN", "AGENT_OPERATOR", "BILLING"]),
});

export async function listTenantsController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const result = await listTenants(page, limit);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

export async function getTenantController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenant = await getTenantById(req.params.id);
    res.json({ success: true, data: tenant });
  } catch (err) { next(err); }
}

export async function createTenantController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = createTenantSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: "Datos inválidos", errors: parsed.error.flatten().fieldErrors });
      return;
    }
    const result = await createTenantWithOwner(parsed.data);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function suspendTenantController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await suspendTenant(req.params.id);
    res.json({ success: true, message: "Empresa suspendida" });
  } catch (err) { next(err); }
}

export async function reactivateTenantController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await reactivateTenant(req.params.id);
    res.json({ success: true, message: "Empresa reactivada" });
  } catch (err) { next(err); }
}

export async function cancelTenantController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await cancelTenant(req.params.id);
    res.json({ success: true, message: "Empresa cancelada" });
  } catch (err) { next(err); }
}

export async function assignPlanController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = assignPlanSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, errors: parsed.error.flatten().fieldErrors });
      return;
    }
    const sub = await assignPlanToTenant(req.params.id, parsed.data.planId);
    res.json({ success: true, data: sub });
  } catch (err) { next(err); }
}

export async function createUserController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, errors: parsed.error.flatten().fieldErrors });
      return;
    }
    const user = await createUserForTenant({ tenantId: req.params.id, ...parsed.data });
    res.status(201).json({ success: true, data: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) { next(err); }
}

export async function listCancellationRequestsController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const status = req.query.status as string | undefined;
    const requests = await listCancellationRequests(status);
    res.json({ success: true, data: requests });
  } catch (err) { next(err); }
}

export function processCancellationController(
  action: "approve" | "reject" | "complete"
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await processCancellationRequest(req.params.id, action, req.body.adminNotes);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  };
}
