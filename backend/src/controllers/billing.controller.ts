import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { AppError } from "../middlewares/error.middleware.js";
import { getBillingOverview } from "../services/billing.service.js";
import {
  createCheckout,
  verifyWebhookSignature,
  handleWebhookEvent,
} from "../services/lemonsqueezy.service.js";

function tenantIdOf(req: Request): string {
  const tenantId = req.user?.tenantId;
  if (!tenantId) throw new AppError("Usuario no asociado a ninguna empresa", 403);
  return tenantId;
}

/** Catálogo público de planes activos (sin variantIds ni datos internos). */
export async function listPlansController(_req: Request, res: Response, next: NextFunction) {
  try {
    const plans = await prisma.plan.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { priceMonthly: "asc" }],
    });
    res.json({
      success: true,
      data: plans.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        description: p.description,
        priceMonthly: Number(p.priceMonthly.toString()),
        currency: p.currency,
        setupFee: p.setupFee ? Number(p.setupFee.toString()) : null,
        setupFeeLabel: p.setupFeeLabel,
        estimatedMessagesMin: p.estimatedMessagesMin,
        monthlyMessageLimit: p.monthlyMessageLimit,
        maxAgents: p.maxAgents,
        maxUsers: p.maxUsers,
        maxWhatsappNumbers: p.maxWhatsappNumbers,
        features: Array.isArray(p.featuresJson) ? p.featuresJson : [],
        isPopular: p.isPopular,
        sortOrder: p.sortOrder,
      })),
    });
  } catch (err) {
    next(err);
  }
}

export async function getSubscriptionController(req: Request, res: Response, next: NextFunction) {
  try {
    const overview = await getBillingOverview(tenantIdOf(req));
    res.json({ success: true, data: { plan: overview.plan, subscription: overview.subscription } });
  } catch (err) {
    next(err);
  }
}

export async function getUsageController(req: Request, res: Response, next: NextFunction) {
  try {
    const overview = await getBillingOverview(tenantIdOf(req));
    res.json({ success: true, data: overview });
  } catch (err) {
    next(err);
  }
}

const checkoutSchema = z.object({
  planCode: z.enum(["BASIC", "PRO", "ENTERPRISE"]),
});

export async function createCheckoutController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError("No autenticado", 401);
    const tenantId = tenantIdOf(req);

    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "planCode inválido (BASIC, PRO o ENTERPRISE)",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { checkoutUrl } = await createCheckout({
      tenantId,
      planCode: parsed.data.planCode,
      userEmail: req.user.email,
    });

    res.json({ success: true, data: { checkoutUrl } });
  } catch (err) {
    next(err);
  }
}

/**
 * Webhook de LemonSqueezy. Sin auth de sesión (lo llama LemonSqueezy); la
 * autenticidad se valida con la firma HMAC del cuerpo crudo (X-Signature).
 */
export async function lemonSqueezyWebhookController(req: Request, res: Response) {
  try {
    if (!env.LEMONSQUEEZY_WEBHOOK_SECRET) {
      logger.warn("[LEMONSQUEEZY] webhook recibido pero LEMONSQUEEZY_WEBHOOK_SECRET no está configurado");
      res.status(503).json({ success: false, message: "Webhook secret not configured" });
      return;
    }

    const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
    const signature = req.headers["x-signature"] as string | undefined;

    if (!rawBody || !verifyWebhookSignature(rawBody, signature)) {
      logger.warn("[LEMONSQUEEZY] firma de webhook inválida");
      res.status(401).json({ success: false, message: "Invalid signature" });
      return;
    }

    const result = await handleWebhookEvent(req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    // Nunca 5xx en cascada hacia LemonSqueezy por errores propios recuperables:
    // se loguea y se responde 200 para evitar reintentos infinitos, salvo fallo real.
    logger.error(`[LEMONSQUEEZY] error procesando webhook: ${String(err)}`);
    res.status(500).json({ success: false, message: "Webhook processing error" });
  }
}
