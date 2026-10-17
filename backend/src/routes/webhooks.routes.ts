import { Router } from "express";

import { lemonSqueezyWebhookController } from "../controllers/lemon-squeezy-webhook.controller.js";
import { webhookRateLimit } from "../middlewares/rate-limit.middleware.js";

/**
 * Webhooks entrantes de proveedores externos.
 *
 * NO llevan sesión `sid`: cada uno se autentica con la firma de su proveedor.
 * Van bajo /api para heredar el rate limit global, y además el limiter de
 * webhooks (por IP, con cupo alto).
 */
export const webhookRoutes = Router();

// Ruta canónica del webhook de LemonSqueezy. La ruta histórica
// (/api/billing/lemonsqueezy/webhook) sigue viva y apunta al mismo controller:
// cambiarla rompería las tiendas ya configuradas en el panel de LemonSqueezy.
webhookRoutes.post("/lemon-squeezy", webhookRateLimit, lemonSqueezyWebhookController);
