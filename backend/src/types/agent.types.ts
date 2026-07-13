export type AgentIntent =
  | "GREETING"
  | "SEARCH_PRODUCT"
  | "ASK_PRICE"
  | "ADD_TO_QUOTE"
  | "REMOVE_FROM_QUOTE"
  | "GENERATE_QUOTE"
  | "ASK_RECOMMENDATION"
  | "SCHEDULE_APPOINTMENT"
  | "HUMAN_HANDOFF"
  | "UNKNOWN";

/**
 * Clasificación conversacional (independiente de `intent`, que sigue
 * manejando las acciones del backend). Detecta de qué trata realmente el
 * mensaje para control de calidad y de gasto.
 */
export type ConversationIntent =
  | "GREETING"
  | "PRODUCT_INQUIRY"
  | "SERVICE_INQUIRY"
  | "QUOTE_REQUEST"
  | "APPOINTMENT_REQUEST"
  | "SUPPORT_REQUEST"
  | "HUMAN_REQUEST"
  | "COMPLAINT"
  | "OFF_TOPIC"
  | "SPAM"
  | "WRONG_NUMBER"
  | "UNKNOWN";

/** Resultado del turno: si la conversación avanza o hay que cortarla/escalarla. */
export type ConversationOutcome =
  | "PRODUCTIVE"
  | "NEEDS_INFO"
  | "NEEDS_HUMAN"
  | "NOT_RELATED"
  | "SPAM"
  | "WRONG_NUMBER"
  | "COMPLETED";

export type AgentProductRequest = {
  originalText: string;
  normalizedText: string;
  quantity: number;
  unit?: string;
};

/**
 * Datos extraídos cuando el cliente quiere agendar una cita. Campos vacíos ("")
 * indican que el dato falta y hay que preguntarlo (slot-filling por turno).
 */
export type AgentAppointmentRequest = {
  customerName: string;
  serviceText: string;
  dateTimeText: string;
  /** ISO 8601 resuelto por el modelo a partir de la fecha actual; "" si no se pudo. */
  isoDateTime: string;
};

export type AgentAction = {
  type:
    | "SEARCH_PRODUCT"
    | "ADD_TO_QUOTE"
    | "GENERATE_PDF"
    | "ASK_CONFIRMATION"
    | "HANDOFF"
    | "NONE";
  payload?: Record<string, unknown>;
};

export type AgentDecision = {
  intent: AgentIntent;
  replyText: string;
  productRequests: AgentProductRequest[];
  appointmentRequest?: AgentAppointmentRequest;
  actions: AgentAction[];
  requiresHuman: boolean;
  confidence: number;
  /** Clasificación conversacional del mensaje (default UNKNOWN en fallbacks). */
  conversationIntent?: ConversationIntent;
  /** Resultado del turno (default NEEDS_INFO en fallbacks). */
  outcome?: ConversationOutcome;
};

export type AiUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

/**
 * Resultado completo de una ejecución del motor IA: la decisión estructurada
 * más los metadatos de la llamada (modelo, tokens, éxito/fallback).
 */
export type AgentRunResult = {
  decision: AgentDecision;
  usage: AiUsage;
  model: string;
  /** true si la respuesta provino realmente del modelo; false si se usó fallback. */
  success: boolean;
  /** true si se devolvió una decisión de respaldo (sin API key o por error). */
  usedFallback: boolean;
  errorMessage?: string | null;
};