import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  needsOnboarding,
  completeOnboarding,
} from "../services/onboarding.service.js";
import { invalidateSessionCache } from "../services/auth.service.js";
import { env } from "../config/env.js";
import { AppError } from "../middlewares/error.middleware.js";

const onboardingSchema = z.object({
  businessName: z.string().min(2, "Nombre del negocio requerido").max(120),
  industry: z.string().min(2, "Industria requerida").max(80),
  monthlyMessages: z.enum(["LT_500", "B_500_1500", "B_1500_5000", "GT_5000"]),
  phoneNumbers: z.coerce.number().int().min(1).max(100),
  usersNeeded: z.coerce.number().int().min(1).max(500),
  mainGoal: z.enum([
    "RESPONDER_CLIENTES",
    "CITAS",
    "COTIZACIONES",
    "SOPORTE",
    "VENTAS",
    "OTRO",
  ]),
  usesWhatsappBusiness: z.boolean(),
  needsHumanHandoff: z.boolean(),
});

export function onboardingStatusController(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    if (!req.user) throw new AppError("No autenticado", 401);
    res.json({ success: true, data: { needsOnboarding: needsOnboarding(req.user) } });
  } catch (err) {
    next(err);
  }
}

export async function completeOnboardingController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError("No autenticado", 401);

    const parsed = onboardingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Datos inválidos",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { tenant, tenantCreated } = await completeOnboarding(req.user, parsed.data);

    // El tenantId del usuario cambió: invalidar la sesión cacheada para que
    // /api/auth/me devuelva el tenant nuevo de inmediato.
    const token = req.cookies?.[env.SESSION_COOKIE_NAME];
    if (token && tenantCreated) {
      await invalidateSessionCache(token);
    }

    res.status(tenantCreated ? 201 : 200).json({
      success: true,
      data: {
        tenantId: tenant.id,
        tenantName: tenant.name,
        tenantCreated,
      },
    });
  } catch (err) {
    next(err);
  }
}
