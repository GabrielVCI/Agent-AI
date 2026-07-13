import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { AppError } from "../middlewares/error.middleware.js";
import { encryptJson, decryptJson } from "../lib/crypto.js";
import type { IntegrationType } from "@prisma/client";
import { trainingConfigSchema, type TrainingConfig } from "../types/training.types.js";

export const createIntegrationSchema = z.object({
  type: z.enum(["WHATSAPP", "OPENAI", "PAYMENT", "STORAGE", "CUSTOM"]),
  name: z.string().min(1),
  config: z.record(z.unknown()),
});

export const updateIntegrationSchema = z.object({
  name: z.string().optional(),
  config: z.record(z.unknown()).optional(),
  status: z.enum(["ACTIVE", "DISABLED", "ERROR"]).optional(),
});

export async function listIntegrations(tenantId: string) {
  const integrations = await prisma.integration.findMany({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
  });

  // Never expose encrypted config to the client
  return integrations.map(({ encryptedConfig, ...rest }) => ({
    ...rest,
    hasConfig: !!encryptedConfig,
  }));
}

export async function createIntegration(
  tenantId: string,
  data: z.infer<typeof createIntegrationSchema>
) {
  const encryptedConfig = encryptJson(data.config as Record<string, unknown>);

  return prisma.integration.create({
    data: {
      tenantId,
      type: data.type as IntegrationType,
      name: data.name,
      encryptedConfig,
    },
    select: { id: true, tenantId: true, type: true, name: true, status: true, createdAt: true },
  });
}

export async function updateIntegration(
  integrationId: string,
  tenantId: string,
  data: z.infer<typeof updateIntegrationSchema>
) {
  const integration = await prisma.integration.findFirst({
    where: { id: integrationId, tenantId },
  });
  if (!integration) throw new AppError("Integración no encontrada", 404);

  const updateData: any = {};
  if (data.name) updateData.name = data.name;
  if (data.status) updateData.status = data.status;
  if (data.config) updateData.encryptedConfig = encryptJson(data.config as Record<string, unknown>);

  return prisma.integration.update({
    where: { id: integrationId },
    data: updateData,
    select: { id: true, tenantId: true, type: true, name: true, status: true, updatedAt: true },
  });
}

export async function listKnowledgeDocuments(tenantId: string) {
  return prisma.knowledgeDocument.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
}

export async function createKnowledgeDocument(input: {
  tenantId: string;
  userId?: string;
  title: string;
  fileName: string;
  fileType: string;
  fileUrl: string;
}) {
  return prisma.knowledgeDocument.create({
    data: {
      tenantId: input.tenantId,
      uploadedByUserId: input.userId ?? null,
      title: input.title,
      fileName: input.fileName,
      fileType: input.fileType,
      fileUrl: input.fileUrl,
      status: "UPLOADED",
    },
  });
}

export async function deleteKnowledgeDocument(docId: string, tenantId: string) {
  const doc = await prisma.knowledgeDocument.findFirst({ where: { id: docId, tenantId } });
  if (!doc) throw new AppError("Documento no encontrado", 404);

  await prisma.knowledgeDocument.delete({ where: { id: docId } });
}

// --- Entrenamiento / contexto del negocio (per-tenant) ---

export { trainingConfigSchema };

/** Devuelve el contexto de entrenamiento del tenant (o {} si no hay/está corrupto). */
export async function getTenantTraining(tenantId: string): Promise<TrainingConfig> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { trainingConfig: true },
  });

  const raw = tenant?.trainingConfig;
  if (!raw || typeof raw !== "object") return {};

  // Validamos de forma tolerante: si el JSON guardado no cuadra, devolvemos {}.
  const parsed = trainingConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}

/** Persiste el contexto de entrenamiento del tenant (ya validado por el controller). */
export async function updateTenantTraining(
  tenantId: string,
  data: TrainingConfig
): Promise<TrainingConfig> {
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { trainingConfig: data as Prisma.InputJsonValue },
  });
  return data;
}
