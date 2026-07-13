import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { AppError } from "../middlewares/error.middleware.js";
import { hashPassword } from "./auth.service.js";
import { getCurrentPeriod } from "./billing.service.js";
import { logger } from "../config/logger.js";

const customFieldsSchema = {
  customPlanName: z.string().max(80).nullish(),
  customMonthlyPrice: z.coerce.number().min(0).nullish(),
  customSetupFee: z.coerce.number().min(0).nullish(),
  customMonthlyMessageLimit: z.coerce.number().int().min(100).nullish(),
  customMonthlyTokenLimit: z.coerce.number().int().min(1000).nullish(),
  customMaxUsers: z.coerce.number().int().min(1).nullish(),
  customMaxAgents: z.coerce.number().int().min(1).nullish(),
  customMaxWhatsappNumbers: z.coerce.number().int().min(1).nullish(),
};

export const createTenantSchema = z
  .object({
    companyName: z.string().min(2, "Nombre de empresa requerido"),
    industry: z.string().optional(),
    legalName: z.string().optional(),
    rnc: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    address: z.string().optional(),
    timezone: z.string().default("America/Santo_Domingo"),
    // Owner
    ownerFirstName: z.string().min(2, "Nombre del owner requerido"),
    ownerLastName: z.string().max(80).optional(),
    ownerEmail: z.string().email("Email del owner inválido"),
    // Sin contraseña => se genera una temporal y se devuelve UNA vez
    ownerPassword: z.string().min(8, "Contraseña mínima 8 caracteres").optional(),
    sendInviteEmail: z.boolean().optional(),
    // Plan
    planCode: z.enum(["BASIC", "PRO", "ENTERPRISE"]).optional(),
    planId: z.string().optional(),
    billingMode: z.enum(["MANUAL", "LEMONSQUEEZY", "FREE", "CUSTOM"]).default("MANUAL"),
    subscriptionStatus: z.enum(["ACTIVE", "TRIALING"]).default("ACTIVE"),
    paymentStatus: z.enum(["NOT_REQUIRED", "PENDING", "PAID", "OVERDUE"]).optional(),
    internalNotes: z.string().max(4000).nullish(),
    ...customFieldsSchema,
  })
  .refine((d) => d.planCode || d.planId, {
    message: "Selecciona un plan (planCode o planId)",
    path: ["planCode"],
  })
  .refine(
    (d) =>
      d.billingMode !== "CUSTOM" ||
      (d.customMonthlyPrice != null && d.customMonthlyMessageLimit != null),
    {
      message: "Un plan personalizado requiere mensualidad y límite de mensajes",
      path: ["customMonthlyPrice"],
    }
  );

export const updateTenantSchema = z.object({
  name: z.string().min(2).optional(),
  industry: z.string().nullish(),
  legalName: z.string().nullish(),
  phone: z.string().nullish(),
  email: z.string().email().nullish().or(z.literal("").transform(() => null)),
  address: z.string().nullish(),
  internalNotes: z.string().max(4000).nullish(),
});

export const updateSubscriptionSchema = z.object({
  planCode: z.enum(["BASIC", "PRO", "ENTERPRISE"]).optional(),
  planId: z.string().optional(),
  billingMode: z.enum(["MANUAL", "LEMONSQUEEZY", "FREE", "CUSTOM"]).optional(),
  paymentStatus: z.enum(["NOT_REQUIRED", "PENDING", "PAID", "OVERDUE"]).optional(),
  status: z.enum(["TRIALING", "ACTIVE", "PAST_DUE", "CANCELLED", "EXPIRED"]).optional(),
  nextBillingDate: z.coerce.date().nullish(),
  ...customFieldsSchema,
});

export const assignPlanSchema = z.object({
  planId: z.string().min(1),
  // Overrides por tenant (Enterprise negociado); null los limpia
  customMonthlyMessageLimit: z.coerce.number().int().min(100).nullish(),
  customMonthlyTokenLimit: z.coerce.number().int().min(1000).nullish(),
});

export async function listTenants(page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  const [tenants, total] = await Promise.all([
    prisma.tenant.findMany({
      include: { subscription: { include: { plan: true } }, _count: { select: { users: true, agents: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.tenant.count(),
  ]);

  // Uso del mes calendario actual (una sola consulta para toda la página)
  const { start } = getCurrentPeriod();
  const counters = await prisma.usageCounter.findMany({
    where: { periodStart: start, tenantId: { in: tenants.map((t) => t.id) } },
  });
  const byTenant = new Map(counters.map((c) => [c.tenantId, c]));

  const enriched = tenants.map((t) => {
    const counter = byTenant.get(t.id);
    const sub = t.subscription;
    // Límite/precio EFECTIVOS: override negociado > plan base
    const messageLimit =
      sub?.customMonthlyMessageLimit ?? sub?.plan?.monthlyMessageLimit ?? 0;
    const totalMessages = counter?.totalMessages ?? 0;
    const isCustom = Boolean(
      sub?.customPlanName || sub?.customMonthlyPrice != null || sub?.customMonthlyMessageLimit != null
    );
    return {
      ...t,
      planDisplayName:
        sub?.customPlanName ?? (isCustom ? "Plan personalizado" : sub?.plan?.name ?? null),
      effectiveMonthlyPrice:
        sub?.customMonthlyPrice != null
          ? Number(sub.customMonthlyPrice.toString())
          : sub?.plan
            ? Number(sub.plan.priceMonthly.toString())
            : null,
      planCurrency: sub?.plan?.currency ?? "USD",
      billingMode: sub?.billingMode ?? null,
      paymentStatus: sub?.paymentStatus ?? null,
      nextBillingDate: sub?.nextBillingDate ?? sub?.currentPeriodEnd ?? null,
      monthlyUsage: {
        totalMessages,
        messageLimit,
        exceeded: messageLimit > 0 && totalMessages >= messageLimit,
      },
    };
  });

  return { tenants: enriched, total, page, limit, pages: Math.ceil(total / limit) };
}

export async function getTenantById(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      subscription: { include: { plan: true } },
      users: { select: { id: true, name: true, email: true, role: true, status: true, lastLoginAt: true } },
      agents: true,
      _count: { select: { conversations: true, quotes: true, customers: true } },
    },
  });
  if (!tenant) throw new AppError("Empresa no encontrada", 404);

  // Uso del mes en curso + owner destacado (para el detalle admin)
  const { start } = getCurrentPeriod();
  const counter = await prisma.usageCounter.findUnique({
    where: { tenantId_periodStart: { tenantId, periodStart: start } },
  });
  const sub = tenant.subscription;
  const messageLimit = sub?.customMonthlyMessageLimit ?? sub?.plan?.monthlyMessageLimit ?? 0;

  return {
    ...tenant,
    owner: tenant.users.find((u) => u.role === "OWNER") ?? null,
    monthlyUsage: {
      totalMessages: counter?.totalMessages ?? 0,
      inboundMessages: counter?.inboundMessages ?? 0,
      outboundMessages: counter?.outboundMessages ?? 0,
      aiTotalTokens: counter?.aiTotalTokens ?? 0,
      messageLimit,
      exceeded: messageLimit > 0 && (counter?.totalMessages ?? 0) >= messageLimit,
    },
  };
}

/** Contraseña temporal legible que cumple la política fuerte del login. */
function generateTempPassword(): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `Sendwary!${random.charAt(0).toUpperCase()}${random.slice(1)}9`;
}

async function resolvePlan(planCode?: string, planId?: string) {
  const plan = planCode
    ? await prisma.plan.findFirst({ where: { code: planCode, isActive: true } })
    : planId
      ? await prisma.plan.findUnique({ where: { id: planId } })
      : null;
  if (!plan) throw new AppError("Plan no encontrado", 404);
  return plan;
}

function customSubscriptionData(data: {
  customPlanName?: string | null;
  customMonthlyPrice?: number | null;
  customSetupFee?: number | null;
  customMonthlyMessageLimit?: number | null;
  customMonthlyTokenLimit?: number | null;
  customMaxUsers?: number | null;
  customMaxAgents?: number | null;
  customMaxWhatsappNumbers?: number | null;
}) {
  return {
    ...(data.customPlanName !== undefined ? { customPlanName: data.customPlanName } : {}),
    ...(data.customMonthlyPrice !== undefined
      ? { customMonthlyPrice: data.customMonthlyPrice }
      : {}),
    ...(data.customSetupFee !== undefined ? { customSetupFee: data.customSetupFee } : {}),
    ...(data.customMonthlyMessageLimit !== undefined
      ? { customMonthlyMessageLimit: data.customMonthlyMessageLimit }
      : {}),
    ...(data.customMonthlyTokenLimit !== undefined
      ? { customMonthlyTokenLimit: data.customMonthlyTokenLimit }
      : {}),
    ...(data.customMaxUsers !== undefined ? { customMaxUsers: data.customMaxUsers } : {}),
    ...(data.customMaxAgents !== undefined ? { customMaxAgents: data.customMaxAgents } : {}),
    ...(data.customMaxWhatsappNumbers !== undefined
      ? { customMaxWhatsappNumbers: data.customMaxWhatsappNumbers }
      : {}),
  };
}

/**
 * Venta manual: crea empresa + owner + suscripción SIN pasar por LemonSqueezy.
 * Si no se envía contraseña, se genera una temporal y se devuelve UNA sola vez
 * en la respuesta (no hay sistema de invitación por email todavía).
 */
export async function createTenantWithOwner(
  data: z.infer<typeof createTenantSchema>,
  createdByAdminId?: string
) {
  const plan = await resolvePlan(data.planCode, data.planId);

  // Owner: si el email existe pero no pertenece a ninguna empresa, se asocia;
  // si ya pertenece a otra, error claro.
  const existingUser = await prisma.user.findUnique({ where: { email: data.ownerEmail } });
  if (existingUser?.tenantId) {
    throw new AppError("Ese email ya pertenece a otra empresa", 409);
  }

  const tempPassword = data.ownerPassword ? null : generateTempPassword();
  const passwordHash = await hashPassword(data.ownerPassword ?? tempPassword!);

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const defaultPaymentStatus = data.billingMode === "FREE" ? "NOT_REQUIRED" : "PENDING";

  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: data.companyName,
        legalName: data.legalName,
        rnc: data.rnc,
        phone: data.phone,
        email: data.email,
        address: data.address,
        industry: data.industry,
        timezone: data.timezone,
        status: "ACTIVE",
        internalNotes: data.internalNotes ?? null,
        createdByAdminId: createdByAdminId ?? null,
      },
    });

    const owner = existingUser
      ? await tx.user.update({
          where: { id: existingUser.id },
          data: {
            tenantId: tenant.id,
            role: "OWNER",
            ...(data.ownerPassword || tempPassword ? { passwordHash } : {}),
          },
        })
      : await tx.user.create({
          data: {
            tenantId: tenant.id,
            name: data.ownerFirstName,
            lastName: data.ownerLastName ?? null,
            email: data.ownerEmail,
            passwordHash,
            role: "OWNER",
            status: "ACTIVE",
          },
        });

    const subscription = await tx.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: plan.id,
        status: data.subscriptionStatus,
        billingMode: data.billingMode,
        paymentStatus: data.paymentStatus ?? defaultPaymentStatus,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        nextBillingDate: data.billingMode === "FREE" ? null : periodEnd,
        ...customSubscriptionData(data),
      },
    });

    return { tenant, owner, subscription };
  });

  logger.info(
    `[ADMIN] cliente creado: ${result.tenant.name} (${result.tenant.id}) plan=${plan.code ?? plan.name} billingMode=${data.billingMode} por admin=${createdByAdminId ?? "?"}`
  );

  return {
    tenant: result.tenant,
    owner: { id: result.owner.id, name: result.owner.name, email: result.owner.email },
    subscription: result.subscription,
    // Solo se muestra una vez; no hay sistema de invitación por email aún
    tempPassword,
  };
}

export async function updateTenantInfo(
  tenantId: string,
  data: z.infer<typeof updateTenantSchema>
) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new AppError("Empresa no encontrada", 404);

  const updated = await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.industry !== undefined ? { industry: data.industry } : {}),
      ...(data.legalName !== undefined ? { legalName: data.legalName } : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
      ...(data.email !== undefined ? { email: data.email } : {}),
      ...(data.address !== undefined ? { address: data.address } : {}),
      ...(data.internalNotes !== undefined ? { internalNotes: data.internalNotes } : {}),
    },
  });
  logger.info(`[ADMIN] empresa actualizada: ${tenantId}`);
  return updated;
}

/** Edición completa de la suscripción: plan, modo de cobro, pago y overrides. */
export async function updateTenantSubscription(
  tenantId: string,
  data: z.infer<typeof updateSubscriptionSchema>
) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { subscription: true },
  });
  if (!tenant) throw new AppError("Empresa no encontrada", 404);

  let planId = tenant.subscription?.planId;
  if (data.planCode || data.planId) {
    planId = (await resolvePlan(data.planCode, data.planId)).id;
  }
  if (!planId) throw new AppError("La empresa no tiene plan; indica planCode", 400);

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const shared = {
    planId,
    ...(data.status ? { status: data.status } : {}),
    ...(data.billingMode ? { billingMode: data.billingMode } : {}),
    ...(data.paymentStatus ? { paymentStatus: data.paymentStatus } : {}),
    ...(data.nextBillingDate !== undefined ? { nextBillingDate: data.nextBillingDate } : {}),
    ...customSubscriptionData(data),
  };

  const subscription = await prisma.subscription.upsert({
    where: { tenantId },
    update: shared,
    create: {
      tenantId,
      planId,
      status: data.status ?? "ACTIVE",
      billingMode: data.billingMode ?? "MANUAL",
      paymentStatus: data.paymentStatus ?? "PENDING",
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      nextBillingDate: data.nextBillingDate ?? periodEnd,
      ...customSubscriptionData(data),
    },
  });

  logger.info(
    `[ADMIN] suscripción actualizada tenant=${tenantId} plan=${planId} billingMode=${subscription.billingMode} paymentStatus=${subscription.paymentStatus} límiteCustom=${subscription.customMonthlyMessageLimit ?? "—"}`
  );
  return subscription;
}

/** Borra el contador del mes en curso (solo para pruebas/demo). */
export async function resetTenantUsage(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new AppError("Empresa no encontrada", 404);
  const { start } = getCurrentPeriod();
  const result = await prisma.usageCounter.deleteMany({
    where: { tenantId, periodStart: start },
  });
  logger.info(`[ADMIN] uso del mes reseteado tenant=${tenantId} (${result.count} contador)`);
  return { reset: result.count > 0 };
}

export async function suspendTenant(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new AppError("Empresa no encontrada", 404);
  return prisma.tenant.update({ where: { id: tenantId }, data: { status: "SUSPENDED" } });
}

export async function reactivateTenant(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new AppError("Empresa no encontrada", 404);
  return prisma.tenant.update({ where: { id: tenantId }, data: { status: "ACTIVE" } });
}

export async function cancelTenant(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new AppError("Empresa no encontrada", 404);
  return prisma.$transaction([
    prisma.tenant.update({ where: { id: tenantId }, data: { status: "CANCELLED" } }),
    prisma.subscription.updateMany({
      where: { tenantId, status: { not: "CANCELLED" } },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    }),
  ]);
}

export async function assignPlanToTenant(
  tenantId: string,
  planId: string,
  overrides?: {
    customMonthlyMessageLimit?: number | null;
    customMonthlyTokenLimit?: number | null;
  }
) {
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) throw new AppError("Plan no encontrado", 404);

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const customFields = {
    ...(overrides?.customMonthlyMessageLimit !== undefined
      ? { customMonthlyMessageLimit: overrides.customMonthlyMessageLimit }
      : {}),
    ...(overrides?.customMonthlyTokenLimit !== undefined
      ? { customMonthlyTokenLimit: overrides.customMonthlyTokenLimit }
      : {}),
  };

  return prisma.subscription.upsert({
    where: { tenantId },
    update: {
      planId,
      status: "ACTIVE",
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      ...customFields,
    },
    create: {
      tenantId,
      planId,
      status: "ACTIVE",
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      ...customFields,
    },
  });
}

export async function createUserForTenant(input: {
  tenantId: string;
  name: string;
  email: string;
  password: string;
  role: "ADMIN" | "AGENT_OPERATOR" | "BILLING";
}) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new AppError("Ya existe un usuario con ese email", 409);

  const tenant = await prisma.tenant.findUnique({ where: { id: input.tenantId } });
  if (!tenant) throw new AppError("Empresa no encontrada", 404);

  const passwordHash = await hashPassword(input.password);

  return prisma.user.create({
    data: {
      tenantId: input.tenantId,
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
      status: "ACTIVE",
    },
  });
}

export async function listCancellationRequests(status?: string) {
  return prisma.cancellationRequest.findMany({
    where: status ? { status: status as any } : {},
    include: {
      tenant: { select: { id: true, name: true } },
      requestedBy: { select: { id: true, name: true, email: true } },
      subscription: { include: { plan: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function processCancellationRequest(
  requestId: string,
  action: "approve" | "reject" | "complete",
  adminNotes?: string
) {
  const request = await prisma.cancellationRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new AppError("Solicitud no encontrada", 404);

  const statusMap = { approve: "APPROVED", reject: "REJECTED", complete: "COMPLETED" } as const;

  return prisma.cancellationRequest.update({
    where: { id: requestId },
    data: { status: statusMap[action], adminNotes },
  });
}
