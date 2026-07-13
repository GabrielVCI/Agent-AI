import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as knowledge from "../services/knowledge.service.js";
import { AppError } from "../middlewares/error.middleware.js";

function tenantIdOf(req: Request): string {
  const tenantId = req.user?.tenantId;
  if (!tenantId) throw new AppError("Usuario no asociado a ninguna empresa", 403);
  return tenantId;
}

function invalid(res: Response, errors: Record<string, string[] | undefined>): void {
  res.status(400).json({ success: false, message: "Datos inválidos", errors });
}

const documentSchema = z.object({
  title: z.string().min(2, "Título requerido").max(150),
  contentText: z.string().min(10, "El contenido es muy corto").max(200_000),
  agentId: z.string().nullish(),
  fileName: z.string().max(120).nullish(),
  isActive: z.boolean().optional(),
});

export async function listDocumentsController(req: Request, res: Response, next: NextFunction) {
  try {
    const docs = await knowledge.listDocuments(tenantIdOf(req));
    res.json({ success: true, data: docs });
  } catch (err) {
    next(err);
  }
}

export async function createDocumentController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = documentSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error.flatten().fieldErrors);
    const doc = await knowledge.createDocument(tenantIdOf(req), req.user?.id, parsed.data);
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
}

export async function getDocumentController(req: Request, res: Response, next: NextFunction) {
  try {
    const doc = await knowledge.getDocument(tenantIdOf(req), req.params.id);
    res.json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
}

export async function updateDocumentController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = documentSchema.partial().safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error.flatten().fieldErrors);
    const doc = await knowledge.updateDocument(tenantIdOf(req), req.params.id, parsed.data);
    res.json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
}

export async function deleteDocumentController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await knowledge.deleteDocument(tenantIdOf(req), req.params.id);
    res.json({ success: true, data: result, message: "Documento eliminado" });
  } catch (err) {
    next(err);
  }
}
