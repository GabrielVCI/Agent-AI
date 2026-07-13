import type { Request, Response, NextFunction } from "express";
import {
  listIntegrations,
  createIntegration,
  updateIntegration,
  listKnowledgeDocuments,
  createKnowledgeDocument,
  deleteKnowledgeDocument,
  createIntegrationSchema,
  updateIntegrationSchema,
  getTenantTraining,
  updateTenantTraining,
  trainingConfigSchema,
} from "../services/settings.service.js";
import { AppError } from "../middlewares/error.middleware.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

export async function listIntegrationsController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.tenantId) throw new AppError("Empresa no identificada", 403);
    const integrations = await listIntegrations(req.tenantId);
    res.json({ success: true, data: integrations });
  } catch (err) { next(err); }
}

export async function createIntegrationController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.tenantId) throw new AppError("Empresa no identificada", 403);
    const parsed = createIntegrationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, errors: parsed.error.flatten().fieldErrors });
      return;
    }
    const integration = await createIntegration(req.tenantId, parsed.data);
    res.status(201).json({ success: true, data: integration });
  } catch (err) { next(err); }
}

export async function updateIntegrationController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.tenantId) throw new AppError("Empresa no identificada", 403);
    const parsed = updateIntegrationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, errors: parsed.error.flatten().fieldErrors });
      return;
    }
    const integration = await updateIntegration(req.params.id, req.tenantId, parsed.data);
    res.json({ success: true, data: integration });
  } catch (err) { next(err); }
}

export async function listKnowledgeDocsController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.tenantId) throw new AppError("Empresa no identificada", 403);
    const docs = await listKnowledgeDocuments(req.tenantId);
    res.json({ success: true, data: docs });
  } catch (err) { next(err); }
}

export async function createKnowledgeDocController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.tenantId) throw new AppError("Empresa no identificada", 403);
    const { title, fileName, fileType, fileUrl } = req.body;
    if (!title || !fileName || !fileType || !fileUrl) {
      res.status(400).json({ success: false, message: "title, fileName, fileType y fileUrl son requeridos" });
      return;
    }
    const doc = await createKnowledgeDocument({
      tenantId: req.tenantId,
      userId: req.user?.id,
      title,
      fileName,
      fileType,
      fileUrl,
    });
    res.status(201).json({ success: true, data: doc });
  } catch (err) { next(err); }
}

export async function deleteKnowledgeDocController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.tenantId) throw new AppError("Empresa no identificada", 403);
    await deleteKnowledgeDocument(req.params.id, req.tenantId);
    res.json({ success: true, message: "Documento eliminado" });
  } catch (err) { next(err); }
}

export async function getAgentTrainingController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // SUPER_ADMIN sin tenant seleccionado no tiene contexto de negocio que cargar.
    if (!req.tenantId) throw new AppError("Empresa no identificada", 403);
    if (env.NODE_ENV === "development") logger.info("[AGENT TRAINING] loading config");

    const data = await getTenantTraining(req.tenantId);

    if (env.NODE_ENV === "development") {
      logger.info(`[AGENT TRAINING] config loaded for tenant ${req.tenantId}`);
    }
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function updateAgentTrainingController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.tenantId) throw new AppError("Empresa no identificada", 403);

    const parsed = trainingConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, errors: parsed.error.flatten().fieldErrors });
      return;
    }

    if (env.NODE_ENV === "development") logger.info("[AGENT TRAINING] saving config");

    const data = await updateTenantTraining(req.tenantId, parsed.data);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}
