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