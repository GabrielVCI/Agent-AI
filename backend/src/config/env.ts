import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3002),
  BACKEND_PUBLIC_URL: z.string().url().default("http://localhost:3002"),
  CORS_ORIGIN: z.string().default("http://localhost:5173,http://localhost:5678"),
  STORAGE_PATH: z.string().default("../storage"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatoria"),

  REDIS_URL: z.string().default("redis://localhost:6379"),

  SESSION_COOKIE_NAME: z.string().default("sid"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET debe tener al menos 32 caracteres"),
  COOKIE_DOMAIN: z.string().optional(),
  SESSION_TTL_SECONDS: z.coerce.number().default(60 * 60 * 24 * 7), // 7 days

  ENCRYPTION_KEY: z.string().length(64, "ENCRYPTION_KEY debe ser 64 caracteres hex (32 bytes)").optional(),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  OPENAI_DEFAULT_MODEL: z.string().default("gpt-4.1-mini"),
  OPENAI_FALLBACK_MODEL: z.string().default("gpt-4.1-mini"),
  OPENAI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(800),
  OPENAI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.3),
  OPENAI_TRANSCRIPTION_MODEL: z.string().default("whisper-1"),

  META_VERIFY_TOKEN: z.string().optional(),
  META_WHATSAPP_TOKEN: z.string().optional(),
  META_PHONE_NUMBER_ID: z.string().optional(),
  META_GRAPH_API_VERSION: z.string().default("v20.0"),

  APP_BASE_URL: z.string().url().default("http://localhost:3002"),
  // URL del panel (frontend) para redirecciones post-OAuth.
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),

  // Google OAuth2 (opcional — si faltan, /api/auth/google redirige al login con aviso)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  // Alias aceptado (algunas guías lo llaman así); tiene el mismo efecto.
  GOOGLE_CALLBACK_URL: z.string().url().optional(),

  // LemonSqueezy (opcional — sin credenciales, create-checkout responde 503
  // "Billing provider not configured" y el resto del sistema funciona igual)
  LEMONSQUEEZY_API_KEY: z.string().optional(),
  LEMONSQUEEZY_STORE_ID: z.string().optional(),
  LEMONSQUEEZY_WEBHOOK_SECRET: z.string().optional(),
  LEMONSQUEEZY_BASIC_VARIANT_ID: z.string().optional(),
  LEMONSQUEEZY_PRO_VARIANT_ID: z.string().optional(),
  LEMONSQUEEZY_ENTERPRISE_VARIANT_ID: z.string().optional(),
  LEMONSQUEEZY_SUCCESS_URL: z.string().url().optional(),
  LEMONSQUEEZY_CANCEL_URL: z.string().url().optional(),

  // ── Llamadas IA (ElevenLabs) — modelo de costos configurable ──
  // La API key NUNCA se expone al frontend. Sin ella no hay llamadas reales,
  // pero el control de minutos/entitlement funciona igual.
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_WEBHOOK_SECRET: z.string().optional(),
  ELEVENLABS_DEFAULT_AGENT_ID: z.string().optional(),
  ELEVENLABS_BASE_URL: z.string().url().default("https://api.elevenlabs.io"),
  // Modelo de speech-to-text de ElevenLabs para audios de WhatsApp.
  ELEVENLABS_AUDIO_TRANSCRIPTION_MODEL: z.string().default("scribe_v1"),
  // Proveedor de transcripción de audios de WhatsApp:
  //   elevenlabs (default) | openai | disabled
  AUDIO_TRANSCRIPTION_PROVIDER: z.enum(["elevenlabs", "openai", "disabled"]).default("elevenlabs"),
  // Solo si es true se permite usar OpenAI (Whisper) como fallback cuando
  // ElevenLabs no está configurado o falla. Por defecto OpenAI NO toca audio.
  ALLOW_OPENAI_AUDIO_FALLBACK: z
    .string()
    .default("false")
    .transform((v) => v === "true" || v === "1"),
  // Token propio para los tool-endpoints que ElevenLabs invoca durante la
  // llamada (búsqueda de catálogo, citas...). Distinto del webhook secret.
  VOICE_TOOLS_TOKEN: z.string().optional(),
  ELEVENLABS_INCLUDED_MINUTES: z.coerce.number().default(275),
  ELEVENLABS_OVERAGE_COST_PER_MINUTE: z.coerce.number().default(0.08),
  ELEVENLABS_GEMINI_MONTHLY_COST: z.coerce.number().default(0.31),
  SENDWARY_ENTERPRISE_VOICE_BUDGET_PER_USER_USD: z.coerce.number().default(15),
  SENDWARY_DEFAULT_ENTERPRISE_VOICE_MINUTES_PER_USER: z.coerce.number().int().default(180),

  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),

  // ── Asistente IA de soporte ──
  // Token interno para que el agente de soporte (proceso externo) consuma
  // /api/support/* SIN sesión de usuario. Scopes limitados: nunca incluye
  // billing/delete/db/secrets. Sin token, /api/support queda solo-SUPER_ADMIN.
  SUPPORT_AGENT_TOKEN: z.string().min(32).optional(),
  SUPPORT_AGENT_SCOPES: z
    .string()
    .default("support:read,support:triage,support:tickets:write"),

  // ── Rate limiting (configurable; Redis store si REDIS_URL responde) ──
  RATE_LIMIT_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v !== "false" && v !== "0"),
  RATE_LIMIT_GLOBAL_WINDOW_MS: z.coerce.number().int().default(15 * 60 * 1000),
  RATE_LIMIT_GLOBAL_MAX: z.coerce.number().int().default(300),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().default(10),
  RATE_LIMIT_REGISTER_MAX: z.coerce.number().int().default(5),
  RATE_LIMIT_AI_MAX: z.coerce.number().int().default(30),
  RATE_LIMIT_WEBHOOK_MAX: z.coerce.number().int().default(1000),
  RATE_LIMIT_ADMIN_MAX: z.coerce.number().int().default(200),
  RATE_LIMIT_ADMIN_SENSITIVE_MAX: z.coerce.number().int().default(30),
  RATE_LIMIT_BILLING_MAX: z.coerce.number().int().default(20),
  RATE_LIMIT_UPLOAD_MAX: z.coerce.number().int().default(30),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("❌ Error en variables de entorno:");
  console.error(parsedEnv.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsedEnv.data,
  corsOrigins: parsedEnv.data.CORS_ORIGIN.split(",").map((o) => o.trim()),
};
