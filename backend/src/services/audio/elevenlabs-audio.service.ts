import axios from "axios";
import FormData from "form-data";
import { env } from "../../config/env.js";
import type {
  AudioTranscriptionInput,
  AudioTranscriptionOutput,
  AudioTranscriptionProvider,
} from "./audio-provider.interface.js";

/**
 * Speech-to-text con ElevenLabs (Scribe) para audios de WhatsApp.
 *
 * - La API key vive SOLO en backend (header xi-api-key); jamás se loguea.
 * - Endpoint: POST {ELEVENLABS_BASE_URL}/v1/speech-to-text (multipart).
 * - La duración se toma de los timestamps de palabras cuando la API los
 *   devuelve; si no, queda null y el consumo se registra sin segundos.
 */

type ElevenLabsSttResponse = {
  text?: string;
  language_code?: string;
  words?: { text?: string; start?: number; end?: number }[];
};

function describeSttError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const detail =
      (err.response?.data as { detail?: { message?: string } | string } | undefined)?.detail;
    const message = typeof detail === "string" ? detail : detail?.message ?? err.message;
    return `ElevenLabs STT ${status ?? "error"}: ${message}`;
  }
  return err instanceof Error ? err.message : String(err);
}

export const elevenLabsAudioProvider: AudioTranscriptionProvider = {
  name: "elevenlabs",

  isConfigured(): boolean {
    return Boolean(env.ELEVENLABS_API_KEY);
  },

  async transcribe(input: AudioTranscriptionInput): Promise<AudioTranscriptionOutput> {
    if (!env.ELEVENLABS_API_KEY) {
      throw new Error("ELEVENLABS_API_KEY no configurada");
    }

    const form = new FormData();
    form.append("file", input.buffer, {
      filename: input.filename ?? "audio.ogg",
      contentType: input.mimeType,
    });
    form.append("model_id", env.ELEVENLABS_AUDIO_TRANSCRIPTION_MODEL);

    try {
      const res = await axios.post<ElevenLabsSttResponse>(
        `${env.ELEVENLABS_BASE_URL}/v1/speech-to-text`,
        form,
        {
          headers: { "xi-api-key": env.ELEVENLABS_API_KEY, ...form.getHeaders() },
          timeout: 60_000,
          maxBodyLength: 25 * 1024 * 1024,
        }
      );

      const text = (res.data.text ?? "").trim();
      if (!text) throw new Error("ElevenLabs STT devolvió transcripción vacía");

      const words = res.data.words;
      const lastEnd =
        Array.isArray(words) && words.length > 0 ? words[words.length - 1]?.end : undefined;
      const durationSeconds =
        typeof lastEnd === "number" && Number.isFinite(lastEnd)
          ? Math.max(1, Math.ceil(lastEnd))
          : null;

      return { text, durationSeconds };
    } catch (err) {
      throw new Error(describeSttError(err));
    }
  },
};
