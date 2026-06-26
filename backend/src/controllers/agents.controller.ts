import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  listAgents,
  getAgent,
  createAgent,
  updateAgent,
  disableAgent,
  setAgentStatus,
  createAgentSchema,
  updateAgentSchema,
  updateStatusSchema,
} from "../services/agents-crud.service.js";
import { testAgent } from "../services/ai/agent-test.service.js";
import { AppError } from "../middlewares/error.middleware.js";

const testAgentSchema = z.object({
  message: z.string().min(1, "El mensaje de prueba es requerido"),
  customerName: z.string().optional(),
  context: z.record(z.unknown()).optional(),
});

export async function listAgentsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.tenantId) throw new AppError("Empresa no identificada", 403);
    const agents = await listAgents(req.tenantId);
    res.json({ success: true, data: agents });
  } catch (err) {
    next(err);
  }
}

export async function getAgentController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.tenantId) throw new AppError("Empresa no identificada", 403);
    const agent = await getAgent(req.params.id, req.tenantId);
    res.json({ success: true, data: agent });
  } catch (err) {
    next(err);
  }
}

export async function createAgentController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.tenantId) throw new AppError("Empresa no identificada", 403);

    const parsed = createAgentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Datos inválidos",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const agent = await createAgent(req.tenantId, parsed.data);
    res.status(201).json({ success: true, data: agent });
  } catch (err) {
    next(err);
  }
}

export async function updateAgentController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.tenantId) throw new AppError("Empresa no identificada", 403);

    const parsed = updateAgentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Datos inválidos",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const agent = await updateAgent(req.params.id, req.tenantId, parsed.data);
    res.json({ success: true, data: agent });
  } catch (err) {
    next(err);
  }
}

export async function setAgentStatusController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.tenantId) throw new AppError("Empresa no identificada", 403);

    const parsed = updateStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Datos inválidos",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const agent = await setAgentStatus(req.params.id, req.tenantId, parsed.data.status);
    res.json({ success: true, data: agent });
  } catch (err) {
    next(err);
  }
}

export async function disableAgentController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.tenantId) throw new AppError("Empresa no identificada", 403);
    const agent = await disableAgent(req.params.id, req.tenantId);
    res.json({ success: true, data: agent });
  } catch (err) {
    next(err);
  }
}

export async function testAgentController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.tenantId) throw new AppError("Empresa no identificada", 403);

    const parsed = testAgentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Datos inválidos",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const result = await testAgent({
      agentId: req.params.id,
      tenantId: req.tenantId,
      message: parsed.data.message,
      customerName: parsed.data.customerName,
      context: parsed.data.context,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
