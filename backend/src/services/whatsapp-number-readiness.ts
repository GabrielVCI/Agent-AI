/**
 * Preparación del número de WhatsApp.
 *
 * Traduce "¿dónde está hoy tu número?" a una recomendación honesta. La regla
 * de oro del producto: **nunca prometer que basta con escribir el número**.
 * Con la API oficial de WhatsApp eso es falso, y prometerlo genera clientes
 * frustrados y tickets evitables.
 *
 * El copy vive aquí (no en el frontend) para que el mismo texto lo vea el
 * cliente en el wizard y el equipo de soporte en el ticket.
 */

export type DeclaredNumberType =
  | "PERSONAL" // lo usa en WhatsApp normal
  | "BUSINESS_APP" // lo usa en la app WhatsApp Business
  | "CLOUD_API" // ya tiene WhatsApp Cloud API
  | "OTHER_PROVIDER" // está con un BSP/proveedor externo
  | "NEW_NUMBER"; // quiere estrenar un número dedicado

export type NumberReadiness =
  | "UNKNOWN"
  | "PERSONAL_WHATSAPP"
  | "WHATSAPP_BUSINESS_APP"
  | "CLOUD_API_READY"
  | "BSP_CONNECTED"
  | "NEW_NUMBER_RECOMMENDED"
  | "NEEDS_MIGRATION"
  | "NEEDS_ASSISTED_SETUP"
  | "CONNECTED"
  | "ERROR";

/** Acciones que el wizard puede ofrecer tras la evaluación. */
export type ReadinessAction =
  | "USE_NEW_NUMBER" // recomendarle estrenar número dedicado
  | "REQUEST_ASSISTANCE" // que el equipo Sendwary lo resuelva
  | "ADVANCED_SETUP" // ir a la configuración técnica
  | "CONNECT_WITH_META" // Embedded Signup (solo si está disponible)
  | "TRY_DEMO";

export interface ReadinessAssessment {
  readiness: NumberReadiness;
  /** Titular de la recomendación (una línea, sin jerga). */
  title: string;
  /** Explicación honesta de la situación del número. */
  message: string;
  /** Pasos concretos, en lenguaje de negocio. */
  details: string[];
  /** Acción sugerida por defecto (la primera que debería ver el cliente). */
  recommendedAction: ReadinessAction;
  actions: ReadinessAction[];
  /** true si conviene que intervenga el equipo Sendwary. */
  needsAssistance: boolean;
  /** Severidad para el ticket: cuánto trabajo humano implica. */
  supportTier: "TIER_1" | "TIER_2";
}

const OFFICIAL_PLATFORM_NOTE =
  "Para que Sendwary pueda enviar y recibir mensajes de forma segura, tu número debe estar conectado a WhatsApp Business Platform. Te guiaremos durante este proceso.";

/**
 * Evalúa el número declarado. `embeddedSignupAvailable` viene de las
 * capabilities del entorno: si la conexión con Meta todavía no está activa,
 * no se ofrece esa acción (no prometemos lo que no podemos cumplir).
 */
export function assessNumberReadiness(input: {
  declaredNumberType: DeclaredNumberType;
  embeddedSignupAvailable?: boolean;
  demoAvailable?: boolean;
}): ReadinessAssessment {
  const meta = input.embeddedSignupAvailable ? (["CONNECT_WITH_META"] as ReadinessAction[]) : [];

  switch (input.declaredNumberType) {
    case "PERSONAL":
      return {
        readiness: "PERSONAL_WHATSAPP",
        title: "Este número necesita una preparación antes de conectarse",
        message:
          "Este número no puede conectarse a Sendwary solo escribiéndolo. Para usarlo con agentes IA debe pasar por WhatsApp Business Platform, y eso implica dejar de usarlo en la app de WhatsApp normal en ese teléfono. Por eso recomendamos usar un número nuevo dedicado, o solicitar asistencia para evaluar la migración.",
        details: [
          "Un número solo puede estar en un lugar a la vez: o en la app de WhatsApp, o en la plataforma oficial para empresas.",
          "Si migras tu número personal, perderás el acceso a ese WhatsApp en tu teléfono.",
          "Un número nuevo dedicado te deja seguir usando tu WhatsApp personal con normalidad.",
          OFFICIAL_PLATFORM_NOTE,
        ],
        recommendedAction: "USE_NEW_NUMBER",
        actions: ["USE_NEW_NUMBER", "REQUEST_ASSISTANCE", "ADVANCED_SETUP"],
        needsAssistance: true,
        supportTier: "TIER_2",
      };

    case "BUSINESS_APP":
      return {
        readiness: "WHATSAPP_BUSINESS_APP",
        title: "Tu número es candidato, pero necesita el paso oficial",
        message:
          "Este número puede ser candidato para conexión, pero debe pasar por un flujo oficial de Meta o de un proveedor compatible. Sendwary puede guiarte durante la implementación.",
        details: [
          "Tu historial de chats de la app WhatsApp Business no se transfiere a la plataforma para empresas.",
          "Durante la migración el número deja de funcionar en la app y pasa a responder desde Sendwary.",
          "Si prefieres no tocar el número que ya usas, puedes empezar con uno nuevo dedicado.",
          OFFICIAL_PLATFORM_NOTE,
        ],
        recommendedAction: input.embeddedSignupAvailable ? "CONNECT_WITH_META" : "REQUEST_ASSISTANCE",
        actions: [...meta, "REQUEST_ASSISTANCE", "USE_NEW_NUMBER", "ADVANCED_SETUP"],
        needsAssistance: true,
        supportTier: "TIER_2",
      };

    case "CLOUD_API":
      return {
        readiness: "CLOUD_API_READY",
        title: "Tu número ya está listo para conectarse",
        message:
          "Como ya tienes WhatsApp Cloud API configurado, puedes ingresar tu configuración avanzada y validar la conexión en unos minutos.",
        details: [
          "Necesitarás los datos de tu cuenta de Meta: identificador del número, cuenta de WhatsApp Business y credencial de acceso.",
          "Tu credencial se guarda cifrada y nunca se vuelve a mostrar completa.",
          "Si algo no coincide, te lo diremos con un mensaje claro al validar.",
        ],
        recommendedAction: "ADVANCED_SETUP",
        actions: ["ADVANCED_SETUP", "REQUEST_ASSISTANCE"],
        needsAssistance: false,
        supportTier: "TIER_1",
      };

    case "OTHER_PROVIDER":
      return {
        readiness: "BSP_CONNECTED",
        title: "Podemos evaluar la migración desde tu proveedor actual",
        message:
          "Indícanos con qué proveedor está tu número hoy para evaluar si conviene migrarlo a Sendwary o conectarlo directamente. En la mayoría de los casos la migración es posible sin cambiar de número.",
        details: [
          "Necesitarás acceso de administrador a la cuenta donde está el número hoy.",
          "El proceso de migración lo coordina nuestro equipo contigo; no tienes que hacerlo solo.",
          "Mientras migramos, tu número sigue funcionando con tu proveedor actual.",
        ],
        recommendedAction: "REQUEST_ASSISTANCE",
        actions: ["REQUEST_ASSISTANCE", "ADVANCED_SETUP"],
        needsAssistance: true,
        supportTier: "TIER_2",
      };

    case "NEW_NUMBER":
    default:
      return {
        readiness: "NEW_NUMBER_RECOMMENDED",
        title: "La opción más rápida y segura",
        message:
          "Recomendado para una activación rápida y segura. Puedes usar un número dedicado exclusivamente a Sendwary y mantener tu número personal separado.",
        details: [
          "No pierdes acceso a ningún WhatsApp que ya uses.",
          "Sirve cualquier número que pueda recibir un SMS o una llamada de verificación (incluye líneas fijas).",
          "Nuestro equipo lo deja configurado y probado antes de la activación final.",
          OFFICIAL_PLATFORM_NOTE,
        ],
        recommendedAction: input.embeddedSignupAvailable ? "CONNECT_WITH_META" : "REQUEST_ASSISTANCE",
        actions: [...meta, "REQUEST_ASSISTANCE", ...(input.demoAvailable ? (["TRY_DEMO"] as ReadinessAction[]) : [])],
        needsAssistance: true,
        supportTier: "TIER_1",
      };
  }
}

/** Etiqueta legible del tipo declarado (para el ticket y el panel admin). */
export const NUMBER_TYPE_LABELS: Record<DeclaredNumberType, string> = {
  PERSONAL: "WhatsApp personal",
  BUSINESS_APP: "App WhatsApp Business",
  CLOUD_API: "WhatsApp Cloud API propio",
  OTHER_PROVIDER: "Otro proveedor / BSP",
  NEW_NUMBER: "Número nuevo dedicado",
};

/**
 * Enmascara un número para que salga en tickets y logs sin exponerlo entero:
 * +1 809 555 1234 → +1809****234
 */
export function maskPhoneNumber(raw: string | null | undefined): string {
  if (!raw) return "—";
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.length <= 7) return `${digits.slice(0, 2)}****`;
  return `${digits.slice(0, 4)}****${digits.slice(-3)}`;
}
