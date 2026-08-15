import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Ambiente lógico. Staging corre con NODE_ENV=production (build optimizado,
  // cookies Secure) pero necesita distinguirse para logs, banners y flags.
  APP_ENV: z.enum(["development", "staging", "production"]).default("development"),
  PORT: z.coerce.number().default(3002),
  BACKEND_PUBLIC_URL: z.string().url().default("http://localhost:3002"),
  CORS_ORIGIN: z.string().default("http://localhost:5173,http://localhost:5678"),
  STORAGE_PATH: z.string().default("../storage"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatoria"),

  REDIS_URL: z.string().default("redis://localhost:6379"),

  SESSION_COOKIE_NAME: z.string().default("sid"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET debe tener al menos 32 caracteres"),
  COOKIE_DOMAIN: z.string().optional(),
  /**
   * SameSite de la cookie de sesión.
   * - "auto" (default): conserva el comportamiento histórico → strict en
   *   producción, lax en desarrollo. NO cambia nada de lo ya desplegado.
   * - "none": obligatorio cuando el frontend y la API están en dominios
   *   DISTINTOS (Netlify + Railway). Requiere Secure; el navegador descarta
   *   una cookie SameSite=None sin Secure.
   * - "lax" / "strict": forzado explícito.
   */
  COOKIE_SAMESITE: z.enum(["auto", "lax", "strict", "none"]).default("auto"),
  /** Fuerza el flag Secure. Por defecto se activa solo con NODE_ENV=production. */
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
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
  // v21.0 es el default nuevo. Las integraciones ya creadas guardan su propia
  // versión en WhatsAppIntegration.graphApiVersion, así que no se ven afectadas.
  META_GRAPH_API_VERSION: z.string().default("v21.0"),
  // Solo dev/demo: permite responder con el token global cuando el tenant no
  // tiene WhatsAppIntegration CONNECTED. En producción debe ser false: cada
  // cliente usa su propio token de Meta (nunca el de la plataforma).
  ALLOW_GLOBAL_META_TOKEN_FALLBACK: z
    .string()
    .default("false")
    .transform((v) => v === "true" || v === "1"),

  // ── Onboarding de WhatsApp (multi-modo) ──
  // Conexión guiada. Mientras no haya Embedded Signup aprobado ni contrato BSP,
  // el modo guiado opera como "asistido por el equipo Sendwary" (ticket).
  WHATSAPP_EASY_ONBOARDING_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v !== "false" && v !== "0"),
  // Embedded Signup de Meta: solo se activa cuando la app está aprobada
  // (advanced access de whatsapp_business_management + _messaging).
  // APP_SECRET y SYSTEM_USER_ACCESS_TOKEN jamás salen del backend.
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_EMBEDDED_SIGNUP_CONFIG_ID: z.string().optional(),
  // Token del System User de la app (acciones a nivel plataforma: suscribir
  // webhooks cuando el token del cliente no alcanza). NUNCA al frontend.
  META_SYSTEM_USER_ACCESS_TOKEN: z.string().optional(),
  // Business Portfolio de Sendwary (dueño de la app).
  META_BUSINESS_ID: z.string().optional(),
  // App secret usado para validar la firma X-Hub-Signature-256 del webhook.
  // Si no se define cae a META_APP_SECRET.
  META_WEBHOOK_APP_SECRET: z.string().optional(),
  // Nombre nuevo del verify token del webhook; compat con META_VERIFY_TOKEN.
  META_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  // Acepta los dos nombres: META_EMBEDDED_SIGNUP_ENABLED (nuevo) y
  // WHATSAPP_EMBEDDED_SIGNUP_ENABLED (el que ya usaba el proyecto).
  META_EMBEDDED_SIGNUP_ENABLED: z
    .string()
    .default("false")
    .transform((v) => v === "true" || v === "1"),
  WHATSAPP_EMBEDDED_SIGNUP_ENABLED: z
    .string()
    .default("false")
    .transform((v) => v === "true" || v === "1"),
  // BSP/partner activo (TWILIO | DIALOG360 | INFOBIP | EIGHTX8). Vacío = ninguno.
  WHATSAPP_BSP_PROVIDER: z
    .enum(["", "TWILIO", "DIALOG360", "INFOBIP", "EIGHTX8"])
    .optional()
    .default(""),
  // Modo demo: número controlado por Sendwary, SOLO pruebas.
  WHATSAPP_DEMO_ENABLED: z
    .string()
    .default("false")
    .transform((v) => v === "true" || v === "1"),
  WHATSAPP_DEMO_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_DEMO_DISPLAY_NUMBER: z.string().optional(),
  WHATSAPP_DEMO_MESSAGE_LIMIT: z.coerce.number().int().positive().default(50),

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
  // Buy-links hosteados (fallback cuando no hay API key). Soportan overlay
  // (?embed=1) y custom data por query (?checkout[custom][tenant_id]=...).
  // OJO test vs live: los links de test mode son distintos a los de producción.
  LEMONSQUEEZY_BASIC_CHECKOUT_URL: z.string().url().optional(),
  LEMONSQUEEZY_PRO_CHECKOUT_URL: z.string().url().optional(),
  LEMONSQUEEZY_ENTERPRISE_CHECKOUT_URL: z.string().url().optional(),
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

  // ── Email transaccional ──
  // Proveedor principal: Resend. SMTP queda como alternativa soportada.
  // Sin proveedor configurado: en development se loguea un preview seguro
  // (destinatario, asunto, url) y el flujo NUNCA falla por falta de correo;
  // en producción el envío devuelve un error controlado.
  //
  // OJO: la variable de la API key es RESEND_APIKEY (no RESEND_API_KEY).
  // Es el nombre ya configurado en este proyecto — no renombrar.
  EMAIL_PROVIDER: z.enum(["resend", "smtp", "log"]).default("resend"),
  RESEND_APIKEY: z.string().optional(),
  // Remitente: debe usar un dominio verificado en Resend.
  EMAIL_FROM: z.string().default("Sendwary <no-reply@sendwary.com>"),
  SUPPORT_EMAIL: z.string().default("soporte@sendwary.com"),
  SENDWARY_LOGO_URL: z.string().url().optional(),

  // SMTP (alternativa a Resend; se usa si EMAIL_PROVIDER=smtp)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  // Compat: si no se define EMAIL_FROM se usa SMTP_FROM.
  SMTP_FROM: z.string().optional(),
  SMTP_SECURE: z
    .string()
    .default("false")
    .transform((v) => v === "true" || v === "1"),

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

const data = parsedEnv.data;

// ── Cookie de sesión: se resuelve UNA vez y se reutiliza en set y clear ──
// Si los atributos de clearCookie no coinciden con los del set, el navegador
// no borra la cookie y el logout deja la sesión viva.
const cookieSecure = data.COOKIE_SECURE ?? data.NODE_ENV === "production";
const cookieSameSite: "lax" | "strict" | "none" =
  data.COOKIE_SAMESITE === "auto"
    ? data.NODE_ENV === "production"
      ? "strict"
      : "lax"
    : data.COOKIE_SAMESITE;

// SameSite=None sin Secure es descartada por todos los navegadores modernos.
if (cookieSameSite === "none" && !cookieSecure) {
  console.error(
    "❌ COOKIE_SAMESITE=none requiere COOKIE_SECURE=true (o NODE_ENV=production). " +
      "El navegador descartaría la cookie de sesión y nadie podría iniciar sesión."
  );
  process.exit(1);
}

// Embedded Signup encendido pero incompleto: se apaga y se avisa fuerte, en
// vez de fallar en silencio cuando un cliente pulsa "Conectar con Meta".
const embeddedSignupOn = data.META_EMBEDDED_SIGNUP_ENABLED || data.WHATSAPP_EMBEDDED_SIGNUP_ENABLED;
if (embeddedSignupOn) {
  const missing = (
    [
      ["META_APP_ID", data.META_APP_ID],
      ["META_APP_SECRET", data.META_APP_SECRET],
      ["META_EMBEDDED_SIGNUP_CONFIG_ID", data.META_EMBEDDED_SIGNUP_CONFIG_ID],
    ] as const
  )
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length > 0) {
    console.error(
      `❌ Embedded Signup está ENCENDIDO pero faltan variables: ${missing.join(", ")}. ` +
        "El flujo quedará deshabilitado (la UI mostrará el fallback de asistencia)."
    );
  }
}

export const env = {
  ...data,
  corsOrigins: data.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean),
  /** Atributos de la cookie de sesión, ya resueltos para este ambiente. */
  cookieSecure,
  cookieSameSite,
  /** true en staging Y producción: ambos corren build de producción. */
  isDeployed: data.APP_ENV !== "development",
};

/**
 * Atributos que IDENTIFICAN la cookie de sesión. `res.cookie` y
 * `res.clearCookie` deben usar exactamente los mismos: si difieren, el
 * navegador no borra la cookie y el logout deja la sesión viva.
 *
 * Vive aquí (y no en el controlador de auth) para que los middlewares puedan
 * usarlo sin crear un import circular.
 */
export function sessionCookieAttrs() {
  return {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: cookieSameSite,
    ...(data.COOKIE_DOMAIN ? { domain: data.COOKIE_DOMAIN } : {}),
    path: "/",
  };
}
