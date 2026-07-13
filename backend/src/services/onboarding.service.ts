import { prisma } from "../config/prisma.js";
import { AppError } from "../middlewares/error.middleware.js";
import type { AuthenticatedUser } from "../types/auth.types.js";

export interface OnboardingData {
  businessName: string;
  industry: string;
  monthlyMessages: "LT_500" | "B_500_1500" | "B_1500_5000" | "GT_5000";
  phoneNumbers: number;
  usersNeeded: number;
  mainGoal: "RESPONDER_CLIENTES" | "CITAS" | "COTIZACIONES" | "SOPORTE" | "VENTAS" | "OTRO";
  usesWhatsappBusiness: boolean;
  needsHumanHandoff: boolean;
}

/**
 * Solo los usuarios registrados por self-service (sin tenant) necesitan
 * onboarding. Los tenants existentes creados por el admin no se ven afectados.
 */
export function needsOnboarding(user: AuthenticatedUser): boolean {
  return user.role !== "SUPER_ADMIN" && !user.tenantId;
}

export async function completeOnboarding(user: AuthenticatedUser, data: OnboardingData) {
  if (user.role === "SUPER_ADMIN") {
    throw new AppError("El SUPER_ADMIN no requiere onboarding", 400);
  }

  const onboardingJson = { ...data, completedByUserId: user.id };

  // Usuario ya asociado a una empresa: solo guardar las respuestas.
  if (user.tenantId) {
    const tenant = await prisma.tenant.update({
      where: { id: user.tenantId },
      data: {
        onboarding: onboardingJson,
        onboardingCompletedAt: new Date(),
        industry: data.industry,
      },
    });
    return { tenant, tenantCreated: false };
  }

  // Self-service: crear empresa, asociar como OWNER y abrir trial con el plan base.
  const basePlan = await prisma.plan.findFirst({
    where: { isActive: true },
    orderBy: { priceMonthly: "asc" },
  });

  const now = new Date();
  const trialEnd = new Date(now);
  trialEnd.setDate(trialEnd.getDate() + 14);

  const tenant = await prisma.$transaction(async (tx) => {
    const created = await tx.tenant.create({
      data: {
        name: data.businessName,
        industry: data.industry,
        status: "ACTIVE",
        onboarding: onboardingJson,
        onboardingCompletedAt: now,
      },
    });

    await tx.user.update({
      where: { id: user.id },
      data: { tenantId: created.id, role: "OWNER" },
    });

    if (basePlan) {
      await tx.subscription.create({
        data: {
          tenantId: created.id,
          planId: basePlan.id,
          status: "TRIALING",
          currentPeriodStart: now,
          currentPeriodEnd: trialEnd,
        },
      });
    }

    return created;
  });

  return { tenant, tenantCreated: true };
}
