export type UserRole = 'SUPER_ADMIN' | 'OWNER' | 'ADMIN' | 'AGENT_OPERATOR' | 'BILLING'

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  tenantId: string | null
  status: string
  avatarUrl?: string
  /** Verificación de correo (flujo comercial); SUPER_ADMIN siempre true */
  emailVerified?: boolean
}

/** Contrato de GET /api/billing/activation-status (flujo comercial premium) */
export interface ActivationStatus {
  emailVerified: boolean
  lifecycleStatus: string | null
  implementationStatus: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | null
  implementationFeePaid: boolean
  implementationFeePaidAt: string | null
  implementationStartedAt: string | null
  implementationExpectedEndAt: string | null
  finalActivationDate: string | null
  firstMonthEndsAt: string | null
  hasActiveSubscription: boolean
  shouldShowPaywall: boolean
  shouldShowImplementationScreen: boolean
  paywallBypassUntil: string | null
  reason: string
}

export interface Company {
  id: string
  name: string
  tradeName?: string
  legalName?: string
  rnc?: string
  logoUrl?: string
  address?: string
  phone?: string
  email?: string
  industry?: string
  timezone?: string
  website?: string
  description?: string
  socialMedia?: {
    instagram?: string
    facebook?: string
    twitter?: string
    linkedin?: string
  }
}

export interface Plan {
  id: string
  name: string
  maxAgents: number
  maxConversationsPerMonth: number
  maxQuotesPerMonth: number
  maxAudioMinutes: number
  maxDocuments: number
  maxStorageMb: number
  price: number
  features: string[]
}

export interface Subscription {
  id: string
  plan: Plan
  status: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED' | 'TRIALING'
  currentPeriodStart: string
  currentPeriodEnd: string
  usedConversations: number
  usedQuotes: number
  usedAudioMinutes: number
  usedDocuments: number
  usedStorageMb: number
}

export type AgentType = 'SALES' | 'SUPPORT' | 'APPOINTMENTS' | 'CUSTOM'
export type AgentStatus = 'ACTIVE' | 'INACTIVE'

/**
 * Contrato del Agente tal como lo consume el frontend (ya normalizado por
 * mapAgentFromApi en services/agentsApi.ts). Coincide con el DTO real que
 * serializa el backend en agents-crud.service.ts.
 */
export interface Agent {
  id: string
  name: string
  type: AgentType
  status: AgentStatus
  description?: string
  department?: string
  basePrompt?: string
  tone?: string
  whatsappNumber?: string
  whatsappPhoneNumberId?: string
  aiModel: string
  allowAudio: boolean
  allowHumanIntervention: boolean
  allowVoiceCalls: boolean
  elevenLabsAgentId?: string
  createdAt?: string
  updatedAt?: string
  stats?: AgentStats
}

export interface AgentStats {
  conversationsHandled: number
  quotesGenerated: number
  audiosReceived: number
  humanInterventionRate: number
}

export type AgentIntent =
  | 'GREETING'
  | 'SEARCH_PRODUCT'
  | 'ASK_PRICE'
  | 'ADD_TO_QUOTE'
  | 'REMOVE_FROM_QUOTE'
  | 'GENERATE_QUOTE'
  | 'ASK_RECOMMENDATION'
  | 'SCHEDULE_APPOINTMENT'
  | 'HUMAN_HANDOFF'
  | 'UNKNOWN'

export interface AgentProductRequest {
  originalText: string
  normalizedText: string
  quantity: number
  unit?: string
}

export interface AgentAction {
  type: 'SEARCH_PRODUCT' | 'ADD_TO_QUOTE' | 'GENERATE_PDF' | 'ASK_CONFIRMATION' | 'HANDOFF' | 'NONE'
  payload?: Record<string, unknown>
}

/** Clasificación conversacional del mensaje (control de calidad/gasto). */
export type ConversationIntent =
  | 'GREETING'
  | 'PRODUCT_INQUIRY'
  | 'SERVICE_INQUIRY'
  | 'QUOTE_REQUEST'
  | 'APPOINTMENT_REQUEST'
  | 'SUPPORT_REQUEST'
  | 'HUMAN_REQUEST'
  | 'COMPLAINT'
  | 'OFF_TOPIC'
  | 'SPAM'
  | 'WRONG_NUMBER'
  | 'UNKNOWN'

/** Resultado del turno: si la conversación avanza o hay que cortarla/escalarla. */
export type ConversationOutcome =
  | 'PRODUCTIVE'
  | 'NEEDS_INFO'
  | 'NEEDS_HUMAN'
  | 'NOT_RELATED'
  | 'SPAM'
  | 'WRONG_NUMBER'
  | 'COMPLETED'

export interface AgentDecision {
  intent: AgentIntent
  replyText: string
  productRequests: AgentProductRequest[]
  actions: AgentAction[]
  requiresHuman: boolean
  confidence: number
  conversationIntent?: ConversationIntent
  outcome?: ConversationOutcome
}

export interface AiUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

/** Acción que el runtime IA ejecutó (o describiría en modo prueba). */
export interface AgentRuntimeAction {
  type: string
  executed: boolean
  detail: string
}

/** Respuesta real de POST /api/agents/:id/test */
export interface AgentTestResult {
  agentId: string
  model: string
  reply: string
  usage: AiUsage
  decision: AgentDecision
  actions: AgentRuntimeAction[]
  conversationIntent: ConversationIntent
  outcome: ConversationOutcome
  confidence: number
  requiresHuman: boolean
  /** Razón de corte por control de gasto (null si el turno fue normal). */
  costControlReason: string | null
}

/** Payload que el frontend envía al crear/editar un agente. */
export interface AgentInput {
  name: string
  type: AgentType
  description?: string
  department?: string
  basePrompt?: string
  tone?: string
  whatsappNumber?: string
  whatsappPhoneNumberId?: string
  aiModel?: string
  allowAudio?: boolean
  allowHumanIntervention?: boolean
  allowVoiceCalls?: boolean
  elevenLabsAgentId?: string
}

export type MessageType = 'TEXT' | 'AUDIO' | 'IMAGE' | 'DOCUMENT' | 'SYSTEM'
export type ConversationStatus = 'BOT_ACTIVE' | 'HUMAN_ACTIVE' | 'CLOSED' | 'UNRESOLVED'

export type MessageSender = 'CUSTOMER' | 'AGENT' | 'HUMAN' | 'SYSTEM'

export interface Message {
  id: string
  conversationId: string
  direction: 'INBOUND' | 'OUTBOUND'
  type: MessageType
  senderType?: MessageSender
  content?: string
  mediaUrl?: string
  transcription?: string
  transcriptionStatus?: 'PENDING' | 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'DISABLED'
  /** Proveedor que transcribió el audio (elevenlabs | openai) */
  transcriptionProvider?: string
  senderName?: string
  sentAt: string
  isFromBot: boolean
}

export interface Conversation {
  id: string
  contactName?: string
  contactPhone: string
  whatsappNumber: string
  agentId?: string
  agentName?: string
  status: ConversationStatus
  lastMessage?: string
  lastMessageAt?: string
  unreadCount?: number
  hasQuote?: boolean
  hasAudio?: boolean
  operatorName?: string
  assignedToId?: string
  labels?: { id: string; name: string; color: string }[]
  needsHuman?: boolean
  awaitingReply?: boolean
  channel?: 'WHATSAPP' | 'VOICE'
}

export interface Invoice {
  id: string
  amount: number
  currency: string
  status: 'PAID' | 'PENDING' | 'FAILED'
  issuedAt: string
  paidAt?: string
  description: string
  downloadUrl?: string
}

export interface KnowledgeDocument {
  id: string
  fileName: string
  fileType: string
  fileSizeMb: number
  status: 'UPLOADED' | 'PROCESSING' | 'READY' | 'ERROR'
  uploadedAt: string
  appliesTo?: string[]
}

export interface WhatsAppConnection {
  id: string
  phone: string
  displayName?: string
  status: 'CONNECTED' | 'DISCONNECTED' | 'PENDING'
  agentId?: string
  agentName?: string
  allowAudio: boolean
  autoReply: boolean
}

export interface DashboardSummary {
  aiResponded: number
  totalConversations: number
  quotesRequested: number
  humanInterventionRate: number
  avgFirstResponseTime: number
  monthlyUsage: number
  inboundMessages: number
  outboundMessages: number
  unresolvedConversations: number
  aiResolvedConversations: number
}

export interface PhoneSummary {
  phone: string
  agentName?: string
  messagesReceived: number
  messagesSent: number
  conversationsHandled: number
  quotesCreated: number
  avgContactHour?: string
  peakActivityRange?: string
  humanTakenOver: number
  aiResolved: number
  avgResponseTime: string
  audiosReceived: number
  audiosTranscribed: number
  unresolvedConversations: number
  quoteConversionRate: number
}

export interface DashboardAlert {
  id: string
  type: 'WARNING' | 'INFO' | 'DANGER'
  message: string
}

export interface AdminTenant {
  id: string
  name: string
  email: string
  plan: string
  status: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED' | 'TRIALING'
  agentsCount: number
  connectedNumbers: number
  createdAt: string
  lastAccessAt?: string
  usedConversations: number
  usedAudioMinutes: number
  /** Consumo del mes calendario actual (contador de billing) */
  usageMessages: number
  usageLimit: number
  usageExceeded: boolean
  /** Venta manual: precio efectivo (custom > plan) y cobro */
  monthlyPrice: number | null
  planCurrency: string
  billingMode: string | null
  paymentStatus: string | null
  nextBillingDate: string | null
}

export interface CancellationRequest {
  id: string
  tenantId: string
  tenantName: string
  reason: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED'
  requestedAt: string
  resolvedAt?: string
}

export interface ApiError {
  message: string
  statusCode?: number
}
