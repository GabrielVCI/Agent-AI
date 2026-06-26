import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { AppError } from "../middlewares/error.middleware.js";

export const cancellationRequestSchema = z.object({
  reason: z.string().min(10, "Por favor explica el motivo con al menos 10 caracteres"),
});

export async function getAccountPlan(tenantId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { tenantId },
    include: { plan: true },
  });

  if (!subscription) throw new AppError("No tienes una suscripción activa", 404);
  return subscription;
}

export async function createCancellationRequest(input: {
  tenantId: string;
  userId: string;
  reason: string;
}) {
  const subscription = await prisma.subscription.findUnique({ where: { tenantId: input.tenantId } });
  if (!subscription) throw new AppError("No tienes una suscripción activa", 404);

  const existing = await prisma.cancellationRequest.findFirst({
    where: { tenantId: input.tenantId, status: "PENDING" },
  });
  if (existing) throw new AppError("Ya tienes una solicitud de cancelación pendiente", 409);

  return prisma.cancellationRequest.create({
    data: {
      tenantId: input.tenantId,
      subscriptionId: subscription.id,
      requestedByUserId: input.userId,
      reason: input.reason,
      status: "PENDING",
    },
  });
}
