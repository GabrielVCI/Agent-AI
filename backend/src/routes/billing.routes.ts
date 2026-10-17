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
} from "../controllers/billing.controller.js";
import { lemonSqueezyWebhookController } from "../controllers/lemon-squeezy-webhook.controller.js";

export const billingRoutes = Router();

// Webhook público (lo llama LemonSqueezy; se valida por firma HMAC, no por sesión).
// Ruta HISTÓRICA: es la que ya está registrada en el panel de LemonSqueezy y no
// se puede cambiar sin reconfigurar la tienda. La canónica es
// POST /api/webhooks/lemon-squeezy y comparte exactamente el mismo controller.
billingRoutes.post("/lemonsqueezy/webhook", webhookRateLimit, lemonSqueezyWebhookController);

// Estado de activación comercial: requiere sesión pero NO tenant (usuarios
// recién registrados aún no tienen empresa y el gate del frontend lo necesita)
billingRoutes.get("/activation-status", requireAuth, getActivationStatusController);

billingRoutes.use(requireAuth, requireTenantAccess);

billingRoutes.get("/plans", listPlansController);
billingRoutes.get("/subscription", getSubscriptionController);
billingRoutes.get("/status", getBillingStatusController);
billingRoutes.get("/usage", getUsageController);
// Checkout: dos rutas, un solo controller. `/create-checkout` es el contrato
// que ya consume el panel; `/lemon-squeezy/checkout` es el nombre canónico.
billingRoutes.post(
  "/create-checkout",
  billingRateLimit,
  requireRole("OWNER", "ADMIN"),
  createCheckoutController
);
billingRoutes.post(
  "/lemon-squeezy/checkout",
  billingRateLimit,
  requireRole("OWNER", "ADMIN"),
  createCheckoutController
);
