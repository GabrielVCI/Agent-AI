import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole, requireTenantAccess } from "../middlewares/roles.middleware.js";
import {
  listIntegrationsController,
  createIntegrationController,
  updateIntegrationController,
  listKnowledgeDocsController,
  createKnowledgeDocController,
  deleteKnowledgeDocController,
  getAgentTrainingController,
  updateAgentTrainingController,
} from "../controllers/settings.controller.js";

export const settingsRoutes = Router();

settingsRoutes.use(requireAuth, requireTenantAccess);

settingsRoutes.get("/integrations", listIntegrationsController);
settingsRoutes.post("/integrations", requireRole("OWNER", "ADMIN"), createIntegrationController);
settingsRoutes.put("/integrations/:id", requireRole("OWNER", "ADMIN"), updateIntegrationController);

settingsRoutes.get("/knowledge-documents", listKnowledgeDocsController);
settingsRoutes.post("/knowledge-documents", requireRole("OWNER", "ADMIN"), createKnowledgeDocController);
settingsRoutes.delete("/knowledge-documents/:id", requireRole("OWNER", "ADMIN"), deleteKnowledgeDocController);

settingsRoutes.get("/agent-training", getAgentTrainingController);
settingsRoutes.put("/agent-training", requireRole("OWNER", "ADMIN"), updateAgentTrainingController);
