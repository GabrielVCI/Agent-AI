import { Router } from "express";
import {
  getConversationController,
  listConversationsController
} from "../controllers/conversation.controller.js";

export const conversationRoutes = Router();

conversationRoutes.get("/", listConversationsController);
conversationRoutes.get("/:id", getConversationController);