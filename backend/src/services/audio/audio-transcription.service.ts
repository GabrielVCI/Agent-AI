import { Prisma } from "@prisma/client";
import { toFile } from "openai";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { getOpenAIClient } from "../../config/openai.js";
import { bumpUsage } from "../billing.service.js";
import { elevenLabsAudioProvider } from "./elevenlabs-audio.service.js";
import type {
  AudioProviderName,
  AudioTranscriptionInput,
  AudioTranscriptionProvider,
} from "./audio-provider.interface.js";

/**
 * Orquestador de transcripción de audios de WhatsApp.
 *
 * Regla de arquitectura: ElevenLabs escucha, OpenAI razona. OpenAI (Whisper)
 * solo toca audio si AUDIO_TRANSCRIPTION_PROVIDER=openai explícitamente o si
 * ALLOW_OPENAI_AUDIO_FALLBACK=true y ElevenLabs no está disponible/falló.
 *
 * El consumo se registra separado de los minutos de llamadas (CallLog):
 *   - UsageCounter.audioTranscriptionSeconds (agregado por periodo)
 *   - UsageMetric AUDIO_TRANSCRIPTION (evento individual con provider/estado)
 */

/** Whisper como proveedor de respaldo; nunca es el camino por defecto. */
const openAiAudioProvider: AudioTranscriptionProvider = {
  name: "openai",

  isConfigured(): boolean {
    return Boolean(env.OPENAI_API_KEY);
  },

  async transcribe(input: AudioTranscriptionInput) {
    const client = getOpenAIClient();
    if (!client) throw new Error("OPENAI_API_KEY no configurada");

    const file = await toFile(input.buffer, input.filename ?? "audio.ogg", {
      type: input.mimeType,
    });
    const res = await client.audio.transcriptions.create({
      file,
      model: env.OPENAI_TRANSCRIPTION_MODEL,
    });

    const text = (res.text ?? "").trim();
    if (!text) throw new Error("Whisper devolvió transcripción vacía");
    return { text, durationSeconds: null };
  },
};

export type TranscriptionOutcome =
  | { status: "SUCCESS"; text: string; provider: AudioProviderName; durationSeconds: number | null }
  | { status: "FAILED"; provider: AudioProviderName | null; error: string }
  | { status: "DISABLED" };

/**
 * Transcribe un audio según AUDIO_TRANSCRIPTION_PROVIDER. Nunca lanza: el
 * webhook decide la respuesta al cliente según el estado devuelto.
 */
export async function transcribeAudio(input: AudioTranscriptionInput): Promise<TranscriptionOutcome> {
  const providerSetting = env.AUDIO_TRANSCRIPTION_PROVIDER;

  if (providerSetting === "disabled") return { status: "DISABLED" };

  if (providerSetting === "openai") {
    return runProvider(openAiAudioProvider, input);
  }

  // Default: elevenlabs
  if (elevenLabsAudioProvider.isConfigured()) {
    const result = await runProvider(elevenLabsAudioProvider, input);
    if (result.status === "SUCCESS") return result;

    // ElevenLabs falló: Whisper solo si el fallback está permitido explícitamente
    if (env.ALLOW_OPENAI_AUDIO_FALLBACK && openAiAudioProvider.isConfigured()) {
      logger.warn("[AUDIO] ElevenLabs falló; usando fallback Whisper (permitido por env)");
      return runProvider(openAiAudioProvider, input);
    }
    return result;
  }

  // ElevenLabs no configurado
  if (env.ALLOW_OPENAI_AUDIO_FALLBACK && openAiAudioProvider.isConfigured()) {
    logger.warn("[AUDIO] ELEVENLABS_API_KEY ausente; usando fallback Whisper (permitido por env)");
    return runProvider(openAiAudioProvider, input);
  }

  return {
    status: "FAILED",
    provider: null,
    error: "ELEVENLABS_API_KEY no configurada y el fallback OpenAI está deshabilitado",
  };
}

async function runProvider(
  provider: AudioTranscriptionProvider,
  input: AudioTranscriptionInput
): Promise<TranscriptionOutcome> {
  try {
    const out = await provider.transcribe(input);
    return {
      status: "SUCCESS",
      text: out.text,
      provider: provider.name,
      durationSeconds: out.durationSeconds,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error(`[AUDIO] transcripción falló (${provider.name}): ${error}`);
    return { status: "FAILED", provider: provider.name, error };
  }
}

/**
 * Registra el consumo de una transcripción de audio de WhatsApp.
 * Separado de voiceCallUsage (CallLog/minutos): esto es audioTranscriptionUsage.
 * Tolerante a fallos: nunca interrumpe la respuesta al cliente.
 */
export async function recordAudioTranscriptionUsage(input: {
  tenantId: string;
  agentId?: string | null;
  conversationId?: string | null;
  provider: AudioProviderName | null;
  durationSeconds: number | null;
  success: boolean;
  error?: string | null;
}): Promise<void> {
  try {
    await prisma.usageMetric.create({
      data: {
        tenantId: input.tenantId,
        agentId: input.agentId ?? null,
        metricType: "AUDIO_TRANSCRIPTION",
        quantity: 1,
        metadata: {
          provider: input.provider,
          durationSeconds: input.durationSeconds,
          success: input.success,
          errorMessage: input.error ?? null,
          conversationId: input.conversationId ?? null,
        } as Prisma.InputJsonValue,
      },
    });
    if (input.success && input.durationSeconds && input.durationSeconds > 0) {
      await bumpUsage(input.tenantId, { audioTranscriptionSeconds: input.durationSeconds });
    }
  } catch (err) {
    logger.error(`[AUDIO] no se pudo registrar consumo de transcripción: ${String(err)}`);
  }
}
