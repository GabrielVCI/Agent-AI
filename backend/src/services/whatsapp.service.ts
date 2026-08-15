import { Prisma } from "@prisma/client";
import {
  findOrCreateActiveConversation,
  findOrCreateCustomer,
  getConversationHistory,
  saveInboundMessage,
  saveOutboundAgentMessage,
  updateConversationLastMessage,
} from "./conversation.service.js";
import { findOrCreateQuoteForConversation } from "./quote.service.js";
import { runAgentRuntime } from "./agent-runtime/agent-runtime.service.js";
import { bumpUsage, checkAiAllowance, getCurrentPeriod, getTenantActiveSubscription } from "./billing.service.js";
import { downloadWhatsappMedia } from "./meta-whatsapp.service.js";
import {
  recordAudioTranscriptionUsage,
  transcribeAudio,
} from "./audio/audio-transcription.service.js";
import { prisma } from "../config/prisma.js";
import { logger } from "../config/logger.js";
import type {
  IncomingWhatsappInput,
  WhatsappIncomingResponse,
} from "../types/whatsapp.types.js";
import type { TrainingConfig } from "../types/training.types.js";

/** Respuesta única para mensajes que aún no procesamos (audio/imagen/etc.). */
export const UNSUPPORTED_MESSAGE_FALLBACK =
  "Por ahora puedo ayudarte mejor si me escribes tu solicitud en texto.";

/** Aviso al cliente cuando el plan del negocio agotó su cuota (una vez por mes). */
export const PLAN_LIMIT_FALLBACK =
  "En este momento el servicio automático no está disponible. Un asesor dará seguimiento a tu mensaje.";

/** Respuesta cuando la transcripción del audio falló (sin crashear el webhook). */
export const AUDIO_TRANSCRIPTION_FAILED_FALLBACK =
  "No pude entender bien el audio. ¿Puedes enviarlo nuevamente o escribir tu solicitud por aquí?";

/**
 * Flujo cuando el tenant excedió su plan: sin OpenAI ni respuesta automática.
 * La conversación queda marcada para atención humana (handoff OPEN) y el
 * cliente recibe el aviso controlado una sola vez por periodo.
 */
async function handleBlockedByPlan(input: {
  tenantId: string;
  conversationId: string;
  customerId: string;
  inputPreview: string;
}): Promise<WhatsappIncomingResponse> {
  const periodKey = getCurrentPeriod().start.toISOString().slice(0, 7); // "2026-07"

  // Cola de atención humana (aparece en el filtro "Esperando humano")
  const existingHandoff = await prisma.humanHandoff.findFirst({
    where: { conversationId: input.conversationId, status: "OPEN" },
  });
  if (!existingHandoff) {
    await prisma.humanHandoff.create({
      data: {
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        reason: "Límite mensual del plan alcanzado: la IA automática está pausada",
        status: "OPEN",
      },
    });
  }

  await updateConversationLastMessage({
    conversationId: input.conversationId,
    preview: input.inputPreview,
    requiresHuman: true,
  });

  // Aviso al cliente una sola vez por mes (flag en metadata de la conversación)
  const conversation = await prisma.conversation.findUnique({
    where: { id: input.conversationId },
    select: { metadata: true },
  });
  const meta =
    conversation?.metadata && typeof conversation.metadata === "object" && !Array.isArray(conversation.metadata)
      ? { ...(conversation.metadata as Record<string, unknown>) }
      : {};

  const alreadyNotified = meta.billingLimitNoticePeriod === periodKey;

  if (!alreadyNotified) {
    meta.billingLimitNoticePeriod = periodKey;
    await prisma.conversation.update({
      where: { id: input.conversationId },
      data: { metadata: meta as Prisma.InputJsonValue },
    });
    // Nota interna de sistema para el operador (visible en el hilo)
    await prisma.message.create({
      data: {
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        direction: "OUTBOUND",
        senderType: "SYSTEM",
        messageType: "TEXT",
        textContent: "⚠️ Límite mensual del plan alcanzado. La IA automática está pausada para este negocio.",
        metadata: { source: "billing-limit" } as Prisma.InputJsonValue,
      },
    });
    await saveOutboundAgentMessage({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      textContent: PLAN_LIMIT_FALLBACK,
      metadata: { source: "billing-limit" } as Prisma.InputJsonValue,
    });
    await bumpUsage(input.tenantId, { outboundMessages: 1 });
  }

  return {
    success: true,
    replyText: alreadyNotified ? "" : PLAN_LIMIT_FALLBACK,
    actions: [],
    customerId: input.customerId,
    conversationId: input.conversationId,
    quoteId: null,
    pdfUrl: null,
    pdfPath: null,
    pdfFilename: null,
    requiresHuman: true,
    skipReply: alreadyNotified,
  };
}

/** Mapea el tipo de WhatsApp al enum MessageType de Prisma (sin tocar schema). */
function mapWhatsappTypeToMessageType(
  type: string
): "AUDIO" | "IMAGE" | "DOCUMENT" | "TEXT" {
  switch (type) {
    case "audio":
    case "voice":
      return "AUDIO";
    case "image":
    case "sticker":
      return "IMAGE";
    case "document":
    case "video":
      return "DOCUMENT";
    default:
      return "TEXT";
  }
}

/**
 * Maneja un mensaje entrante NO de texto (audio, imagen, documento, sticker...).
 *
 * En esta fase no transcribimos audio ni descargamos media: solo guardamos el
 * mensaje (con su tipo real y metadata) y decidimos si procede enviar un
 * fallback de texto. No se llama a OpenAI. Si la conversación está en modo
 * humano, NO se envía respuesta automática (el operador atiende).
 */
export async function handleUnsupportedWhatsappMessage(input: {
  tenantId: string;
  agentId?: string;
  phone: string;
  customerName?: string;
  messageId: string;
  messageType: string;
  timestamp?: string;
}): Promise<{ sendFallback: boolean; conversationId: string }> {
  const { tenantId, agentId } = input;

  const customer = await findOrCreateCustomer({
    tenantId,
    phone: input.phone,
    customerName: input.customerName,
  });

  const { conversation } = await findOrCreateActiveConversation({
    tenantId,
    customerId: customer.id,
    agentId: agentId ?? undefined,
    whatsappPhone: input.phone,
    customerName: input.customerName,
  });

  await saveInboundMessage({
    tenantId,
    conversationId: conversation.id,
    textContent: null,
    messageType: mapWhatsappTypeToMessageType(input.messageType),
    whatsappMessageId: input.messageId,
    metadata: {
      source: "whatsapp",
      unsupported: true,
      whatsappType: input.messageType,
      timestamp: input.timestamp,
      rawCustomerName: input.customerName,
    } as Prisma.InputJsonValue,
  });

  await updateConversationLastMessage({
    conversationId: conversation.id,
    preview: `[${input.messageType}]`,
  });

  // En modo humano no respondemos automáticamente: solo dejamos el registro.
  if (conversation.status === "HUMAN_ACTIVE") {
    logger.info(
      `[WHATSAPP WEBHOOK] human mode active, skipping unsupported fallback: ${conversation.id}`
    );
    return { sendFallback: false, conversationId: conversation.id };
  }

  return { sendFallback: true, conversationId: conversation.id };
}

/**
 * Audio de WhatsApp: descargar de Meta → transcribir con ElevenLabs →
 * pasar el texto al runtime textual (OpenAI) → responder por WhatsApp.
 *
 * OpenAI nunca recibe el audio: solo el texto ya transcrito. Whisper actúa
 * únicamente como fallback si ALLOW_OPENAI_AUDIO_FALLBACK=true.
 * Nunca lanza hacia el webhook: cualquier fallo degrada a un mensaje
 * controlado y queda registrado en la metadata del mensaje.
 */
export async function handleIncomingWhatsappAudioMessage(input: {
  tenantId: string;
  agentId?: string;
  agentConfig?: any;
  phone: string;
  customerName?: string;
  messageId: string;
  mediaId?: string;
  timestamp?: string;
  // Credenciales del tenant para descargar el media de Meta (webhook multi-tenant)
  credentials?: import("./meta-whatsapp.service.js").SendCredentials;
}): Promise<WhatsappIncomingResponse> {
  const { tenantId, agentId } = input;

  const customer = await findOrCreateCustomer({
    tenantId,
    phone: input.phone,
    customerName: input.customerName,
  });

  const { conversation } = await findOrCreateActiveConversation({
    tenantId,
    customerId: customer.id,
    agentId: agentId ?? undefined,
    whatsappPhone: input.phone,
    customerName: input.customerName,
  });

  // Guarda el mensaje AUDIO (con o sin transcripción). La URL temporal de
  // Meta jamás se persiste: solo el mediaId y el resultado de transcripción.
  const saveAudioMessage = async (extra: {
    transcriptionText?: string | null;
    transcriptionStatus: "SUCCESS" | "FAILED" | "SKIPPED" | "DISABLED";
    transcriptionProvider?: string | null;
    audioDurationSeconds?: number | null;
    transcriptionError?: string | null;
    skippedReason?: string | null;
  }) => {
    await saveInboundMessage({
      tenantId,
      conversationId: conversation.id,
      textContent: null,
      messageType: "AUDIO",
      transcriptionText: extra.transcriptionText ?? null,
      whatsappMessageId: input.messageId,
      metadata: {
        source: "whatsapp",
        whatsappType: "audio",
        mediaId: input.mediaId ?? null,
        timestamp: input.timestamp,
        rawCustomerName: input.customerName,
        transcriptionStatus: extra.transcriptionStatus,
        transcriptionProvider: extra.transcriptionProvider ?? null,
        audioDurationSeconds: extra.audioDurationSeconds ?? null,
        transcriptionError: extra.transcriptionError ?? null,
        skippedReason: extra.skippedReason ?? null,
      } as Prisma.InputJsonValue,
    });
    await bumpUsage(tenantId, { inboundMessages: 1 });
  };

  // Respuesta controlada (fallback) que sí queda en el hilo del inbox.
  const replyWithFallback = async (text: string): Promise<WhatsappIncomingResponse> => {
    await saveOutboundAgentMessage({
      tenantId,
      conversationId: conversation.id,
      textContent: text,
      metadata: { source: "audio-fallback" } as Prisma.InputJsonValue,
    });
    await bumpUsage(tenantId, { outboundMessages: 1 });
    await updateConversationLastMessage({
      conversationId: conversation.id,
      preview: text.slice(0, 120),
    });
    return {
      success: true,
      replyText: text,
      actions: [],
      customerId: customer.id,
      conversationId: conversation.id,
      quoteId: null,
      pdfUrl: null,
      pdfPath: null,
      pdfFilename: null,
      requiresHuman: false,
      skipReply: false,
    };
  };

  const silentResult = (requiresHuman: boolean): WhatsappIncomingResponse => ({
    success: true,
    replyText: "",
    actions: [],
    customerId: customer.id,
    conversationId: conversation.id,
    quoteId: null,
    pdfUrl: null,
    pdfPath: null,
    pdfFilename: null,
    requiresHuman,
    skipReply: true,
  });

  // 1) Modo humano: se guarda el audio, no se transcribe ni se responde.
  if (conversation.status === "HUMAN_ACTIVE") {
    logger.info(`[WHATSAPP AUDIO] human mode active, audio guardado sin transcribir: ${conversation.id}`);
    await saveAudioMessage({ transcriptionStatus: "SKIPPED", skippedReason: "human_mode" });
    await updateConversationLastMessage({
      conversationId: conversation.id,
      preview: "🎤 Audio recibido",
    });
    return silentResult(true);
  }

  // 2) Gating por agente y plan: sin permiso de audio → fallback de texto.
  const agentAllowsAudio = Boolean(
    input.agentConfig?.allowAudioMessages ??
      (agentId
        ? (await prisma.agent.findFirst({ where: { id: agentId, tenantId }, select: { allowAudioMessages: true } }))
            ?.allowAudioMessages
        : false)
  );
  let planAllowsAudio = true;
  try {
    const sub = await getTenantActiveSubscription(tenantId);
    planAllowsAudio = sub.plan?.allowAudioTranscription ?? true;
  } catch {
    // fail-open: un fallo de lectura de plan nunca tumba el flujo de audio
  }

  if (!agentAllowsAudio || !planAllowsAudio) {
    logger.info(
      `[WHATSAPP AUDIO] audio no permitido (agente=${agentAllowsAudio}, plan=${planAllowsAudio}) tenant=${tenantId}`
    );
    await saveAudioMessage({
      transcriptionStatus: "SKIPPED",
      skippedReason: !agentAllowsAudio ? "agent_audio_disabled" : "plan_audio_disabled",
    });
    return replyWithFallback(UNSUPPORTED_MESSAGE_FALLBACK);
  }

  // 3) Enforcement de plan (cuota mensual) ANTES de gastar transcripción.
  const allowance = await checkAiAllowance(tenantId);
  if (!allowance.allowed) {
    logger.warn(
      `[BILLING LIMIT] tenant ${tenantId} bloqueado para IA automática (${allowance.reason}: ${allowance.detail})`
    );
    await saveAudioMessage({ transcriptionStatus: "SKIPPED", skippedReason: "plan_limit" });
    return handleBlockedByPlan({
      tenantId,
      conversationId: conversation.id,
      customerId: customer.id,
      inputPreview: "🎤 Audio recibido",
    });
  }

  // 4) Descarga desde Meta + transcripción (ElevenLabs por defecto).
  if (!input.mediaId) {
    await saveAudioMessage({
      transcriptionStatus: "FAILED",
      transcriptionError: "El webhook no incluyó media id del audio",
    });
    return replyWithFallback(AUDIO_TRANSCRIPTION_FAILED_FALLBACK);
  }

  let media: { buffer: Buffer; mimeType: string } | null = null;
  try {
    media = await downloadWhatsappMedia(input.mediaId, input.credentials);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error(`[WHATSAPP AUDIO] descarga de media falló (${input.mediaId}): ${error}`);
    await saveAudioMessage({ transcriptionStatus: "FAILED", transcriptionError: `download: ${error}` });
    await recordAudioTranscriptionUsage({
      tenantId,
      agentId,
      conversationId: conversation.id,
      provider: null,
      durationSeconds: null,
      success: false,
      error: `download: ${error}`,
    });
    return replyWithFallback(AUDIO_TRANSCRIPTION_FAILED_FALLBACK);
  }

  const outcome = await transcribeAudio({
    buffer: media.buffer,
    mimeType: media.mimeType,
    filename: "whatsapp-audio.ogg",
  });

  // 5) Proveedor deshabilitado: pedir el mensaje en texto.
  if (outcome.status === "DISABLED") {
    await saveAudioMessage({ transcriptionStatus: "DISABLED", skippedReason: "provider_disabled" });
    return replyWithFallback(UNSUPPORTED_MESSAGE_FALLBACK);
  }

  // 6) Transcripción falló: fallback controlado (sin pasar audio a OpenAI).
  if (outcome.status === "FAILED") {
    await saveAudioMessage({
      transcriptionStatus: "FAILED",
      transcriptionProvider: outcome.provider,
      transcriptionError: outcome.error,
    });
    await recordAudioTranscriptionUsage({
      tenantId,
      agentId,
      conversationId: conversation.id,
      provider: outcome.provider,
      durationSeconds: null,
      success: false,
      error: outcome.error,
    });
    return replyWithFallback(AUDIO_TRANSCRIPTION_FAILED_FALLBACK);
  }

  // 7) Éxito: guardar transcript, registrar consumo y responder con el
  // runtime textual de siempre (OpenAI solo ve texto).
  logger.info(
    `[WHATSAPP AUDIO] transcrito con ${outcome.provider} (${outcome.durationSeconds ?? "?"}s): ${conversation.id}`
  );
  await saveAudioMessage({
    transcriptionText: outcome.text,
    transcriptionStatus: "SUCCESS",
    transcriptionProvider: outcome.provider,
    audioDurationSeconds: outcome.durationSeconds,
  });
  await recordAudioTranscriptionUsage({
    tenantId,
    agentId,
    conversationId: conversation.id,
    provider: outcome.provider,
    durationSeconds: outcome.durationSeconds,
    success: true,
  });

  return respondWithAgentRuntime({
    tenantId,
    agentId,
    agentConfig: input.agentConfig,
    conversationId: conversation.id,
    customerId: customer.id,
    customerName: customer.name,
    phone: input.phone,
    customerText: outcome.text,
    inputPreview: `🎤 ${outcome.text.slice(0, 110)}`,
    channel: "whatsapp_audio",
  });
}

/**
 * Resuelve tenant + agente para un phone_number_id entrante (webhook).
 *
 * Orden de resolución:
 * 1. Agente del tenant con ese número asignado (caso normal).
 * 2. WhatsAppIntegration CONNECTED con ese número → agente activo del mismo
 *    tenant. Cubre al cliente que conectó su número (o se lo conectamos en
 *    modo guiado) pero aún no ejecutó el paso de "asignar agente": antes esos
 *    mensajes se perdían en silencio.
 * Nunca cruza tenants: el phoneNumberId es único global en ambas tablas.
 */
export async function resolveAgentByPhoneNumberId(
  phoneNumberId: string
): Promise<{ tenantId: string; agentId: string; agent: any } | null> {
  if (!phoneNumberId) return null;

  const agent = await prisma.agent.findFirst({
    where: {
      whatsappPhoneNumberId: phoneNumberId,
      status: "ACTIVE",
      tenant: { status: "ACTIVE" },
    },
    include: { tenant: true },
  });

  if (agent) {
    return { tenantId: agent.tenantId, agentId: agent.id, agent };
  }

  const integration = await prisma.whatsAppIntegration.findUnique({
    where: { phoneNumberId },
    select: { tenantId: true, status: true },
  });
  if (!integration || integration.status !== "CONNECTED") return null;

  const fallbackAgent = await prisma.agent.findFirst({
    where: {
      tenantId: integration.tenantId,
      status: "ACTIVE",
      tenant: { status: "ACTIVE" },
    },
    orderBy: { createdAt: "asc" },
    include: { tenant: true },
  });
  if (!fallbackAgent) return null;

  logger.warn(
    `[WHATSAPP WEBHOOK] número ${phoneNumberId} sin agente asignado: se usa el agente activo ${fallbackAgent.name} del tenant ${integration.tenantId}. Asigna el número en el panel para fijar el ruteo.`
  );
  return { tenantId: fallbackAgent.tenantId, agentId: fallbackAgent.id, agent: fallbackAgent };
}

export async function handleIncomingWhatsappMessage(
  input: IncomingWhatsappInput & { tenantId: string; agentId?: string; agentConfig?: any }
): Promise<WhatsappIncomingResponse> {
  const { tenantId, agentId } = input;

  const customer = await findOrCreateCustomer({
    tenantId,
    phone: input.phone,
    customerName: input.customerName,
  });

  const { conversation, created } = await findOrCreateActiveConversation({
    tenantId,
    customerId: customer.id,
    agentId: agentId ?? undefined,
    whatsappPhone: input.phone,
    customerName: input.customerName,
  });

  logger.info(
    `[WHATSAPP WEBHOOK] conversación ${created ? "creada" : "encontrada"}: ${conversation.id} (estado: ${conversation.status})`
  );

  // If conversation is HUMAN_ACTIVE, don't let the bot respond
  if (conversation.status === "HUMAN_ACTIVE") {
    logger.info(
      `[WHATSAPP WEBHOOK] conversation is HUMAN_ACTIVE, skipping AI: ${conversation.id}`
    );
    await saveInboundMessage({
      tenantId,
      conversationId: conversation.id,
      textContent: input.message,
      whatsappMessageId: input.messageId,
      metadata: {
        source: "whatsapp",
        timestamp: input.timestamp,
        rawCustomerName: input.customerName,
      } as Prisma.InputJsonValue,
    });
    logger.info(`[WHATSAPP WEBHOOK] inbound saved: ${conversation.id}`);
    await bumpUsage(tenantId, { inboundMessages: 1 });

    // El mensaje queda registrado para el operador; reflejamos en la lista.
    await updateConversationLastMessage({
      conversationId: conversation.id,
      preview: input.message.slice(0, 120),
    });

    return {
      success: true,
      replyText: "",
      actions: [],
      customerId: customer.id,
      conversationId: conversation.id,
      quoteId: null,
      pdfUrl: null,
      pdfPath: null,
      pdfFilename: null,
      requiresHuman: true,
      skipReply: true,
    };
  }

  await saveInboundMessage({
    tenantId,
    conversationId: conversation.id,
    textContent: input.message,
    whatsappMessageId: input.messageId,
    metadata: {
      source: "whatsapp",
      timestamp: input.timestamp,
      rawCustomerName: input.customerName,
    } as Prisma.InputJsonValue,
  });
  logger.info(`[WHATSAPP WEBHOOK] inbound saved: ${conversation.id}`);
  await bumpUsage(tenantId, { inboundMessages: 1 });

  return respondWithAgentRuntime({
    tenantId,
    agentId,
    agentConfig: input.agentConfig,
    conversationId: conversation.id,
    customerId: customer.id,
    customerName: customer.name,
    phone: input.phone,
    customerText: input.message,
    inputPreview: input.message.slice(0, 120),
    channel: "whatsapp_text",
  });
}

/**
 * Flujo compartido de respuesta IA (texto ya limpio): enforcement de plan →
 * cotización → historial → runtime → outbound → preview. Lo usan el flujo de
 * texto y el de audio (con la transcripción como customerText).
 */
async function respondWithAgentRuntime(input: {
  tenantId: string;
  agentId?: string;
  agentConfig?: any;
  conversationId: string;
  customerId: string;
  customerName?: string | null;
  phone: string;
  customerText: string;
  inputPreview: string;
  channel: "whatsapp_text" | "whatsapp_audio";
}): Promise<WhatsappIncomingResponse> {
  const { tenantId, agentId } = input;

  // ── Enforcement de plan: si el tenant agotó su cuota mensual, la IA no
  // responde. El mensaje ya quedó guardado y la conversación pasa a la cola
  // de atención humana. El aviso al cliente se envía UNA sola vez por mes.
  const allowance = await checkAiAllowance(tenantId);
  if (!allowance.allowed) {
    logger.warn(
      `[BILLING LIMIT] tenant ${tenantId} bloqueado para IA automática (${allowance.reason}: ${allowance.detail})`
    );
    return handleBlockedByPlan({
      tenantId,
      conversationId: input.conversationId,
      customerId: input.customerId,
      inputPreview: input.inputPreview,
    });
  }

  const quote = await findOrCreateQuoteForConversation({
    tenantId,
    customerId: input.customerId,
    conversationId: input.conversationId,
    agentId: agentId ?? undefined,
  });

  const history = await getConversationHistory(input.conversationId);

  // Runtime IA unificado: contexto verificado → decisión → acciones → uso.
  // (El mismo que usa la prueba interna del panel; aquí con efectos reales.)
  // OpenAI SOLO recibe texto: los audios llegan aquí ya transcritos
  // (transcriptionText hace de content en el historial).
  const runtime = await runAgentRuntime({
    tenantId,
    agentId: agentId ?? null,
    conversationId: input.conversationId,
    customerMessage: input.customerText,
    customerName: input.customerName,
    customerPhone: input.phone,
    source: "WHATSAPP",
    channel: input.channel,
    quoteId: quote.id,
    quoteNumber: quote.quoteNumber,
    conversationHistory: history.map((m) => ({
      direction: m.direction,
      senderType: m.senderType,
      content: m.textContent ?? m.transcriptionText ?? "",
    })),
    agentConfig: input.agentConfig
      ? {
          systemPrompt: input.agentConfig.systemPrompt,
          tone: input.agentConfig.tone,
          openAiModel: input.agentConfig.openAiModel,
          industry: input.agentConfig.tenant?.industry,
          businessName: input.agentConfig.tenant?.name,
          trainingConfig:
            (input.agentConfig.tenant?.trainingConfig as unknown as TrainingConfig | null) ??
            undefined,
        }
      : undefined,
  });

  const decision = runtime.decision;
  const actionResult = runtime;

  logger.info(
    `[WHATSAPP WEBHOOK] respuesta IA generada (intent: ${decision.intent}, clasificación: ${runtime.conversationIntent}/${runtime.outcome}, modelo: ${runtime.model}, ok: ${runtime.success}, requiereHumano: ${runtime.requiresHuman}${runtime.costControlReason ? `, control de gasto: ${runtime.costControlReason}` : ""})`
  );

  // Silencio deliberado (spam reincidente, etc.): no se guarda outbound ni se
  // envía nada; el runtime ya registró métricas y cerró la conversación.
  if (runtime.skipReply) {
    await updateConversationLastMessage({
      conversationId: input.conversationId,
      preview: input.inputPreview,
      requiresHuman: runtime.requiresHuman,
    });
    return {
      success: true,
      replyText: "",
      actions: decision.actions,
      customerId: input.customerId,
      conversationId: input.conversationId,
      quoteId: quote.id,
      pdfUrl: null,
      pdfPath: null,
      pdfFilename: null,
      requiresHuman: runtime.requiresHuman,
      skipReply: true,
    };
  }

  await saveOutboundAgentMessage({
    tenantId,
    conversationId: input.conversationId,
    textContent: actionResult.replyText,
    metadata: {
      source: "ai-agent",
      quoteId: quote.id,
      decision: decision as any,
      quality: {
        conversationIntent: runtime.conversationIntent,
        outcome: runtime.outcome,
        productive: runtime.productive,
        costControlReason: runtime.costControlReason,
      },
    } as Prisma.InputJsonValue,
  });
  logger.info(`[WHATSAPP WEBHOOK] outbound saved: ${input.conversationId}`);
  await bumpUsage(tenantId, { outboundMessages: 1 });

  await updateConversationLastMessage({
    conversationId: input.conversationId,
    preview: actionResult.replyText.slice(0, 120),
    requiresHuman: runtime.requiresHuman,
  });

  return {
    success: true,
    replyText: actionResult.replyText,
    actions: decision.actions,
    customerId: input.customerId,
    conversationId: input.conversationId,
    quoteId: quote.id,
    pdfUrl: actionResult.pdfUrl,
    pdfPath: actionResult.pdfPath,
    pdfFilename: actionResult.pdfFilename,
    requiresHuman: runtime.requiresHuman,
    skipReply: false,
  };
}
