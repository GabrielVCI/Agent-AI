import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireTenantAccess, requireRole } from "../middlewares/roles.middleware.js";
import {
  listConversationsController,
  getConversationController,
  getConversationMessagesController,
  takeoverConversationController,
  releaseToAgentController,
  replyToConversationController,
  closeConversationController,
} from "../controllers/conversation.controller.js";
import {
  listLabelsController,
  createLabelController,
  updateLabelController,
  deleteLabelController,
  attachLabelController,
  detachLabelController,
  assignConversationController,
  unassignConversationController,
  conversationProfileController,
  updateContactController,
} from "../controllers/inbox.controller.js";

export const conversationRoutes = Router();

conversationRoutes.use(requireAuth, requireTenantAccess);

const canOperate = requireRole("OWNER", "ADMIN", "AGENT_OPERATOR");
const canManage = requireRole("OWNER", "ADMIN");

// Etiquetas del tenant (rutas específicas ANTES de /:id)
conversationRoutes.get("/labels", listLabelsController);
conversationRoutes.post("/labels", canOperate, createLabelController);
conversationRoutes.put("/labels/:id", canManage, updateLabelController);
conversationRoutes.delete("/labels/:id", canManage, deleteLabelController);

conversationRoutes.get("/", listConversationsController);
conversationRoutes.get("/:id", getConversationController);
conversationRoutes.get("/:id/messages", getConversationMessagesController);
conversationRoutes.get("/:id/profile", conversationProfileController);
conversationRoutes.put("/:id/contact", canOperate, updateContactController);

conversationRoutes.post("/:id/labels", canOperate, attachLabelController);
conversationRoutes.delete("/:id/labels/:labelId", canOperate, detachLabelController);

conversationRoutes.post("/:id/assign", canOperate, assignConversationController);
conversationRoutes.post("/:id/unassign", canOperate, unassignConversationController);

conversationRoutes.post("/:id/takeover", canOperate, takeoverConversationController);
conversationRoutes.post("/:id/release-to-agent", canOperate, releaseToAgentController);
conversationRoutes.post("/:id/reply", canOperate, replyToConversationController);
conversationRoutes.post("/:id/close", canOperate, closeConversationController);
