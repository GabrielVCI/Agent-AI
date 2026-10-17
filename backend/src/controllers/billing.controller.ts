import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { AppError } from "../errors/AppError.js";
import { asyncHandler } from "../errors/async-handler.js";
import {
  getBillingOverview,
  getTenantBillingStatus,
  getTenantActivationState,
} from "../services/billing.service.js";
import { createCheckout } from "../services/billing/lemon-squeezy/lemonSqueezy.checkout.service.js";

function tenantIdOf(req: Request): string {
  const tenantId = req.user?.tenantId;
  if (!tenantId) throw AppError.fromCode("TENANT_REQUIRED");
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

/**
 * Estado de activación comercial (Parte F): lo consulta el gate del frontend
 * para decidir entre verificar-correo / implementación / paywall / dashboard.
 * Accesible SIN tenant (usuarios recién registrados) y para SUPER_ADMIN
 * (bypass explícito, nunca bloqueado).
 */
export async function getActivationStatusController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user) throw new AppError("No autenticado", 401);

    const noGateBase = {
      lifecycleStatus: null,
      implementationStatus: null,
      implementationFeePaid: false,
      implementationFeePaidAt: null,
      implementationStartedAt: null,
      implementationExpectedEndAt: null,
      finalActivationDate: null,
      firstMonthEndsAt: null,
      hasActiveSubscription: false,
      paywallBypassUntil: null,
      shouldShowPaywall: false,
      shouldShowImplementationScreen: false,
      // Ni SUPER_ADMIN ni un usuario sin empresa están bloqueados por pago:
      // a ninguno le aplica el paywall, así que tampoco hay nada "en confirmación".
      paymentConfirmationPending: false,
      accessState: "ALLOWED" as const,
    };

    if (req.user.role === "SUPER_ADMIN") {
      res.json({
        success: true,
        data: { ...noGateBase, emailVerified: true, reason: "SUPER_ADMIN" },
      });
      return;
    }

    // emailVerifiedAt vive en DB (la cache de sesión no lo trae): lectura fresca
    const dbUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { emailVerifiedAt: true },
    });
    const emailVerified = Boolean(dbUser?.emailVerifiedAt);

    if (!req.user.tenantId) {
      // Sin empresa todavía: el frontend decide entre verificar-correo y onboarding
      res.json({
        success: true,
        data: { ...noGateBase, emailVerified, reason: emailVerified ? "NO_TENANT" : "EMAIL_NOT_VERIFIED" },
      });
      return;
    }

    const state = await getTenantActivationState(req.user.tenantId, emailVerified);
    res.json({ success: true, data: state });
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

/**
 * Estado ligero para el paywall (RequireActiveSubscription): lo consulta el
 * frontend al montar rutas tenant y en polling post-checkout. SUPER_ADMIN no
 * llega aquí (no tiene tenant; su bypass vive en el guard del frontend).
 */
export async function getBillingStatusController(req: Request, res: Response, next: NextFunction) {
  try {
    const status = await getTenantBillingStatus(tenantIdOf(req));
    res.json({ success: true, data: status });
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

/**
 * Lo ÚNICO que el frontend puede elegir es el plan (por id interno; `planCode`
 * se acepta por compatibilidad con el contrato anterior).
 *
 * `.strict()` es deliberado: una request que intente colar `tenantId`,
 * `variantId`, `storeId` o `productId` se rechaza con 400 en vez de que esos
 * valores pasen inadvertidos. El tenant SIEMPRE sale de la sesión.
 */
const checkoutSchema = z
  .object({
    planId: z.string().min(1).optional(),
    planCode: z.enum(["BASIC", "PRO", "ENTERPRISE"]).optional(),
  })
  .strict()
  .refine((data) => Boolean(data.planId || data.planCode), {
    message: "Indica el plan que quieres activar.",
  });

/**
 * POST /api/billing/create-checkout
 * POST /api/billing/lemon-squeezy/checkout   (alias canónico)
 *
 * Devuelve SOLO la URL de checkout. Ni API key, ni store id, ni variante: el
 * navegador nunca ve configuración del proveedor.
 */
export const createCheckoutController = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.fromCode("UNAUTHENTICATED");
  const tenantId = tenantIdOf(req);

  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    throw AppError.fromCode("VALIDATION_ERROR", {
      message: "Indica un plan válido para continuar.",
      details: { fieldErrors: parsed.error.flatten().fieldErrors },
      internalMessage: `create-checkout con body inválido: ${JSON.stringify(
        parsed.error.flatten().fieldErrors
      )}`,
    });
  }

  const result = await createCheckout({
    tenantId,
    userId: req.user.id,
    userEmail: req.user.email,
    userName: req.user.name ?? undefined,
    ...(parsed.data.planId ? { planId: parsed.data.planId } : {}),
    ...(parsed.data.planCode ? { planCode: parsed.data.planCode } : {}),
  });

  res.json({
    success: true,
    data: {
      checkoutUrl: result.checkoutUrl,
      checkoutId: result.checkoutId,
      planId: result.planId,
    },
  });
});
