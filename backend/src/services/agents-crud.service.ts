import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { AppError } from "../middlewares/error.middleware.js";

/**
 * Contrato externo de Agentes.
 *
 * El frontend usa nombres de campo distintos a los del schema Prisma. Esta
 * capa traduce en ambos sentidos para que el frontend no necesite conocer los
 * nombres internos:
 *
 *   Frontend (API)          ->  Prisma (DB)
 *   basePrompt              ->  systemPrompt
 *   whatsappNumber          ->  whatsappDisplayPhone
 *   whatsappPhoneNumberId   ->  whatsappPhoneNumberId   (igual; enrutamiento WhatsApp)
 *   aiModel                 ->  openAiModel
 *   allowAudio              ->  allowAudioMessages
 *   allowHumanIntervention  ->  allowHumanHandoff
 *   status: ACTIVE|INACTIVE ->  status: ACTIVE|DISABLED
 */

export const createAgentSchema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  type: z.enum(["SALES", "SUPPORT", "APPOINTMENTS", "CUSTOM"]).default("SALES"),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  description: z.string().optional(),
  department: z.string().optional(),
  basePrompt: z.string().optional(),
  tone: z.string().optional(),
  whatsappNumber: z.string().optional(),
  whatsappPhoneNumberId: z.string().optional(),
  aiModel: z.string().optional(),
  allowAudio: z.boolean().optional(),
  allowHumanIntervention: z.boolean().optional(),
});

export const updateAgentSchema = createAgentSchema.partial();

export const updateStatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

type CreateAgentDto = z.infer<typeof createAgentSchema>;
type UpdateAgentDto = z.infer<typeof updateAgentSchema>;

type AgentRecord = Prisma.AgentGetPayload<{}>;

export type AgentStats = {
  conversationsHandled: number;
  quotesGenerated: number;
  audiosReceived: number;
  humanInterventionRate: number;
};

type AgentWriteData = Partial<
  Pick<
    Prisma.AgentUncheckedCreateInput,
    | "name"
    | "type"
    | "status"
    | "description"
    | "department"
    | "systemPrompt"
    | "tone"
    | "whatsappDisplayPhone"
    | "whatsappPhoneNumberId"
    | "openAiModel"
    | "allowAudioMessages"
    | "allowHumanHandoff"
  >
>;

/** Traduce un payload externo (frontend) a campos del schema Prisma. */
function toPrismaData(dto: UpdateAgentDto): AgentWriteData {
  const data: AgentWriteData = {};

  if (dto.name !== undefined) data.name = dto.name;
  if (dto.type !== undefined) data.type = dto.type;
  if (dto.status !== undefined) data.status = dto.status === "INACTIVE" ? "DISABLED" : "ACTIVE";
  if (dto.description !== undefined) data.description = dto.description;
  if (dto.department !== undefined) data.department = dto.department;
  if (dto.basePrompt !== undefined) data.systemPrompt = dto.basePrompt;
  if (dto.tone !== undefined) data.tone = dto.tone;
  if (dto.whatsappNumber !== undefined) data.whatsappDisplayPhone = dto.whatsappNumber;
  if (dto.whatsappPhoneNumberId !== undefined) data.whatsappPhoneNumberId = dto.whatsappPhoneNumberId;
  if (dto.aiModel !== undefined) data.openAiModel = dto.aiModel;
  if (dto.allowAudio !== undefined) data.allowAudioMessages = dto.allowAudio;
  if (dto.allowHumanIntervention !== undefined) data.allowHumanHandoff = dto.allowHumanIntervention;

  return data;
}

/** Serializa un Agent de Prisma al DTO que consume el frontend. */
export function serializeAgent(agent: AgentRecord, stats?: AgentStats) {
  return {
    id: agent.id,
    name: agent.name,
    type: agent.type,
    status: agent.status === "DISABLED" ? "INACTIVE" : "ACTIVE",
    description: agent.description ?? undefined,
    department: agent.department ?? undefined,
    basePrompt: agent.systemPrompt ?? undefined,
    tone: agent.tone ?? undefined,
    whatsappNumber: agent.whatsappDisplayPhone ?? undefined,
    whatsappPhoneNumberId: agent.whatsappPhoneNumberId ?? undefined,
    aiModel: agent.openAiModel,
    allowAudio: agent.allowAudioMessages,
    allowHumanIntervention: agent.allowHumanHandoff,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
    ...(stats ? { stats } : {}),
  };
}

/**
 * Calcula estadísticas básicas por agente con un número fijo de consultas
 * agregadas (independiente de la cantidad de agentes). audiosReceived queda
 * en 0 hasta que exista soporte de audio.
 */
async function getAgentStatsMap(tenantId: string): Promise<Map<string, AgentStats>> {
  const [convByAgent, humanConvByAgent, quotesByAgent] = await Promise.all([
    prisma.conversation.groupBy({
      by: ["agentId"],
      where: { tenantId, agentId: { not: null } },
      _count: { _all: true },
    }),
    prisma.conversation.groupBy({
      by: ["agentId"],
      where: { tenantId, agentId: { not: null }, status: "HUMAN_ACTIVE" },
      _count: { _all: true },
    }),
    prisma.quote.groupBy({
      by: ["agentId"],
      where: { tenantId, agentId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const humanMap = new Map(humanConvByAgent.map((r) => [r.agentId, r._count._all]));
  const quoteMap = new Map(quotesByAgent.map((r) => [r.agentId, r._count._all]));
  const stats = new Map<string, AgentStats>();

  for (const row of convByAgent) {
    if (!row.agentId) continue;
    const total = row._count._all;
    const human = humanMap.get(row.agentId) ?? 0;
    stats.set(row.agentId, {
      conversationsHandled: total,
      quotesGenerated: quoteMap.get(row.agentId) ?? 0,
      audiosReceived: 0,
      humanInterventionRate: total > 0 ? (human / total) * 100 : 0,
    });
  }

  // Agentes con cotizaciones pero sin conversaciones registradas todavía.
  for (const [agentId, count] of quoteMap) {
    if (!agentId || stats.has(agentId)) continue;
    stats.set(agentId, {
      conversationsHandled: 0,
      quotesGenerated: count,
      audiosReceived: 0,
      humanInterventionRate: 0,
    });
  }

  return stats;
}

const EMPTY_STATS: AgentStats = {
  conversationsHandled: 0,
  quotesGenerated: 0,
  audiosReceived: 0,
  humanInterventionRate: 0,
};

export async function listAgents(tenantId: string) {
  const [agents, statsMap] = await Promise.all([
    prisma.agent.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } }),
    getAgentStatsMap(tenantId),
  ]);

  return agents.map((a) => serializeAgent(a, statsMap.get(a.id) ?? EMPTY_STATS));
}

async function getAgentRecord(agentId: string, tenantId: string): Promise<AgentRecord> {
  const agent = await prisma.agent.findFirst({ where: { id: agentId, tenantId } });
  if (!agent) throw new AppError("Agente no encontrado", 404);
  return agent;
}

export async function getAgent(agentId: string, tenantId: string) {
  const agent = await getAgentRecord(agentId, tenantId);
  const statsMap = await getAgentStatsMap(tenantId);
  return serializeAgent(agent, statsMap.get(agent.id) ?? EMPTY_STATS);
}

export async function createAgent(tenantId: string, data: CreateAgentDto) {
  const mapped = toPrismaData(data);

  const agent = await prisma.agent.create({
    data: {
      tenantId,
      name: data.name,
      type: data.type,
      // openAiModel tiene default en el schema; aplicamos el de entorno si no vino.
      openAiModel: data.aiModel ?? env.OPENAI_DEFAULT_MODEL,
      ...mapped,
    },
  });

  return serializeAgent(agent, EMPTY_STATS);
}

export async function updateAgent(agentId: string, tenantId: string, data: UpdateAgentDto) {
  await getAgentRecord(agentId, tenantId);

  const agent = await prisma.agent.update({
    where: { id: agentId },
    data: toPrismaData(data),
  });

  const statsMap = await getAgentStatsMap(tenantId);
  return serializeAgent(agent, statsMap.get(agent.id) ?? EMPTY_STATS);
}

/** Activa o desactiva un agente (PATCH /:id/status). */
export async function setAgentStatus(
  agentId: string,
  tenantId: string,
  status: "ACTIVE" | "INACTIVE"
) {
  await getAgentRecord(agentId, tenantId);

  const agent = await prisma.agent.update({
    where: { id: agentId },
    data: { status: status === "INACTIVE" ? "DISABLED" : "ACTIVE" },
  });

  return serializeAgent(agent);
}

/** "Eliminar" = desactivar, para no romper conversaciones/cotizaciones vinculadas. */
export async function disableAgent(agentId: string, tenantId: string) {
  await getAgentRecord(agentId, tenantId);

  const agent = await prisma.agent.update({
    where: { id: agentId },
    data: { status: "DISABLED" },
  });

  return serializeAgent(agent);
}
