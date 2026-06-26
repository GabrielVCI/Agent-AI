import { Router } from "express";
import { healthController } from "../controllers/health.controller.js";
import { whatsappRoutes } from "./whatsapp.routes.js";
import { productRoutes } from "./product.routes.js";
import { quoteRoutes } from "./quote.routes.js";
import { conversationRoutes } from "./conversation.routes.js";
import { authRoutes } from "./auth.routes.js";
import { companyRoutes } from "./company.routes.js";
import { agentsRoutes } from "./agents.routes.js";
import { dashboardRoutes } from "./dashboard.routes.js";
import { adminRoutes } from "./admin.routes.js";
import { accountRoutes } from "./account.routes.js";
import { settingsRoutes } from "./settings.routes.js";

export const router = Router();

router.get("/health", healthController);

// Public webhook (no auth required — Meta calls these)
router.use("/api/whatsapp", whatsappRoutes);

// Auth
router.use("/api/auth", authRoutes);

// Tenant-scoped API
router.use("/api/company", companyRoutes);
router.use("/api/agents", agentsRoutes);
router.use("/api/conversations", conversationRoutes);
router.use("/api/dashboard", dashboardRoutes);
router.use("/api/settings", settingsRoutes);
router.use("/api/account", accountRoutes);

// SUPER_ADMIN only
router.use("/api/admin", adminRoutes);

// Legacy / internal routes (kept for backward compat)
router.use("/api/products", productRoutes);
router.use("/api/quotes", quoteRoutes);
