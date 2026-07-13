import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole, requireTenantAccess } from "../middlewares/roles.middleware.js";
import { uploadRateLimit } from "../middlewares/rate-limit.middleware.js";
import {
  listDocumentsController,
  createDocumentController,
  getDocumentController,
  updateDocumentController,
  deleteDocumentController,
} from "../controllers/knowledge.controller.js";

export const knowledgeRoutes = Router();

knowledgeRoutes.use(requireAuth, requireTenantAccess);

const canManage = requireRole("OWNER", "ADMIN");

knowledgeRoutes.get("/documents", listDocumentsController);
knowledgeRoutes.post("/documents", uploadRateLimit, canManage, createDocumentController);
knowledgeRoutes.get("/documents/:id", getDocumentController);
knowledgeRoutes.put("/documents/:id", uploadRateLimit, canManage, updateDocumentController);
knowledgeRoutes.delete("/documents/:id", canManage, deleteDocumentController);
