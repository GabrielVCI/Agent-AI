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
import { catalogRoutes } from "./catalog.routes.js";
import { onboardingRoutes } from "./onboarding.routes.js";
import { appointmentRoutes } from "./appointment.routes.js";
import { knowledgeRoutes } from "./knowledge.routes.js";
import { billingRoutes } from "./billing.routes.js";
import { webhookRoutes } from "./webhooks.routes.js";
import { voiceRoutes } from "./voice.routes.js";
import { integrationsRoutes } from "./integrations.routes.js";
import { supportRoutes } from "./support.routes.js";
import { automationRoutes } from "./automation.routes.js";
import { customerRoutes } from "./customer.routes.js";
import { customerCategoryRoutes } from "./customer-category.routes.js";
import { maintenanceRoutes } from "./maintenance.routes.js";

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
router.use("/api/catalog", catalogRoutes);
router.use("/api/onboarding", onboardingRoutes);
router.use("/api/appointments", appointmentRoutes);
router.use("/api/knowledge", knowledgeRoutes);
router.use("/api/billing", billingRoutes);
// Webhooks de proveedores externos (autenticados por firma, no por sesión)
router.use("/api/webhooks", webhookRoutes);
router.use("/api/voice", voiceRoutes);
router.use("/api/integrations", integrationsRoutes);
router.use("/api/support", supportRoutes);
router.use("/api/automations", automationRoutes);
router.use("/api/customers", customerRoutes);
router.use("/api/customer-categories", customerCategoryRoutes);
router.use("/api/maintenance", maintenanceRoutes);

// SUPER_ADMIN only
router.use("/api/admin", adminRoutes);

// Legacy / internal routes (kept for backward compat)
router.use("/api/products", productRoutes);
router.use("/api/quotes", quoteRoutes);
