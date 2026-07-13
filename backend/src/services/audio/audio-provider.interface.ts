/**
 * Contrato de proveedores de transcripción de audio.
 *
 * Separación de responsabilidades de Sendwary:
 *   - ElevenLabs: escuchar/transcribir audio (proveedor principal).
 *   - OpenAI: SOLO texto (razonamiento y respuesta). Whisper queda como
 *     fallback opcional controlado por ALLOW_OPENAI_AUDIO_FALLBACK.
 */

export type AudioProviderName = "elevenlabs" | "openai";

export interface AudioTranscriptionInput {
  buffer: Buffer;
  mimeType: string;
  /** Nombre de archivo sugerido para el multipart (ej. "audio.ogg"). */
  filename?: string;
}

export interface AudioTranscriptionOutput {
  text: string;
  /** Duración detectada del audio en segundos (null si el proveedor no la reporta). */
  durationSeconds: number | null;
}

export interface AudioTranscriptionProvider {
  readonly name: AudioProviderName;
  isConfigured(): boolean;
  transcribe(input: AudioTranscriptionInput): Promise<AudioTranscriptionOutput>;
}
