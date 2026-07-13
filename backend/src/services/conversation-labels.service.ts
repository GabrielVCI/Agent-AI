import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { AppError } from "../middlewares/error.middleware.js";

/**
 * Etiquetas de conversación (estilo respond.io, versión simple).
 * Colores = tokens de la paleta del frontend (badge variants), no hex libres.
 */

export const LABEL_COLORS = [
  "slate",
  "violet",
  "blue",
  "green",
  "amber",
  "red",
  "pink",
] as const;

/** Etiquetas iniciales que se crean la primera vez que un tenant las usa. */
const DEFAULT_LABELS: { name: string; color: (typeof LABEL_COLORS)[number] }[] = [
  { name: "Nuevo cliente", color: "green" },
  { name: "Cotización", color: "blue" },
  { name: "Cita", color: "violet" },
  { name: "Urgente", color: "red" },
  { name: "Seguimiento", color: "amber" },
  { name: "Venta potencial", color: "pink" },
  { name: "Soporte", color: "slate" },
];

export async function listLabels(tenantId: string) {
  let labels = await prisma.conversationLabel.findMany({
    where: { tenantId },
    include: { _count: { select: { assignments: true } } },
    orderBy: { name: "asc" },
  });

  // Seed perezoso: el primer acceso del tenant crea el set inicial
  if (labels.length === 0) {
    await prisma.conversationLabel.createMany({
      data: DEFAULT_LABELS.map((l) => ({ tenantId, ...l })),
      skipDuplicates: true,
    });
    labels = await prisma.conversationLabel.findMany({
      where: { tenantId },
      include: { _count: { select: { assignments: true } } },
      orderBy: { name: "asc" },
    });
  }

  return labels.map((l) => ({
    id: l.id,
    name: l.name,
    color: l.color,
    usageCount: l._count.assignments,
  }));
}

export async function createLabel(tenantId: string, input: { name: string; color?: string }) {
  try {
    return await prisma.conversationLabel.create({
      data: {
        tenantId,
        name: input.name.trim(),
        color: LABEL_COLORS.includes(input.color as never) ? input.color! : "slate",
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError("Ya existe una etiqueta con ese nombre", 409);
    }
    throw err;
  }
}

async function getOwnLabel(tenantId: string, id: string) {
  const label = await prisma.conversationLabel.findFirst({ where: { id, tenantId } });
  if (!label) throw new AppError("Etiqueta no encontrada", 404);
  return label;
}

export async function updateLabel(
  tenantId: string,
  id: string,
  input: { name?: string; color?: string }
) {
  await getOwnLabel(tenantId, id);
  try {
    return await prisma.conversationLabel.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.color !== undefined && LABEL_COLORS.includes(input.color as never)
          ? { color: input.color }
          : {}),
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError("Ya existe una etiqueta con ese nombre", 409);
    }
    throw err;
  }
}

export async function deleteLabel(tenantId: string, id: string) {
  await getOwnLabel(tenantId, id);
  await prisma.conversationLabel.delete({ where: { id } });
  return { deleted: true };
}

// ─── Asignación a conversaciones ─────────────────────────────────────────────

async function getOwnConversation(tenantId: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, tenantId },
    select: { id: true },
  });
  if (!conversation) throw new AppError("Conversación no encontrada", 404);
  return conversation;
}

export async function addLabelToConversation(
  tenantId: string,
  conversationId: string,
  labelId: string
) {
  await getOwnConversation(tenantId, conversationId);
  await getOwnLabel(tenantId, labelId);
  await prisma.conversationLabelAssignment.upsert({
    where: { conversationId_labelId: { conversationId, labelId } },
    create: { conversationId, labelId },
    update: {},
  });
}

export async function removeLabelFromConversation(
  tenantId: string,
  conversationId: string,
  labelId: string
) {
  await getOwnConversation(tenantId, conversationId);
  await prisma.conversationLabelAssignment.deleteMany({
    where: { conversationId, labelId },
  });
}
