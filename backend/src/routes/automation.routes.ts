import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole, requireTenantAccess } from "../middlewares/roles.middleware.js";
import {
  archiveRuleController,
  cancelJobController,
  createRuleController,
  getAutomationCatalogController,
  getAutomationHealthController,
  getRuleController,
  listExecutionsController,
  listJobsController,
  listRulesController,
  updateRuleController,
  useTemplateController,
} from "../controllers/automation.controller.js";

export const automationRoutes = Router();

// Todas las rutas son de tenant: sesión obligatoria + tenant resuelto de ella.
automationRoutes.use(requireAuth, requireTenantAccess);

const canManage = requireRole("OWNER", "ADMIN");

// Rutas específicas ANTES de /rules/:id
automationRoutes.get("/catalog", getAutomationCatalogController);
automationRoutes.get("/health", getAutomationHealthController);
automationRoutes.get("/jobs", listJobsController);
automationRoutes.post("/jobs/:id/cancel", canManage, cancelJobController);
automationRoutes.get("/executions", listExecutionsController);

automationRoutes.get("/rules", listRulesController);
automationRoutes.post("/rules", canManage, createRuleController);
automationRoutes.post("/rules/from-template", canManage, useTemplateController);
automationRoutes.get("/rules/:id", getRuleController);
automationRoutes.patch("/rules/:id", canManage, updateRuleController);
automationRoutes.delete("/rules/:id", canManage, archiveRuleController);
