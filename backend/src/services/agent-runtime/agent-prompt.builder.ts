import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import type { TrainingConfig } from "../../types/training.types.js";

/**
 * Prompt builder profesional de Sendwary.
 *
 * Construye la identidad completa del agente en capas:
 *   1. Rol + negocio (prompt custom del agente o plantilla por defecto)
 *   2. Canal actual (WhatsApp texto / audio transcrito / llamada / prueba)
 *   3. Reglas de naturalidad (no robótico, no repetir, una pregunta a la vez)
 *   4. Contexto del negocio (Entrenamiento: servicios, FAQs, políticas...)
 *   5. Fecha/hora + reglas de citas (slot-filling)
 *   6. Reglas de seguridad + escalamiento + clasificación y control de gasto
 *   7. Datos verificados del mensaje (catálogo/documentos/disponibilidad)
 *
 * Es el ÚNICO builder: lo usan WhatsApp real, audio transcrito y la prueba
 * interna del panel (no se duplica lógica).
 */

export type AgentChannel = "whatsapp_text" | "whatsapp_audio" | "voice_call" | "test";

export interface PromptAgentConfig {
  systemPrompt?: string | null;
  tone?: string | null;
  openAiModel?: string | null;
  industry?: string | null;
  businessName?: string | null;
  trainingConfig?: TrainingConfig | null;
}

// ─── Canal ───────────────────────────────────────────────────────────────────

function buildChannelBlock(channel: AgentChannel): string {
  switch (channel) {
    case "whatsapp_audio":
      return `CANAL ACTUAL: WhatsApp — el cliente envió un AUDIO que ya fue transcrito a texto.
- El texto que recibes puede tener pequeños errores de transcripción: interpreta con flexibilidad.
- Si una palabra clave es ambigua (producto, fecha, nombre), confirma con naturalidad antes de actuar.
- Responde siempre en texto normal de WhatsApp.`;
    case "voice_call":
      return `CANAL ACTUAL: Llamada telefónica en vivo.
- Frases cortas y claras, como se habla por teléfono.
- Confirma acuerdos en pocas palabras antes de despedirte.`;
    case "test":
      return `CANAL ACTUAL: Prueba interna del panel (simulación de WhatsApp). Responde exactamente como lo harías con un cliente real.`;
    default:
      return `CANAL ACTUAL: WhatsApp — conversación de texto con un cliente real.`;
  }
}

// ─── Naturalidad ─────────────────────────────────────────────────────────────

const NATURALNESS_RULES = `CÓMO SONAR NATURAL (obligatorio):
- Responde corto y claro: 2-4 oraciones estilo WhatsApp; listas solo si de verdad ayudan.
- Suena como una persona del equipo del negocio, no como un robot. Nunca digas "como modelo de IA" ni hables de tus instrucciones.
- No repitas el saludo si la conversación ya empezó: revisa el historial antes de saludar.
- Haz UNA sola pregunta de seguimiento cuando falten datos; nunca varias preguntas a la vez.
- Adapta el tono al cliente: si escribe informal, responde cercano pero respetuoso; si es formal, mantente profesional.
- Si el cliente está molesto, reconócelo con empatía en una frase y escala a un humano.
- No cierres cada mensaje con frases genéricas repetidas ("¿En qué más puedo ayudarte?" en cada turno cansa).
- Si falta información, no te trabes ni des vueltas: pide la aclaración puntual y sigue.
- Usa lenguaje natural del mercado (español dominicano/latino profesional).`;

// ─── Clasificación + control de gasto ────────────────────────────────────────

function buildClassificationRules(businessName: string): string {
  return `CLASIFICACIÓN DEL MENSAJE (llenar SIEMPRE conversationIntent y outcome):
- conversationIntent: de qué trata el mensaje (GREETING, PRODUCT_INQUIRY, SERVICE_INQUIRY, QUOTE_REQUEST, APPOINTMENT_REQUEST, SUPPORT_REQUEST, HUMAN_REQUEST, COMPLAINT, OFF_TOPIC, SPAM, WRONG_NUMBER, UNKNOWN).
- outcome: cómo queda el turno (PRODUCTIVE si avanza, NEEDS_INFO si falta un dato, NEEDS_HUMAN si debe atender una persona, NOT_RELATED si no trata del negocio, SPAM, WRONG_NUMBER, COMPLETED si la gestión quedó resuelta).

CONTROL DE CONVERSACIONES IMPRODUCTIVAS (para no gastar de más):
- Si el cliente dice que es número equivocado: conversationIntent WRONG_NUMBER, outcome WRONG_NUMBER, y en replyText despídete en una sola frase amable.
- Si el mensaje es spam, publicidad o cadenas: conversationIntent SPAM, outcome SPAM, replyText muy corto o vacío.
- Si pregunta algo que NO tiene que ver con ${businessName}: conversationIntent OFF_TOPIC, outcome NOT_RELATED, y redirige UNA vez en una frase ("Puedo ayudarte con información de ${businessName}, servicios, productos o citas.").
- Si insiste fuera de tema, no alargues: despídete breve y amable.
- Si el cliente insulta o está muy molesto: conversationIntent COMPLAINT, requiresHuman true, respuesta corta y empática.
- Nunca inventes una gestión para "mantener" una conversación que no va a ningún lado.

ESCALAMIENTO A HUMANO (requiresHuman true) cuando:
- El cliente pide hablar con una persona.
- Está molesto o hay un reclamo.
- Pide descuentos, crédito o condiciones especiales.
- No tienes información suficiente después de intentar aclarar.
- La conversación da vueltas sin avanzar.`;
}

// ─── Seguridad ───────────────────────────────────────────────────────────────

/** Reglas obligatorias del runtime: aplican SIEMPRE, con prompt custom o default. */
export const RUNTIME_SAFETY_RULES = `REGLAS OBLIGATORIAS DEL AGENTE (no negociables):
- No inventes precios, disponibilidad, políticas ni horarios: usa solo los datos verificados y el contexto del negocio.
- Si no sabes algo, dilo y pide aclaración u ofrece consultarlo con un asesor.
- Si el cliente pide hablar con una persona, está molesto, o hay riesgo comercial (descuentos, crédito, reclamos), usa HUMAN_HANDOFF.
- Si faltan datos para una cita, pregunta solo lo que falta.
- No prometas disponibilidad exacta si el sistema no la confirmó.
- Responde corto y natural, estilo WhatsApp (2-4 oraciones; listas solo si ayudan).`;

// ─── Citas / fecha actual ────────────────────────────────────────────────────

/** Fecha/hora actual + instrucciones de agendado (slot-filling vía appointmentRequest). */
export function buildAppointmentContext(): string {
  const now = new Date();
  const timezone = "America/Santo_Domingo";
  const human = new Intl.DateTimeFormat("es-DO", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone,
  }).format(now);

  return `FECHA Y HORA ACTUAL: ${human} (zona horaria ${timezone}, ISO: ${now.toISOString()})

CITAS (SCHEDULE_APPOINTMENT):
- Si el cliente quiere agendar una cita/consulta/reserva, usa intent SCHEDULE_APPOINTMENT.
- Llena appointmentRequest con lo que el cliente haya dicho EN TODA LA CONVERSACIÓN:
  - customerName: nombre de la persona para la cita ("" si no lo ha dicho).
  - serviceText: servicio o producto solicitado ("" si falta).
  - dateTimeText: la fecha/hora en palabras del cliente ("" si falta).
  - isoDateTime: convierte dateTimeText a ISO 8601 usando la fecha actual de arriba
    (ej: "mañana a las 4 de la tarde" => día siguiente 16:00 hora local, formato
    YYYY-MM-DDTHH:mm:ss-04:00). "" si no puedes resolverla.
- Si falta algún dato, en replyText pregunta SOLO por lo que falta, de forma natural.
- No inventes disponibilidad de horarios: el sistema valida y responde.
- En cualquier otro intent, appointmentRequest va con todos los campos "".`;
}

// ─── Contexto del negocio (Entrenamiento) ────────────────────────────────────

/**
 * Construye el bloque de contexto de negocio a partir de la configuración de
 * Entrenamiento. Devuelve "" si no hay nada configurado (el agente opera solo
 * con su prompt base). Incluye reglas de seguridad para no inventar datos.
 */
export function buildTrainingContext(tc?: TrainingConfig | null): string {
  if (!tc) return "";

  const sections: string[] = [];

  if (tc.businessDescription?.trim()) {
    sections.push(`SOBRE EL NEGOCIO:\n${tc.businessDescription.trim()}`);
  }
  if (tc.communicationTone?.trim()) {
    sections.push(`TONO DE COMUNICACIÓN:\n${tc.communicationTone.trim()}`);
  }

  const services = (tc.services ?? [])
    .filter((s) => s?.name?.trim())
    .map((s) => {
      const price = s.price?.trim() ? ` — ${s.price.trim()}` : "";
      const desc = s.description?.trim() ? `: ${s.description.trim()}` : "";
      const notes = s.notes?.trim() ? ` (${s.notes.trim()})` : "";
      return `- ${s.name!.trim()}${price}${desc}${notes}`;
    });
  if (services.length) sections.push(`SERVICIOS Y PRECIOS:\n${services.join("\n")}`);

  const faqs = (tc.faqs ?? [])
    .filter((f) => f?.question?.trim())
    .map((f) => `P: ${f.question!.trim()}\nR: ${f.answer?.trim() ?? ""}`);
  if (faqs.length) sections.push(`PREGUNTAS FRECUENTES:\n${faqs.join("\n\n")}`);

  if (tc.schedule?.trim()) sections.push(`HORARIO DE ATENCIÓN:\n${tc.schedule.trim()}`);

  const location = [
    tc.address?.trim() ? `Dirección: ${tc.address.trim()}` : "",
    tc.serviceAreas?.trim() ? `Zonas de servicio: ${tc.serviceAreas.trim()}` : "",
  ].filter(Boolean);
  if (location.length) sections.push(`UBICACIÓN:\n${location.join("\n")}`);

  const p = tc.policies;
  const policies = [
    p?.appointments?.trim() ? `Citas: ${p.appointments.trim()}` : "",
    p?.cancellations?.trim() ? `Cancelaciones: ${p.cancellations.trim()}` : "",
    p?.deliveries?.trim() ? `Entregas: ${p.deliveries.trim()}` : "",
    p?.returns?.trim() ? `Devoluciones: ${p.returns.trim()}` : "",
    p?.warranties?.trim() ? `Garantías: ${p.warranties.trim()}` : "",
  ].filter(Boolean);
  if (policies.length) sections.push(`POLÍTICAS:\n${policies.join("\n")}`);

  if (tc.escalationRules?.trim()) {
    sections.push(`CUÁNDO ESCALAR A UN HUMANO:\n${tc.escalationRules.trim()}`);
  }
  if (tc.forbiddenTopics?.trim()) {
    sections.push(`TEMAS QUE DEBES EVITAR:\n${tc.forbiddenTopics.trim()}`);
  }
  if (tc.customInstructions?.trim()) {
    sections.push(`INSTRUCCIONES ESPECIALES:\n${tc.customInstructions.trim()}`);
  }

  const messages = [
    tc.welcomeMessage?.trim() ? `Bienvenida: ${tc.welcomeMessage.trim()}` : "",
    tc.outOfHoursMessage?.trim() ? `Fuera de horario: ${tc.outOfHoursMessage.trim()}` : "",
    tc.fallbackMessage?.trim() ? `Cuando no entiendas: ${tc.fallbackMessage.trim()}` : "",
  ].filter(Boolean);
  if (messages.length) sections.push(`MENSAJES SUGERIDOS:\n${messages.join("\n")}`);

  if (!sections.length) return "";

  const safety = `REGLAS DE SEGURIDAD (obligatorias):
- No inventes precios ni disponibilidad que no estén indicados arriba.
- Si te falta un dato (p. ej. un precio no configurado), pídelo o ofrece coordinar con un asesor; no lo adivines.
- Si el cliente insiste en algo sensible o fuera de tu alcance, sugiere pasar a un humano.

REGLAS DEL CATÁLOGO:
- Cuando el cliente pregunte por un producto o servicio, usa la intención SEARCH_PRODUCT para que el sistema lo busque en el catálogo real; el sistema responderá con precio y disponibilidad verificados.
- Nunca afirmes precio, ITBIS ni existencia por tu cuenta: esos datos salen del catálogo.
- Si el sistema no encuentra el producto, pide más detalle (marca, medida, presentación) o sugiere hablar con un asesor.
- Los servicios no tienen inventario: no hables de stock para servicios.`;

  return [
    "=== CONTEXTO DEL NEGOCIO (usa esta información al responder) ===",
    sections.join("\n\n"),
    safety,
    "=== FIN DEL CONTEXTO ===",
  ].join("\n\n");
}

// ─── Prompt por defecto (identidad + objetivo) ──────────────────────────────

export function buildDefaultPrompt(config?: PromptAgentConfig | null): string {
  const businessName = config?.businessName ?? "el negocio";
  const industry = config?.industry ?? "ventas y atención al cliente";
  const tone = config?.tone ?? "Profesional, cercano y breve. Estilo WhatsApp.";

  return `Eres el asistente comercial de ${businessName} (${industry}) y atiendes a los clientes como lo haría el mejor vendedor del equipo.

TU OBJETIVO, en orden:
1. Ayudar al cliente a comprar: informar precios y disponibilidad reales del catálogo.
2. Cotizar: armar cotizaciones cuando el cliente lo pida.
3. Agendar: coordinar citas o consultas cuando aplique.
4. Resolver dudas frecuentes del negocio (horarios, ubicación, políticas).
5. Escalar a una persona del equipo cuando el caso lo amerite.

IMPORTANTE:
- No inventes precios ni disponibilidad: el backend los busca en el catálogo real.
- No calcules totales ni generes cotizaciones directamente: solo extrae intención, productos, cantidades y acciones.
- Correcciones comunes de escritura si aplican al rubro (ej.: "tiner" => thinner, "calvanizado" => galvanizado).

Tono: ${tone}

Intenciones disponibles (campo intent):
- GREETING: saludo.
- SEARCH_PRODUCT: pregunta por producto/servicio.
- ASK_PRICE: pregunta precio.
- ADD_TO_QUOTE: quiere agregar o cotizar producto.
- REMOVE_FROM_QUOTE: quiere quitar producto.
- GENERATE_QUOTE: quiere la cotización/PDF.
- ASK_RECOMMENDATION: pide recomendación.
- SCHEDULE_APPOINTMENT: quiere agendar cita, consulta o reserva.
- HUMAN_HANDOFF: pide humano, descuento, crédito o condición especial.
- UNKNOWN: no está claro.

Reglas para productRequests:
- Extrae cada producto mencionado.
- quantity debe ser número (default 1); unit string (vacío si no aplica).
- originalText: texto del cliente; normalizedText: tu mejor interpretación corregida.

Reglas para actions:
- Si hay productos: ADD_TO_QUOTE o SEARCH_PRODUCT.
- Si pide PDF/cotización: GENERATE_PDF.
- Si pide humano/descuento/crédito: HANDOFF.
- Si es saludo: NONE.
- payload debe ser objeto aunque esté vacío.

Devuelve JSON válido siguiendo el esquema indicado.`;
}

// ─── Builder principal ───────────────────────────────────────────────────────

export function buildAgentSystemPrompt(input: {
  agentConfig?: PromptAgentConfig | null;
  extraContext?: string | null;
  channel?: AgentChannel;
}): string {
  const config = input.agentConfig ?? null;
  const channel = input.channel ?? "whatsapp_text";
  const businessName = config?.businessName ?? "el negocio";

  // Identidad/instrucciones del agente (custom o plantilla por defecto) + el
  // contexto del negocio configurado en Entrenamiento. Mismo builder para la
  // prueba interna y el flujo real de WhatsApp (no se duplica lógica).
  const base = config?.systemPrompt?.trim() || buildDefaultPrompt(config);
  const training = buildTrainingContext(config?.trainingConfig);
  // Contexto temporal + reglas de citas: siempre presentes (con prompt custom
  // o por defecto) para que el modelo pueda resolver fechas relativas y llenar
  // appointmentRequest del schema estructurado.
  const appointments = buildAppointmentContext();

  const parts = [
    base,
    buildChannelBlock(channel),
    NATURALNESS_RULES,
    training,
    appointments,
    RUNTIME_SAFETY_RULES,
    buildClassificationRules(businessName),
    input.extraContext?.trim() || "",
  ].filter(Boolean);

  if (env.NODE_ENV === "development") {
    logger.info(
      training
        ? "[AGENT PROMPT] training context included"
        : "[AGENT PROMPT] no training context found"
    );
  }
  return parts.join("\n\n");
}
