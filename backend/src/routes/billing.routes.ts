import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole, requireTenantAccess } from "../middlewares/roles.middleware.js";
import {
  billingRateLimit,
  webhookRateLimit,
} from "../middlewares/rate-limit.middleware.js";
import {
  listPlansController,
  getSubscriptionController,
  getBillingStatusController,
  getActivationStatusController,
  getUsageController,
  createCheckoutController,
  lemonSqueezyWebhookController,
} from "../controllers/billing.controller.js";

export const billingRoutes = Router();

// Webhook público (lo llama LemonSqueezy; se valida por firma HMAC, no por sesión)
billingRoutes.post("/lemonsqueezy/webhook", webhookRateLimit, lemonSqueezyWebhookController);

// Estado de activación comercial: requiere sesión pero NO tenant (usuarios
// recién registrados aún no tienen empresa y el gate del frontend lo necesita)
billingRoutes.get("/activation-status", requireAuth, getActivationStatusController);

billingRoutes.use(requireAuth, requireTenantAccess);

billingRoutes.get("/plans", listPlansController);
billingRoutes.get("/subscription", getSubscriptionController);
billingRoutes.get("/status", getBillingStatusController);
billingRoutes.get("/usage", getUsageController);
billingRoutes.post(
  "/create-checkout",
  billingRateLimit,
  requireRole("OWNER", "ADMIN"),
  createCheckoutController
);
