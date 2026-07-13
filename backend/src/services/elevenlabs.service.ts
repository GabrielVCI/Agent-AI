import axios, { AxiosInstance } from "axios";
import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { AppError } from "../middlewares/error.middleware.js";
import { recordVoiceUsage, getTenantVoiceEntitlement } from "./voice.service.js";
import { describeAvailability, getAppointmentSettings } from "./appointment.service.js";
import { findOrCreateCustomer } from "./conversation.service.js";
import { evaluateCallQuality } from "./call-quality.service.js";

/**
 * Integración con ElevenLabs Conversational AI (llamadas).
 *
 * - La API key vive SOLO en backend (header xi-api-key); jamás se loguea.
 * - El loop de voz en tiempo real lo maneja ElevenLabs; Sendwary sincroniza el
 *   prompt del agente (identidad + entrenamiento + catálogo + disponibilidad)
 *   y recibe el resultado por webhook post-call (firmado HMAC).
 * - Las herramientas en vivo (catálogo/citas) se exponen como tool-endpoints
 *   protegidos por token propio (ver voice tools en voice.controller).
 */

export function isElevenLabsConfigured(): boolean {
  return Boolean(env.ELEVENLABS_API_KEY);
}

function client(): AxiosInstance {
  if (!env.ELEVENLABS_API_KEY) {
    throw new AppError("ElevenLabs no está configurado en el servidor", 503);
  }
  return axios.create({
    baseURL: env.ELEVENLABS_BASE_URL,
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY },
    timeout: 20_000,
  });
}

/** Mensaje de error seguro (sin filtrar headers/keys de la request). */
function describeAxiosError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const detail =
      (err.response?.data as { detail?: { message?: string } } | undefined)?.detail?.message ??
      err.message;
    return `ElevenLabs ${status ?? "error"}: ${detail}`;
  }
  return err instanceof Error ? err.message : String(err);
}

// ─── API de agentes ──────────────────────────────────────────────────────────

export async function getElevenLabsAgent(elevenLabsAgentId: string) {
  try {
    const res = await client().get(`/v1/convai/agents/${elevenLabsAgentId}`);
    return res.data;
  } catch (err) {
    throw new AppError(describeAxiosError(err), 502);
  }
}

/**
 * Prompt de voz del agente Sendwary: identidad + contexto del negocio +
 * catálogo destacado + disponibilidad + reglas duras de llamada.
 * Es una foto estática (se re-sincroniza al guardar el agente); las consultas
 * en vivo van por tools.
 */
export async function buildVoicePrompt(agentId: string, tenantId: string): Promise<string> {
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, tenantId },
    include: { tenant: true },
  });
  if (!agent) throw new AppError("Agente no encontrado", 404);

  const [items, settings] = await Promise.all([
    prisma.product.findMany({
      where: { tenantId, isActive: true },
      orderBy: { updatedAt: "desc" },
      take: 15,
    }),
    getAppointmentSettings(tenantId),
  ]);

  const catalogLines = items.map((p) => {
    const price = Number(p.price.toString());
    const tax = Number(p.taxRate.toString());
    const priceText = `RD$${price.toLocaleString("es-DO", { minimumFractionDigits: 2 })}${
      tax > 0 ? (p.priceIncludesTax ? " ITBIS incluido" : ` + ITBIS ${Math.round(tax * 10000) / 100}%`) : ""
    }`;
    const stockText =
      p.itemType === "SERVICE"
        ? "servicio"
        : p.stock && p.stock > 0
          ? `${p.stock} disponibles`
          : "confirmar disponibilidad";
    return `- ${p.name}: ${priceText} (${stockText})`;
  });

  const training = agent.tenant?.trainingConfig as Record<string, unknown> | null;
  const businessDescription =
    typeof training?.businessDescription === "string" ? training.businessDescription : "";
  const schedule = typeof training?.schedule === "string" ? training.schedule : "";

  const sections = [
    agent.systemPrompt?.trim() ||
      `Eres ${agent.name}, el asistente telefónico de ${agent.tenant?.name ?? "el negocio"}.`,
    businessDescription && `SOBRE EL NEGOCIO:\n${businessDescription}`,
    schedule && `HORARIO DE ATENCIÓN:\n${schedule}`,
    catalogLines.length > 0 &&
      `CATÁLOGO (precios verificados; usa la herramienta de catálogo para lo que no esté aquí):\n${catalogLines.join("\n")}`,
    `CITAS:\n${describeAvailability(settings)}`,
    `REGLAS DE LA LLAMADA (obligatorias):
- Habla en español, frases cortas y naturales para teléfono.
- No inventes precios, disponibilidad ni políticas: usa las herramientas o di que lo confirmarás.
- Para agendar una cita usa la herramienta de citas; nunca la des por confirmada sin usarla.
- Si el cliente pide un humano, está molesto o pide descuentos/crédito, usa la herramienta de escalado y despídete con amabilidad.
- Confirma nombre y motivo al inicio; resume acuerdos en pocas frases antes de despedirte.

CONTROL DE LLAMADAS IMPRODUCTIVAS (obligatorio):
- Si la persona dice que es número equivocado o está confundida, discúlpate en una frase y termina la llamada de inmediato.
- Si la llamada no trata sobre el negocio, redirige UNA sola vez ("Puedo ayudarte con información del negocio, productos, servicios o citas"). Si insiste fuera de tema, finaliza de forma amable.
- Si después de 2 intentos no hay una intención clara relacionada con el negocio, despídete cordialmente y termina; no prolongues conversaciones sin propósito.
- Si hay silencio prolongado o nadie responde, despídete y termina.
- No alargues la llamada con preguntas de relleno: cada minuto cuesta.`,
  ].filter(Boolean);

  return sections.join("\n\n");
}

/**
 * Sincroniza el prompt del agente Sendwary hacia su agente de ElevenLabs.
 * Tolerante: si ElevenLabs no está configurado o falla, loguea y devuelve
 * el estado sin romper el guardado del agente.
 */
export async function syncAgentToElevenLabs(
  agentId: string,
  tenantId: string
): Promise<{ synced: boolean; detail: string }> {
  const agent = await prisma.agent.findFirst({ where: { id: agentId, tenantId } });
  if (!agent) throw new AppError("Agente no encontrado", 404);
  if (!agent.elevenLabsAgentId) {
    return { synced: false, detail: "El agente no tiene ElevenLabs Agent ID asignado" };
  }
  if (!isElevenLabsConfigured()) {
    return { synced: false, detail: "ELEVENLABS_API_KEY no configurada en el servidor" };
  }

  const prompt = await buildVoicePrompt(agentId, tenantId);

  try {
    await client().patch(`/v1/convai/agents/${agent.elevenLabsAgentId}`, {
      conversation_config: {
        agent: {
          prompt: { prompt },
          language: "es",
        },
      },
    });
    logger.info(`[ELEVENLABS] prompt sincronizado agente=${agentId} → ${agent.elevenLabsAgentId}`);
    return { synced: true, detail: "Prompt sincronizado con ElevenLabs" };
  } catch (err) {
    const detail = describeAxiosError(err);
    logger.warn(`[ELEVENLABS] sync falló agente=${agentId}: ${detail}`);
    return { synced: false, detail };
  }
}

// ─── Webhook post-call ───────────────────────────────────────────────────────

/**
 * Firma de ElevenLabs: header `ElevenLabs-Signature: t=<ts>,v0=<hmac>` donde
 * hmac = HMAC-SHA256(secret, `${ts}.${rawBody}`). Rechaza timestamps de más
 * de 30 minutos para evitar replay.
 */
export function verifyElevenLabsSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined
): boolean {
  if (!env.ELEVENLABS_WEBHOOK_SECRET || !signatureHeader) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => p.split("=") as [string, string])
  );
  const timestamp = parts.t;
  const signature = parts.v0;
  if (!timestamp || !signature) return false;

  const ageMs = Math.abs(Date.now() - Number(timestamp) * 1000);
  if (!Number.isFinite(ageMs) || ageMs > 30 * 60 * 1000) return false;

  const expected = crypto
    .createHmac("sha256", env.ELEVENLABS_WEBHOOK_SECRET)
    .update(`${timestamp}.${rawBody.toString("utf8")}`)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

type PostCallPayload = {
  type?: string;
  data?: {
    agent_id?: string;
    conversation_id?: string;
    status?: string;
    transcript?: { role?: string; message?: string }[];
    metadata?: {
      call_duration_secs?: number;
      caller_number?: string;
      called_number?: string;
    };
    analysis?: { transcript_summary?: string; call_successful?: string };
    conversation_initiation_client_data?: {
      dynamic_variables?: Record<string, unknown>;
    };
  };
};

/** Transcript de ElevenLabs (array de turnos) → texto legible. */
export function mapElevenLabsTranscript(
  transcript: { role?: string; message?: string }[] | undefined
): string | null {
  if (!Array.isArray(transcript) || transcript.length === 0) return null;
  return transcript
    .filter((t) => t.message)
    .map((t) => `${t.role === "agent" ? "Agente" : "Cliente"}: ${t.message}`)
    .join("\n");
}

/** Resuelve el agente Sendwary del evento: por elevenLabsAgentId o dynamic vars. */
async function resolveSendwaryAgent(payload: PostCallPayload) {
  const elevenLabsAgentId = payload.data?.agent_id;
  if (elevenLabsAgentId) {
    const agent = await prisma.agent.findUnique({
      where: { elevenLabsAgentId },
      include: { tenant: { select: { id: true } } },
    });
    if (agent) return agent;
  }
  const tenantId = payload.data?.conversation_initiation_client_data?.dynamic_variables
    ?.tenant_id as string | undefined;
  if (tenantId) {
    return prisma.agent.findFirst({
      where: { tenantId, allowVoiceCalls: true },
      include: { tenant: { select: { id: true } } },
    });
  }
  return null;
}

/**
 * Procesa el evento post-call: registra la llamada (idempotente), descuenta
 * minutos, guarda transcript/resumen y refleja la llamada como conversación
 * de canal VOICE en el inbox. Nunca lanza por payload incompleto.
 */
export async function handlePostCallWebhook(payload: PostCallPayload) {
  const data = payload.data ?? {};
  const conversationId = data.conversation_id;
  if (payload.type && payload.type !== "post_call_transcription") {
    logger.info(`[ELEVENLABS] evento ignorado: ${payload.type}`);
    return { handled: false, reason: "EVENT_IGNORED" };
  }
  if (!conversationId) {
    logger.warn("[ELEVENLABS] webhook sin conversation_id — ignorado");
    return { handled: false, reason: "MISSING_CONVERSATION_ID" };
  }

  // Idempotencia TEMPRANA: si esta llamada ya se procesó, salir antes de
  // crear conversación/mensajes duplicados (el conversation_id es único).
  const alreadyProcessed = await prisma.callLog.findUnique({
    where: { elevenLabsCallId: conversationId },
  });
  if (alreadyProcessed) {
    logger.info(`[ELEVENLABS] post-call duplicado ignorado: ${conversationId}`);
    return {
      handled: true,
      duplicated: true,
      callId: alreadyProcessed.id,
      conversationId: alreadyProcessed.conversationId,
    };
  }

  const agent = await resolveSendwaryAgent(payload);
  if (!agent) {
    logger.warn(
      `[ELEVENLABS] llamada ${conversationId} sin agente Sendwary mapeable (agent_id=${data.agent_id ?? "?"})`
    );
    return { handled: false, reason: "AGENT_NOT_MAPPED" };
  }

  const tenantId = agent.tenantId;
  const durationSeconds = Math.max(0, Math.floor(data.metadata?.call_duration_secs ?? 0));
  const customerPhone = data.metadata?.caller_number ?? null;
  const transcript = mapElevenLabsTranscript(data.transcript);
  const summary = data.analysis?.transcript_summary ?? null;
  const failed = data.status === "failed";

  // Calidad de la llamada (Parte D): clasificación determinística del
  // transcript — productiva, improductiva, spam, silencio, número equivocado,
  // cita/cotización lograda o escalamiento a humano.
  const callQuality = evaluateCallQuality({ durationSeconds, transcript, summary, failed });
  logger.info(
    `[ELEVENLABS] calidad de llamada ${conversationId}: ${callQuality.quality} (${callQuality.reasons.join("; ")})`
  );

  // Entitlement: la llamada ya ocurrió (los minutos se consumieron en
  // ElevenLabs), así que SIEMPRE se registra; si el tenant estaba bloqueado
  // se marca en metadata para visibilidad del admin.
  const entitlement = await getTenantVoiceEntitlement(tenantId);

  // Conversación de canal VOICE en el inbox (contacto por teléfono)
  let sendwaryConversationId: string | null = null;
  if (customerPhone) {
    try {
      const customer = await findOrCreateCustomer({ tenantId, phone: customerPhone });
      const conversation = await prisma.conversation.create({
        data: {
          tenantId,
          customerId: customer.id,
          agentId: agent.id,
          whatsappPhone: customerPhone,
          customerName: customer.name,
          channel: "VOICE",
          // Si la llamada pidió humano, entra a la cola de atención en lugar
          // de cerrarse (aparece en "Esperando humano" del inbox).
          status: callQuality.requiresHuman ? "HUMAN_ACTIVE" : "CLOSED",
          lastMessageAt: new Date(),
          lastMessagePreview: summary
            ? `📞 ${summary.slice(0, 110)}`
            : `📞 Llamada de ${Math.ceil(durationSeconds / 60)} min`,
          metadata: { callQuality: callQuality.quality, callQualityReasons: callQuality.reasons } as Prisma.InputJsonValue,
        },
      });
      sendwaryConversationId = conversation.id;

      if (callQuality.requiresHuman) {
        await prisma.humanHandoff.create({
          data: {
            tenantId,
            conversationId: conversation.id,
            reason: "El cliente pidió un humano durante la llamada IA",
            status: "OPEN",
          },
        });
      }

      // El resumen (y el transcript si existe) quedan como mensajes del hilo
      await prisma.message.create({
        data: {
          tenantId,
          conversationId: conversation.id,
          direction: "OUTBOUND",
          senderType: "SYSTEM",
          messageType: "TEXT",
          textContent: `📞 Llamada ${failed ? "fallida" : "completada"} (${Math.ceil(durationSeconds / 60)} min)${summary ? `\n\nResumen: ${summary}` : ""}`,
          metadata: { source: "elevenlabs-call", elevenLabsConversationId: conversationId } as Prisma.InputJsonValue,
        },
      });
      if (transcript) {
        await prisma.message.create({
          data: {
            tenantId,
            conversationId: conversation.id,
            direction: "OUTBOUND",
            senderType: "SYSTEM",
            messageType: "TEXT",
            textContent: `Transcripción:\n${transcript.slice(0, 6000)}`,
            metadata: { source: "elevenlabs-transcript" } as Prisma.InputJsonValue,
          },
        });
      }
    } catch (err) {
      logger.warn(`[ELEVENLABS] no se pudo crear conversación VOICE: ${String(err)}`);
    }
  }

  const result = await recordVoiceUsage({
    tenantId,
    agentId: agent.id,
    conversationId: sendwaryConversationId,
    elevenLabsConversationId: conversationId,
    // conversation_id de ElevenLabs ES la clave idempotente de la llamada
    elevenLabsCallId: conversationId,
    direction: "INBOUND",
    status: failed ? "FAILED" : "COMPLETED",
    durationSeconds,
    customerPhone,
    transcript,
    summary,
    metadata: {
      elevenLabsAgentId: data.agent_id ?? null,
      calledNumber: data.metadata?.called_number ?? null,
      entitledAtCallTime: entitlement.canUseVoice,
      entitlementReason: entitlement.reason,
      // Métricas de calidad de la llamada (Parte E, sin migración)
      callQuality: callQuality.quality,
      productive: callQuality.productive,
      requiresHuman: callQuality.requiresHuman,
      callQualityReasons: callQuality.reasons,
    },
  });

  logger.info(
    `[ELEVENLABS] post-call procesado ${conversationId} tenant=${tenantId} ${Math.ceil(durationSeconds / 60)} min duplicado=${result.duplicated}`
  );

  return {
    handled: true,
    duplicated: result.duplicated,
    callId: result.call.id,
    conversationId: sendwaryConversationId,
  };
}

export async function getCallDetails(elevenLabsConversationId: string) {
  try {
    const res = await client().get(`/v1/convai/conversations/${elevenLabsConversationId}`);
    return res.data;
  } catch (err) {
    throw new AppError(describeAxiosError(err), 502);
  }
}
