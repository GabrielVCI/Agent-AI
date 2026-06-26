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

export const conversationRoutes = Router();

conversationRoutes.use(requireAuth, requireTenantAccess);

conversationRoutes.get("/", listConversationsController);
conversationRoutes.get("/:id", getConversationController);
conversationRoutes.get("/:id/messages", getConversationMessagesController);
conversationRoutes.post(
  "/:id/takeover",
  requireRole("OWNER", "ADMIN", "AGENT_OPERATOR"),
  takeoverConversationController
);
conversationRoutes.post(
  "/:id/release-to-agent",
  requireRole("OWNER", "ADMIN", "AGENT_OPERATOR"),
  releaseToAgentController
);
conversationRoutes.post(
  "/:id/reply",
  requireRole("OWNER", "ADMIN", "AGENT_OPERATOR"),
  replyToConversationController
);
conversationRoutes.post(
  "/:id/close",
  requireRole("OWNER", "ADMIN", "AGENT_OPERATOR"),
  closeConversationController
);
