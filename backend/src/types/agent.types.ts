export type AgentIntent =
  | "GREETING"
  | "SEARCH_PRODUCT"
  | "ASK_PRICE"
  | "ADD_TO_QUOTE"
  | "REMOVE_FROM_QUOTE"
  | "GENERATE_QUOTE"
  | "ASK_RECOMMENDATION"
  | "HUMAN_HANDOFF"
  | "UNKNOWN";

export type AgentProductRequest = {
  originalText: string;
  normalizedText: string;
  quantity: number;
  unit?: string;
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
  actions: AgentAction[];
  requiresHuman: boolean;
  confidence: number;
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