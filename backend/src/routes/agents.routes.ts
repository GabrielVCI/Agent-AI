import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole, requireTenantAccess } from "../middlewares/roles.middleware.js";
import { checkPlanLimit } from "../middlewares/plan-limits.middleware.js";
import {
  listAgentsController,
  getAgentController,
  createAgentController,
  updateAgentController,
  setAgentStatusController,
  disableAgentController,
  testAgentController,
} from "../controllers/agents.controller.js";

export const agentsRoutes = Router();

agentsRoutes.use(requireAuth, requireTenantAccess);

agentsRoutes.get("/", listAgentsController);
agentsRoutes.get("/:id", getAgentController);
agentsRoutes.post(
  "/",
  requireRole("OWNER", "ADMIN"),
  checkPlanLimit("agents"),
  createAgentController
);
agentsRoutes.put("/:id", requireRole("OWNER", "ADMIN"), updateAgentController);
agentsRoutes.patch(
  "/:id/status",
  requireRole("OWNER", "ADMIN"),
  setAgentStatusController
);
agentsRoutes.post(
  "/:id/test",
  requireRole("OWNER", "ADMIN", "AGENT_OPERATOR"),
  testAgentController
);
agentsRoutes.delete("/:id", requireRole("OWNER", "ADMIN"), disableAgentController);
