import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { getRedisClient } from "../../config/redis.js";
import { AppError } from "../../middlewares/error.middleware.js";

/**
 * Herramientas de SOLO LECTURA del asistente de soporte.
 *
 * Reglas duras:
 * - Campos con allowlist explícita: jamás se devuelve el objeto crudo de la BD.
 * - NUNCA valores de secrets/tokens/keys: solo `configured: true/false`.
 * - Teléfonos y correos enmascarados.
 * - Cero contenido de mensajes de clientes (solo metadatos y contadores).
 */

export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `****${digits.slice(-4)}`;
}

export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [local, domain] = email.split("@");
  if (!domain) return "****";
  const visible = local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(2, local.length - 2))}@${domain}`;
}

// ─── Health ──────────────────────────────────────────────────────────────────

export interface SupportHealth {
  db: { ok: boolean; latencyMs: number | null };
  redis: { ok: boolean };
  openAi: { configured: boolean };
  metaWhatsApp: { configured: boolean; verifyTokenConfigured: boolean };
  elevenLabs: { configured: boolean; webhookSecretConfigured: boolean };
  lemonSqueezy: { configured: boolean };
  googleOAuth: { configured: boolean };
  checkedAt: string;
}

export async function getSystemHealth(): Promise<SupportHealth> {
  let dbOk = false;
  let latencyMs: number | null = null;
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    latencyMs = Date.now() - start;
    dbOk = true;
  } catch (err) {
    logger.error(`[SUPPORT HEALTH] db check falló: ${String(err)}`);
  }

  let redisOk = false;
  try {
    const pong = await getRedisClient().ping();
    redisOk = pong === "PONG";
  } catch {
    redisOk = false;
  }

  return {
    db: { ok: dbOk, latencyMs },
    redis: { ok: redisOk },
    openAi: { configured: Boolean(env.OPENAI_API_KEY) },
    metaWhatsApp: {
      configured: Boolean(env.META_WHATSAPP_TOKEN),
      verifyTokenConfigured: Boolean(env.META_VERIFY_TOKEN),
    },
    elevenLabs: {
      configured: Boolean(env.ELEVENLABS_API_KEY),
      webhookSecretConfigured: Boolean(env.ELEVENLABS_WEBHOOK_SECRET),
    },
    lemonSqueezy: { configured: Boolean(env.LEMONSQUEEZY_API_KEY) },
    googleOAuth: {
      configured: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    },
    checkedAt: new Date().toISOString(),
  };
}

// ─── Contexto de tenant ──────────────────────────────────────────────────────

export async function getTenantSupportContext(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      status: true,
      industry: true,
      timezone: true,
      createdAt: true,
      onboardingCompletedAt: true,
      subscription: {
        select: {
          status: true,
          billingMode: true,
          paymentStatus: true,
          currentPeriodEnd: true,
          customMonthlyMessageLimit: true,
          plan: { select: { name: true, code: true, monthlyMessageLimit: true, maxAgents: true } },
        },
      },
      agents: {
        select: {
          id: true,
          name: true,
          status: true,
          type: true,
          whatsappPhoneNumberId: true,
          whatsappDisplayPhone: true,
          allowAudioMessages: true,
          allowVoiceCalls: true,
          elevenLabsAgentId: true,
        },
      },
    },
  });
  if (!tenant) throw new AppError("Tenant no encontrado", 404);

  const now = new Date();
  const [usageCounter, productCount, openHandoffs, recentAiErrors] = await Promise.all([
    prisma.usageCounter.findFirst({
      where: { tenantId, periodStart: { lte: now }, periodEnd: { gte: now } },
      select: { totalMessages: true, inboundMessages: true, outboundMessages: true, aiTotalTokens: true },
    }),
    prisma.product.count({ where: { tenantId, isActive: true } }),
    prisma.humanHandoff.count({ where: { tenantId, status: "OPEN" } }),
    prisma.usageMetric.findMany({
      where: { tenantId, metricType: "AI_REPLY" },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { metadata: true, createdAt: true },
    }),
  ]);

  // Últimos errores de IA resumidos (sin prompts ni contenido de clientes)
  const lastErrors = recentAiErrors
    .filter((m) => {
      const meta = m.metadata as Record<string, unknown> | null;
      return meta && meta.success === false;
    })
    .slice(0, 5)
    .map((m) => ({
      at: m.createdAt,
      error: String((m.metadata as Record<string, unknown>)?.errorMessage ?? "desconocido").slice(0, 160),
    }));

  const sub = tenant.subscription;
  const messageLimit = sub?.customMonthlyMessageLimit ?? sub?.plan?.monthlyMessageLimit ?? null;

  return {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      status: tenant.status,
      industry: tenant.industry,
      timezone: tenant.timezone,
      createdAt: tenant.createdAt,
      onboardingCompleted: Boolean(tenant.onboardingCompletedAt),
    },
    plan: sub
      ? {
          name: sub.plan?.name ?? "—",
          code: sub.plan?.code ?? null,
          subscriptionStatus: sub.status,
          billingMode: sub.billingMode,
          paymentStatus: sub.paymentStatus,
          currentPeriodEnd: sub.currentPeriodEnd,
        }
      : null,
    usage: {
      messagesUsed: usageCounter?.totalMessages ?? 0,
      messagesLimit: messageLimit,
      inbound: usageCounter?.inboundMessages ?? 0,
      outbound: usageCounter?.outboundMessages ?? 0,
      aiTokens: usageCounter?.aiTotalTokens ?? 0,
    },
    agents: tenant.agents.map((a) => ({
      id: a.id,
      name: a.name,
      status: a.status,
      type: a.type,
      whatsappConfigured: Boolean(a.whatsappPhoneNumberId),
      displayPhone: maskPhone(a.whatsappDisplayPhone),
      allowAudioMessages: a.allowAudioMessages,
      voiceLinked: Boolean(a.elevenLabsAgentId),
      allowVoiceCalls: a.allowVoiceCalls,
    })),
    catalog: { activeItems: productCount },
    inbox: { openHandoffs },
    lastAiErrors: lastErrors,
  };
}

// ─── Contexto de usuario ─────────────────────────────────────────────────────

export async function getUserSupportContext(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      authProvider: true,
      tenantId: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
  if (!user) throw new AppError("Usuario no encontrado", 404);

  return {
    id: user.id,
    name: user.name,
    email: maskEmail(user.email),
    role: user.role,
    status: user.status,
    authProvider: user.authProvider,
    tenantId: user.tenantId,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

// ─── Contexto de conversación (sin contenido de mensajes) ───────────────────

export async function getConversationSupportContext(conversationId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      tenantId: true,
      status: true,
      channel: true,
      customerName: true,
      whatsappPhone: true,
      createdAt: true,
      lastMessageAt: true,
      lastInboundAt: true,
      lastOutboundAt: true,
      metadata: true,
      agent: { select: { name: true, status: true } },
      _count: { select: { messages: true, handoffs: true, appointments: true, quotes: true } },
    },
  });
  if (!conversation) throw new AppError("Conversación no encontrada", 404);

  const [inbound, outbound, openHandoff] = await Promise.all([
    prisma.message.count({ where: { conversationId, direction: "INBOUND" } }),
    prisma.message.count({ where: { conversationId, direction: "OUTBOUND" } }),
    prisma.humanHandoff.findFirst({
      where: { conversationId, status: "OPEN" },
      select: { id: true, reason: true, createdAt: true },
    }),
  ]);

  const meta =
    conversation.metadata && typeof conversation.metadata === "object" && !Array.isArray(conversation.metadata)
      ? (conversation.metadata as Record<string, unknown>)
      : {};

  return {
    id: conversation.id,
    tenantId: conversation.tenantId,
    status: conversation.status,
    channel: conversation.channel,
    customerName: conversation.customerName,
    customerPhone: maskPhone(conversation.whatsappPhone),
    agent: conversation.agent ? { name: conversation.agent.name, status: conversation.agent.status } : null,
    createdAt: conversation.createdAt,
    lastMessageAt: conversation.lastMessageAt,
    lastInboundAt: conversation.lastInboundAt,
    lastOutboundAt: conversation.lastOutboundAt,
    messages: { total: conversation._count.messages, inbound, outbound },
    handoffs: conversation._count.handoffs,
    openHandoff,
    appointments: conversation._count.appointments,
    quotes: conversation._count.quotes,
    // Clasificación del runtime (intent/outcome/costControl), sin contenido
    qualityState: (meta.qualityState as Record<string, unknown>) ?? null,
    qualityMetrics: (meta.qualityMetrics as Record<string, unknown>) ?? null,
  };
}
