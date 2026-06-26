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
} from "../services/settings.service.js";
import { AppError } from "../middlewares/error.middleware.js";
import { getAgent } from "../services/agents-crud.service.js";
import { updateAgent, updateAgentSchema } from "../services/agents-crud.service.js";

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
    if (!req.tenantId) throw new AppError("Empresa no identificada", 403);
    const agentId = req.query.agentId as string | undefined;
    if (!agentId) {
      res.status(400).json({ success: false, message: "agentId requerido como query param" });
      return;
    }
    const agent = await getAgent(agentId, req.tenantId);
    res.json({
      success: true,
      data: {
        agentId: agent.id,
        systemPrompt: agent.basePrompt,
        tone: agent.tone,
        openAiModel: agent.aiModel,
        allowHumanHandoff: agent.allowHumanIntervention,
      },
    });
  } catch (err) { next(err); }
}

export async function updateAgentTrainingController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.tenantId) throw new AppError("Empresa no identificada", 403);
    const agentId = req.query.agentId as string | undefined;
    if (!agentId) {
      res.status(400).json({ success: false, message: "agentId requerido como query param" });
      return;
    }
    const parsed = updateAgentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, errors: parsed.error.flatten().fieldErrors });
      return;
    }
    const agent = await updateAgent(agentId, req.tenantId, parsed.data);
    res.json({ success: true, data: agent });
  } catch (err) { next(err); }
}
