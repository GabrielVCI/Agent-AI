import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { AppError } from "../middlewares/error.middleware.js";

export const updateCompanySchema = z.object({
  name: z.string().min(1).optional(),
  legalName: z.string().optional(),
  rnc: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  industry: z.string().optional(),
  timezone: z.string().optional(),
  logoUrl: z.string().url().optional(),
});

export async function getTenant(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { subscription: { include: { plan: true } } },
  });

  if (!tenant) throw new AppError("Empresa no encontrada", 404);
  return tenant;
}

export async function updateTenant(
  tenantId: string,
  data: z.infer<typeof updateCompanySchema>
) {
  return prisma.tenant.update({
    where: { id: tenantId },
    data,
  });
}
