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

  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
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
