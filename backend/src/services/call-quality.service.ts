/**
 * Evaluación de calidad de llamadas IA (ElevenLabs) — Parte D.
 *
 * El loop de voz en tiempo real vive en ElevenLabs (el corte en vivo se
 * gobierna con las reglas del prompt de voz, ver buildVoicePrompt). Este
 * servicio clasifica la llamada YA TERMINADA a partir del transcript y la
 * duración que llegan por el webhook post-call, para:
 *   - marcar llamadas improductivas / spam / número equivocado,
 *   - escalar a humano cuando el cliente lo pidió,
 *   - alimentar métricas de calidad sin migración (CallLog.metadata).
 *
 * Es 100% determinístico (regex/heurísticas): no gasta tokens.
 */

export type CallQuality =
  | "PRODUCTIVE"
  | "UNPRODUCTIVE"
  | "WRONG_NUMBER"
  | "SPAM"
  | "SILENCE"
  | "NEEDS_HUMAN"
  | "SUCCESSFUL_APPOINTMENT"
  | "SUCCESSFUL_QUOTE";

export interface CallQualityEvaluation {
  quality: CallQuality;
  productive: boolean;
  requiresHuman: boolean;
  /** Señales que sustentan el veredicto (para auditoría/debug). */
  reasons: string[];
}

export interface CallQualityInput {
  durationSeconds: number;
  /** Transcript "Agente: ...\nCliente: ..." (mapElevenLabsTranscript) o null. */
  transcript: string | null;
  summary?: string | null;
  failed?: boolean;
}

/** Llamadas por debajo de este umbral sin diálogo del cliente cuentan como silencio. */
const SILENCE_MAX_SECONDS = 8;

const WRONG_NUMBER_PATTERNS = [
  /n[uú]mero equivocado/i,
  /me equivoqu[eé] de n[uú]mero/i,
  /marqu[eé] mal/i,
  /no quer[ií]a llamar (aqu[ií]|ah[ií])/i,
  /no es (el|con el) n[uú]mero/i,
];

const SPAM_PATTERNS = [
  /gana(r)? dinero (r[aá]pido|f[aá]cil|desde casa)/i,
  /invierte en (cripto|bitcoin|forex)/i,
  /has sido seleccionad[oa]/i,
  /felicidades[!,. ]+ganaste/i,
  /pr[eé]stamos? (r[aá]pidos?|sin bur[oó])/i,
  /\b(idiota|est[uú]pido|imb[eé]cil|basura|mierda|maldito|cabr[oó]n|pendejo)\b/i,
];

const HUMAN_REQUEST_PATTERNS = [
  /hablar con (una persona|un humano|alguien|un asesor|un representante|el due[nñ]o|el encargado)/i,
  /p[aá]same (con|a) (alguien|una persona|un asesor)/i,
  /quiero (un|a un) (humano|asesor|vendedor)/i,
  /no quiero hablar con (un robot|una m[aá]quina|un bot)/i,
];

const APPOINTMENT_SUCCESS_PATTERNS = [
  /cita (confirmada|registrada|agendada)/i,
  /qued[oó] (confirmada|registrada|agendada)/i,
  /te esperamos (el|para el)/i,
];

const QUOTE_SUCCESS_PATTERNS = [
  /cotizaci[oó]n (lista|generada|enviada|registrada)/i,
  /te (env[ií]o|preparo|mando) la cotizaci[oó]n/i,
];

/** Intención comercial relacionada con el negocio en boca del cliente. */
const COMMERCIAL_INTENT_PATTERNS = [
  /precio|cu[aá]nto (cuesta|vale|sale)/i,
  /producto|servicio|cat[aá]logo|inventario/i,
  /cita|agendar|reserva|turno|consulta/i,
  /cotiza|presupuesto/i,
  /comprar|pedido|encargo|entrega|env[ií]o/i,
  /horario|abren|cierran|ubicaci[oó]n|direcci[oó]n/i,
  /disponib|stock|tienen|les queda/i,
  /garant[ií]a|devoluci[oó]n|reclamo|factura/i,
];

/** Extrae solo lo que dijo el cliente (líneas "Cliente: ..."). */
function extractCustomerText(transcript: string | null): string {
  if (!transcript) return "";
  return transcript
    .split("\n")
    .filter((line) => line.trim().toLowerCase().startsWith("cliente:"))
    .map((line) => line.slice(line.indexOf(":") + 1).trim())
    .join("\n");
}

/** Extrae solo lo que dijo el agente (para detectar cierres exitosos). */
function extractAgentText(transcript: string | null): string {
  if (!transcript) return "";
  return transcript
    .split("\n")
    .filter((line) => line.trim().toLowerCase().startsWith("agente:"))
    .map((line) => line.slice(line.indexOf(":") + 1).trim())
    .join("\n");
}

export function evaluateCallQuality(input: CallQualityInput): CallQualityEvaluation {
  const reasons: string[] = [];
  const customerText = extractCustomerText(input.transcript);
  const agentText = extractAgentText(input.transcript);
  const fullText = `${customerText}\n${input.summary ?? ""}`;

  // 1) Silencio: llamada muy corta o sin una sola palabra del cliente.
  if (!customerText.trim()) {
    reasons.push(
      input.durationSeconds <= SILENCE_MAX_SECONDS
        ? `llamada de ${input.durationSeconds}s sin diálogo del cliente`
        : "el cliente nunca habló durante la llamada"
    );
    return { quality: "SILENCE", productive: false, requiresHuman: false, reasons };
  }
  if (input.durationSeconds <= SILENCE_MAX_SECONDS) {
    reasons.push(`llamada de solo ${input.durationSeconds}s`);
    return { quality: "SILENCE", productive: false, requiresHuman: false, reasons };
  }

  // 2) Número equivocado explícito.
  if (WRONG_NUMBER_PATTERNS.some((p) => p.test(customerText))) {
    reasons.push("el cliente dijo que era número equivocado");
    return { quality: "WRONG_NUMBER", productive: false, requiresHuman: false, reasons };
  }

  // 3) Spam / insultos.
  if (SPAM_PATTERNS.some((p) => p.test(customerText))) {
    reasons.push("contenido de spam o insultos en el diálogo del cliente");
    return { quality: "SPAM", productive: false, requiresHuman: false, reasons };
  }

  // 4) Cierres exitosos (los detecta en lo que confirmó el AGENTE).
  if (APPOINTMENT_SUCCESS_PATTERNS.some((p) => p.test(agentText) || p.test(input.summary ?? ""))) {
    reasons.push("el agente confirmó una cita durante la llamada");
    return {
      quality: "SUCCESSFUL_APPOINTMENT",
      productive: true,
      requiresHuman: false,
      reasons,
    };
  }
  if (QUOTE_SUCCESS_PATTERNS.some((p) => p.test(agentText) || p.test(input.summary ?? ""))) {
    reasons.push("el agente generó/confirmó una cotización durante la llamada");
    return { quality: "SUCCESSFUL_QUOTE", productive: true, requiresHuman: false, reasons };
  }

  // 5) Pidió humano (productiva: hay un lead real que atender).
  if (HUMAN_REQUEST_PATTERNS.some((p) => p.test(customerText))) {
    reasons.push("el cliente pidió hablar con una persona");
    return { quality: "NEEDS_HUMAN", productive: true, requiresHuman: true, reasons };
  }

  // 6) Intención comercial relacionada con el negocio.
  const matched = COMMERCIAL_INTENT_PATTERNS.filter((p) => p.test(fullText));
  if (matched.length > 0) {
    reasons.push("el cliente mostró intención comercial relacionada con el negocio");
    return { quality: "PRODUCTIVE", productive: true, requiresHuman: false, reasons };
  }

  // 7) Sin intención relacionada: improductiva.
  reasons.push("sin intención relacionada con el negocio en toda la llamada");
  return { quality: "UNPRODUCTIVE", productive: false, requiresHuman: false, reasons };
}
