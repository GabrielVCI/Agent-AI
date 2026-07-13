import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { getCurrentPeriod, getTenantActiveSubscription } from "./billing.service.js";
import { AppError } from "../middlewares/error.middleware.js";

/**
 * Control de minutos de llamadas IA (fundación pre-ElevenLabs).
 *
 * - Solo Enterprise (o override del SUPER_ADMIN) puede usar voz.
 * - Cuota: customVoiceMinutesLimit > voiceSettings.monthlyMinutesLimit >
 *   usuarios_permitidos × minutesPerUser (default 180).
 * - El consumo se registra por llamada (CallLog, idempotente por callId) y se
 *   agrega en VoiceUsageCounter (una fila por tenant+mes, patrón UsageCounter).
 * - La facturación es por minuto redondeado hacia ARRIBA (modelo ElevenLabs).
 */

// ─── Modelo de costos (env, no hardcode) ─────────────────────────────────────

export const VOICE_COSTS = {
  includedMinutes: env.ELEVENLABS_INCLUDED_MINUTES,
  overageCostPerMinute: env.ELEVENLABS_OVERAGE_COST_PER_MINUTE,
  geminiMonthlyCost: env.ELEVENLABS_GEMINI_MONTHLY_COST,
  budgetPerUserUsd: env.SENDWARY_ENTERPRISE_VOICE_BUDGET_PER_USER_USD,
  defaultMinutesPerUser: env.SENDWARY_DEFAULT_ENTERPRISE_VOICE_MINUTES_PER_USER,
};

/**
 * Minutos que caben en un presupuesto dado el costo por minuto y un costo
 * fijo mensual. safeMinutes redondea hacia abajo a múltiplos de 10 como
 * margen comercial (ej: 183.6 → 180).
 */
export function calculateVoiceMinutesFromBudget(input: {
  budgetUsd: number;
  costPerMinute: number;
  fixedMonthlyCost?: number;
}) {
  const fixed = input.fixedMonthlyCost ?? 0;
  const usable = Math.max(0, input.budgetUsd - fixed);
  const rawMinutes = input.costPerMinute > 0 ? usable / input.costPerMinute : 0;
  const safeMinutes = Math.floor(rawMinutes / 10) * 10;
  return {
    rawMinutes: Math.round(rawMinutes * 100) / 100,
    safeMinutes,
    estimatedBudget: input.budgetUsd,
    estimatedCostPerMinute: input.costPerMinute,
  };
}

/** Minutos facturables de una llamada: cada minuto iniciado cuenta completo. */
export function billableMinutes(durationSeconds: number): number {
  return durationSeconds > 0 ? Math.ceil(durationSeconds / 60) : 0;
}

// ─── Settings del tenant (JSON en Tenant.voiceSettings) ─────────────────────

export interface VoiceSettings {
  /** Master switch: lo controla el SUPER_ADMIN */
  enabled: boolean;
  minutesPerUser: number;
  /** Override directo del límite mensual del tenant (null = calcular) */
  monthlyMinutesLimit: number | null;
  /** null = todos los agentes con allowVoiceCalls */
  allowedAgentIds: string[] | null;
  businessPhoneNumbers: string[];
}

export function defaultVoiceSettings(): VoiceSettings {
  return {
    enabled: false,
    minutesPerUser: VOICE_COSTS.defaultMinutesPerUser,
    monthlyMinutesLimit: null,
    allowedAgentIds: null,
    businessPhoneNumbers: [],
  };
}

export async function getVoiceSettings(tenantId: string): Promise<VoiceSettings> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { voiceSettings: true },
  });
  const stored = (tenant?.voiceSettings ?? {}) as Partial<VoiceSettings>;
  return { ...defaultVoiceSettings(), ...stored };
}

export async function updateVoiceSettings(
  tenantId: string,
  patch: Partial<VoiceSettings>
): Promise<VoiceSettings> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new AppError("Empresa no encontrada", 404);
  const merged: VoiceSettings = { ...(await getVoiceSettings(tenantId)), ...patch };
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { voiceSettings: merged as unknown as Prisma.InputJsonValue },
  });
  logger.info(
    `[ADMIN][VOICE] settings tenant=${tenantId} enabled=${merged.enabled} límite=${merged.monthlyMinutesLimit ?? "auto"} min/usuario=${merged.minutesPerUser}`
  );
  return merged;
}

// ─── Contador mensual ────────────────────────────────────────────────────────

export async function getVoicePeriodUsage(tenantId: string) {
  const { start, end } = getCurrentPeriod();
  const counter = await prisma.voiceUsageCounter.findUnique({
    where: { tenantId_periodStart: { tenantId, periodStart: start } },
  });
  const usedSeconds = counter?.usedSeconds ?? 0;
  return {
    periodStart: start,
    periodEnd: end,
    usedSeconds,
    usedMinutes: Math.round((usedSeconds / 60) * 100) / 100,
    billedMinutes: billableMinutes(usedSeconds),
    callCount: counter?.callCount ?? 0,
    estimatedCost: counter ? Number(counter.estimatedCostUsd.toString()) : 0,
  };
}

async function bumpVoiceUsage(tenantId: string, durationSeconds: number, costUsd: number) {
  const { start, end } = getCurrentPeriod();
  await prisma.voiceUsageCounter.upsert({
    where: { tenantId_periodStart: { tenantId, periodStart: start } },
    create: {
      tenantId,
      periodStart: start,
      periodEnd: end,
      usedSeconds: durationSeconds,
      callCount: 1,
      estimatedCostUsd: costUsd,
    },
    update: {
      usedSeconds: { increment: durationSeconds },
      callCount: { increment: 1 },
      estimatedCostUsd: { increment: costUsd },
    },
  });
}

// ─── Entitlement (autorización de llamadas) ──────────────────────────────────

export type VoiceEntitlementReason =
  | "OK"
  | "TENANT_INACTIVE"
  | "SUBSCRIPTION_INACTIVE"
  | "PLAN_REQUIRED"
  | "VOICE_NOT_ENABLED"
  | "VOICE_MINUTES_LIMIT_REACHED";

export interface VoiceEntitlement {
  enabled: boolean;
  canUseVoice: boolean;
  reason: VoiceEntitlementReason;
  planCode: string | null;
  subscriptionStatus: string | null;
  monthlyMinutesLimit: number;
  minutesPerUser: number;
  usedMinutes: number;
  remainingMinutes: number;
  percentUsed: number;
  estimatedCost: number;
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Resuelve si el tenant puede usar llamadas IA ahora mismo y cuántos minutos
 * le quedan. Escalera de razones: tenant suspendido → suscripción inactiva →
 * plan sin voz → voz no activada → minutos agotados → OK.
 *
 * Override documentado: `voiceSettings.enabled = true` (solo SUPER_ADMIN)
 * habilita voz aunque el plan no sea ENTERPRISE (clientes negociados).
 */
export async function getTenantVoiceEntitlement(tenantId: string): Promise<VoiceEntitlement> {
  const [tenant, info, settings, usage] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { status: true } }),
    getTenantActiveSubscription(tenantId),
    getVoiceSettings(tenantId),
    getVoicePeriodUsage(tenantId),
  ]);

  const planCode = info.plan?.code ?? null;
  const subscriptionStatus = info.subscription?.status ?? null;
  const isEnterprise = planCode === "ENTERPRISE";

  // Límite efectivo: custom de suscripción > override de settings > usuarios × cuota
  const usersForVoice = Math.max(1, info.maxUsers ?? 1);
  const monthlyMinutesLimit =
    info.subscription?.customVoiceMinutesLimit ??
    settings.monthlyMinutesLimit ??
    usersForVoice * settings.minutesPerUser;

  const usedMinutes = usage.billedMinutes;
  const remainingMinutes = Math.max(0, monthlyMinutesLimit - usedMinutes);
  const percentUsed =
    monthlyMinutesLimit > 0
      ? Math.min(999, Math.round((usedMinutes / monthlyMinutesLimit) * 100))
      : 0;

  const base = {
    enabled: settings.enabled,
    planCode,
    subscriptionStatus,
    monthlyMinutesLimit,
    minutesPerUser: settings.minutesPerUser,
    usedMinutes,
    remainingMinutes,
    percentUsed,
    estimatedCost: usage.estimatedCost,
    periodStart: usage.periodStart,
    periodEnd: usage.periodEnd,
  };

  const blocked = (reason: VoiceEntitlementReason): VoiceEntitlement => ({
    ...base,
    canUseVoice: false,
    reason,
  });

  if (tenant && tenant.status !== "ACTIVE") return blocked("TENANT_INACTIVE");
  if (subscriptionStatus && !["ACTIVE", "TRIALING"].includes(subscriptionStatus)) {
    return blocked("SUBSCRIPTION_INACTIVE");
  }
  // Sin Enterprise y sin override del admin: el plan no incluye voz
  if (!isEnterprise && !settings.enabled) return blocked("PLAN_REQUIRED");
  // Enterprise pero el admin aún no activó la voz para este tenant
  if (!settings.enabled) return blocked("VOICE_NOT_ENABLED");
  if (remainingMinutes <= 0) return blocked("VOICE_MINUTES_LIMIT_REACHED");

  return { ...base, canUseVoice: true, reason: "OK" };
}

// ─── Registro de llamadas ────────────────────────────────────────────────────

export interface RecordVoiceUsageInput {
  tenantId: string;
  agentId?: string | null;
  userId?: string | null;
  conversationId?: string | null;
  elevenLabsConversationId?: string | null;
  elevenLabsCallId?: string | null;
  direction?: "INBOUND" | "OUTBOUND";
  status?: "STARTED" | "COMPLETED" | "FAILED" | "CANCELLED";
  durationSeconds: number;
  customerPhone?: string | null;
  transcript?: string | null;
  summary?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Registra una llamada y suma su consumo al contador del mes.
 * Idempotente por elevenLabsCallId: el mismo callId jamás suma dos veces.
 */
export async function recordVoiceUsage(input: RecordVoiceUsageInput) {
  // Idempotencia: si el callId ya existe, devolver sin duplicar consumo
  if (input.elevenLabsCallId) {
    const existing = await prisma.callLog.findUnique({
      where: { elevenLabsCallId: input.elevenLabsCallId },
    });
    if (existing) {
      logger.info(`[VOICE] callId duplicado ignorado: ${input.elevenLabsCallId}`);
      return { call: existing, duplicated: true };
    }
  }

  const durationSeconds = Math.max(0, Math.floor(input.durationSeconds));
  const minutes = billableMinutes(durationSeconds);
  const estimatedCostUsd =
    Math.round(minutes * VOICE_COSTS.overageCostPerMinute * 10000) / 10000;

  const call = await prisma.callLog.create({
    data: {
      tenantId: input.tenantId,
      agentId: input.agentId ?? null,
      userId: input.userId ?? null,
      conversationId: input.conversationId ?? null,
      elevenLabsConversationId: input.elevenLabsConversationId ?? null,
      elevenLabsCallId: input.elevenLabsCallId ?? null,
      direction: input.direction ?? "INBOUND",
      status: input.status ?? "COMPLETED",
      startedAt: new Date(Date.now() - durationSeconds * 1000),
      endedAt: new Date(),
      durationSeconds,
      estimatedCostUsd,
      customerPhone: input.customerPhone ?? null,
      transcript: input.transcript ?? null,
      summary: input.summary ?? null,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });

  if (durationSeconds > 0) {
    await bumpVoiceUsage(input.tenantId, durationSeconds, estimatedCostUsd);
  }

  logger.info(
    `[VOICE] llamada registrada tenant=${input.tenantId} ${minutes} min (${durationSeconds}s) costo≈$${estimatedCostUsd}`
  );
  return { call, duplicated: false };
}

export function serializeCall(call: Prisma.CallLogGetPayload<{ include: { agent: { select: { id: true; name: true } } } }>) {
  return {
    id: call.id,
    agent: call.agent,
    direction: call.direction,
    status: call.status,
    startedAt: call.startedAt,
    endedAt: call.endedAt,
    durationSeconds: call.durationSeconds,
    durationMinutes: billableMinutes(call.durationSeconds),
    estimatedCost: Number(call.estimatedCostUsd.toString()),
    customerPhone: call.customerPhone,
    summary: call.summary,
    hasTranscript: Boolean(call.transcript),
    createdAt: call.createdAt,
  };
}

export async function listCalls(tenantId: string, limit = 50) {
  const calls = await prisma.callLog.findMany({
    where: { tenantId },
    include: { agent: { select: { id: true, name: true } } },
    orderBy: { startedAt: "desc" },
    take: Math.min(limit, 100),
  });
  return calls.map(serializeCall);
}

/** Detalle de una llamada del tenant, incluyendo transcript completo. */
export async function getCallDetail(tenantId: string, callId: string) {
  const call = await prisma.callLog.findFirst({
    where: { id: callId, tenantId },
    include: { agent: { select: { id: true, name: true } } },
  });
  if (!call) throw new AppError("Llamada no encontrada", 404);
  return {
    ...serializeCall(call),
    transcript: call.transcript,
    conversationId: call.conversationId,
    elevenLabsConversationId: call.elevenLabsConversationId,
  };
}

/** Borra el contador de voz del mes en curso (solo pruebas/demo). */
export async function resetVoiceUsage(tenantId: string) {
  const { start } = getCurrentPeriod();
  const result = await prisma.voiceUsageCounter.deleteMany({
    where: { tenantId, periodStart: start },
  });
  logger.info(`[ADMIN][VOICE] uso de voz reseteado tenant=${tenantId}`);
  return { reset: result.count > 0 };
}
