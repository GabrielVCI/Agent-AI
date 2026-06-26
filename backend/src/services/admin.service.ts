import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { AppError } from "../middlewares/error.middleware.js";
import { hashPassword } from "./auth.service.js";

export const createTenantSchema = z.object({
  name: z.string().min(1),
  legalName: z.string().optional(),
  rnc: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  industry: z.string().optional(),
  timezone: z.string().default("America/Santo_Domingo"),
  planId: z.string().min(1, "Plan requerido"),
  ownerName: z.string().min(1, "Nombre del owner requerido"),
  ownerEmail: z.string().email("Email del owner inválido"),
  ownerPassword: z.string().min(8, "Contraseña mínima 8 caracteres"),
});

export const assignPlanSchema = z.object({
  planId: z.string().min(1),
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
  return { tenants, total, page, limit, pages: Math.ceil(total / limit) };
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
  return tenant;
}

export async function createTenantWithOwner(data: z.infer<typeof createTenantSchema>) {
  const existingUser = await prisma.user.findUnique({ where: { email: data.ownerEmail } });
  if (existingUser) throw new AppError("Ya existe un usuario con ese email", 409);

  const plan = await prisma.plan.findUnique({ where: { id: data.planId } });
  if (!plan) throw new AppError("Plan no encontrado", 404);

  const passwordHash = await hashPassword(data.ownerPassword);
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: data.name,
        legalName: data.legalName,
        rnc: data.rnc,
        phone: data.phone,
        email: data.email,
        address: data.address,
        industry: data.industry,
        timezone: data.timezone,
        status: "ACTIVE",
      },
    });

    const owner = await tx.user.create({
      data: {
        tenantId: tenant.id,
        name: data.ownerName,
        email: data.ownerEmail,
        passwordHash,
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    const subscription = await tx.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: data.planId,
        status: "ACTIVE",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
    });

    return { tenant, owner, subscription };
  });

  return result;
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

export async function assignPlanToTenant(tenantId: string, planId: string) {
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) throw new AppError("Plan no encontrado", 404);

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  return prisma.subscription.upsert({
    where: { tenantId },
    update: { planId, status: "ACTIVE", currentPeriodStart: now, currentPeriodEnd: periodEnd },
    create: {
      tenantId,
      planId,
      status: "ACTIVE",
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
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
