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
  getUsageController,
  createCheckoutController,
  lemonSqueezyWebhookController,
} from "../controllers/billing.controller.js";

export const billingRoutes = Router();

// Webhook público (lo llama LemonSqueezy; se valida por firma HMAC, no por sesión)
billingRoutes.post("/lemonsqueezy/webhook", webhookRateLimit, lemonSqueezyWebhookController);

billingRoutes.use(requireAuth, requireTenantAccess);

billingRoutes.get("/plans", listPlansController);
billingRoutes.get("/subscription", getSubscriptionController);
billingRoutes.get("/usage", getUsageController);
billingRoutes.post(
  "/create-checkout",
  billingRateLimit,
  requireRole("OWNER", "ADMIN"),
  createCheckoutController
);
