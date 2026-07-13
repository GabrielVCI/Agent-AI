import api from '../lib/api'
import type {
  Agent,
  AgentDecision,
  AgentInput,
  AgentIntent,
  AgentStatus,
  AgentStats,
  AgentTestResult,
  AgentType,
  ConversationIntent,
  ConversationOutcome,
} from '../types'

/**
 * Capa única de contrato de Agentes frontend <-> backend.
 *
 * El backend real (agents-crud.service.ts) ya serializa con el vocabulario del
 * frontend (basePrompt, aiModel, whatsappNumber, allowAudio,
 * allowHumanIntervention, status ACTIVE|INACTIVE). Aun así normalizamos aquí
 * para ser TOLERANTES a ambos vocabularios: si el backend cambiara a los
 * nombres de Prisma (systemPrompt, openAiModel, whatsappDisplayPhone,
 * allowAudioMessages, allowHumanHandoff, status DISABLED) la UI no se rompe.
 *
 * Nada de esto vive disperso por los componentes: todo el mapeo pasa por aquí.
 */

const VALID_TYPES: AgentType[] = ['SALES', 'SUPPORT', 'APPOINTMENTS', 'CUSTOM']
const DEFAULT_MODEL = 'gpt-4.1-mini'

/** Forma cruda tolerante: aceptamos cualquiera de los dos vocabularios. */
type RawAgent = {
  id: string
  name: string
  type?: string
  status?: string
  description?: string | null
  department?: string | null
  // prompt
  basePrompt?: string | null
  systemPrompt?: string | null
  // tono
  tone?: string | null
  // whatsapp
  whatsappNumber?: string | null
  whatsappDisplayPhone?: string | null
  whatsappPhoneNumberId?: string | null
  // modelo
  aiModel?: string | null
  openAiModel?: string | null
  // flags
  allowAudio?: boolean
  allowAudioMessages?: boolean
  allowHumanIntervention?: boolean
  allowHumanHandoff?: boolean
  allowVoiceCalls?: boolean
  elevenLabsAgentId?: string | null
  createdAt?: string
  updatedAt?: string
  stats?: AgentStats
}

function normalizeStatus(status?: string): AgentStatus {
  // ACTIVE -> ACTIVE; DISABLED/INACTIVE/cualquier otro -> INACTIVE.
  return status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE'
}

function normalizeType(type?: string): AgentType {
  return VALID_TYPES.includes(type as AgentType) ? (type as AgentType) : 'CUSTOM'
}

/** Backend -> modelo interno del frontend. */
export function mapAgentFromApi(raw: RawAgent): Agent {
  return {
    id: raw.id,
    name: raw.name,
    type: normalizeType(raw.type),
    status: normalizeStatus(raw.status),
    description: raw.description ?? undefined,
    department: raw.department ?? undefined,
    basePrompt: raw.basePrompt ?? raw.systemPrompt ?? undefined,
    tone: raw.tone ?? undefined,
    whatsappNumber: raw.whatsappNumber ?? raw.whatsappDisplayPhone ?? undefined,
    whatsappPhoneNumberId: raw.whatsappPhoneNumberId ?? undefined,
    aiModel: raw.aiModel ?? raw.openAiModel ?? DEFAULT_MODEL,
    allowAudio: raw.allowAudio ?? raw.allowAudioMessages ?? false,
    allowHumanIntervention: raw.allowHumanIntervention ?? raw.allowHumanHandoff ?? true,
    allowVoiceCalls: raw.allowVoiceCalls ?? false,
    elevenLabsAgentId: raw.elevenLabsAgentId ?? undefined,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    stats: raw.stats,
  }
}

/** Modelo interno del frontend -> payload que acepta el backend. */
export function mapAgentToApiPayload(input: AgentInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: input.name.trim(),
    type: input.type,
  }

  // Solo enviamos campos definidos para no pisar valores con strings vacíos
  // innecesarios (el backend hace strip de claves desconocidas).
  if (input.description !== undefined) payload.description = input.description.trim()
  if (input.department !== undefined) payload.department = input.department.trim()
  if (input.basePrompt !== undefined) payload.basePrompt = input.basePrompt.trim()
  if (input.tone !== undefined) payload.tone = input.tone
  if (input.aiModel !== undefined) payload.aiModel = input.aiModel
  if (input.allowAudio !== undefined) payload.allowAudio = input.allowAudio
  if (input.allowHumanIntervention !== undefined)
    payload.allowHumanIntervention = input.allowHumanIntervention
  if (input.allowVoiceCalls !== undefined) payload.allowVoiceCalls = input.allowVoiceCalls
  if (input.elevenLabsAgentId !== undefined)
    payload.elevenLabsAgentId = input.elevenLabsAgentId.trim() || null

  // whatsappNumber: '' -> null para limpiar la asignación.
  if (input.whatsappNumber !== undefined)
    payload.whatsappNumber = input.whatsappNumber.trim() || undefined
  if (input.whatsappPhoneNumberId !== undefined)
    payload.whatsappPhoneNumberId = input.whatsappPhoneNumberId.trim() || undefined

  return payload
}

// --- Endpoints ---

export async function listAgents(): Promise<Agent[]> {
  const data = await api.get<RawAgent[]>('/api/agents')
  return (data ?? []).map(mapAgentFromApi)
}

export async function getAgent(id: string): Promise<Agent> {
  const data = await api.get<RawAgent>(`/api/agents/${id}`)
  return mapAgentFromApi(data)
}

export async function createAgent(input: AgentInput): Promise<Agent> {
  const data = await api.post<RawAgent>('/api/agents', mapAgentToApiPayload(input))
  return mapAgentFromApi(data)
}

export async function updateAgent(id: string, input: AgentInput): Promise<Agent> {
  const data = await api.put<RawAgent>(`/api/agents/${id}`, mapAgentToApiPayload(input))
  return mapAgentFromApi(data)
}

export async function setAgentStatus(id: string, status: AgentStatus): Promise<Agent> {
  const data = await api.patch<RawAgent>(`/api/agents/${id}/status`, { status })
  return mapAgentFromApi(data)
}

const VALID_INTENTS: AgentIntent[] = [
  'GREETING', 'SEARCH_PRODUCT', 'ASK_PRICE', 'ADD_TO_QUOTE', 'REMOVE_FROM_QUOTE',
  'GENERATE_QUOTE', 'ASK_RECOMMENDATION', 'SCHEDULE_APPOINTMENT', 'HUMAN_HANDOFF', 'UNKNOWN',
]

const VALID_CONVERSATION_INTENTS: ConversationIntent[] = [
  'GREETING', 'PRODUCT_INQUIRY', 'SERVICE_INQUIRY', 'QUOTE_REQUEST', 'APPOINTMENT_REQUEST',
  'SUPPORT_REQUEST', 'HUMAN_REQUEST', 'COMPLAINT', 'OFF_TOPIC', 'SPAM', 'WRONG_NUMBER', 'UNKNOWN',
]

const VALID_OUTCOMES: ConversationOutcome[] = [
  'PRODUCTIVE', 'NEEDS_INFO', 'NEEDS_HUMAN', 'NOT_RELATED', 'SPAM', 'WRONG_NUMBER', 'COMPLETED',
]

function num(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

/** Garantiza la forma de AgentDecision aunque el backend omita campos. */
function normalizeDecision(raw: unknown): AgentDecision {
  const d = (raw ?? {}) as Record<string, any>
  return {
    intent: VALID_INTENTS.includes(d.intent) ? d.intent : 'UNKNOWN',
    replyText: typeof d.replyText === 'string' ? d.replyText : '',
    productRequests: Array.isArray(d.productRequests)
      ? d.productRequests.map((p: Record<string, any>) => ({
          originalText: String(p?.originalText ?? p?.normalizedText ?? ''),
          normalizedText: String(p?.normalizedText ?? p?.originalText ?? ''),
          quantity: num(p?.quantity, 1),
          unit: p?.unit ? String(p.unit) : undefined,
        }))
      : [],
    actions: Array.isArray(d.actions) ? d.actions : [],
    requiresHuman: Boolean(d.requiresHuman),
    confidence: num(d.confidence, 0),
    conversationIntent: VALID_CONVERSATION_INTENTS.includes(d.conversationIntent)
      ? d.conversationIntent
      : undefined,
    outcome: VALID_OUTCOMES.includes(d.outcome) ? d.outcome : undefined,
  }
}

/** Backend -> AgentTestResult con todos los campos garantizados (no crashea la UI). */
export function mapTestResultFromApi(raw: unknown): AgentTestResult {
  const r = (raw ?? {}) as Record<string, any>
  const usage = (r.usage ?? {}) as Record<string, any>
  const decision = normalizeDecision(r.decision)
  return {
    agentId: String(r.agentId ?? ''),
    model: String(r.model ?? '—'),
    reply: typeof r.reply === 'string' ? r.reply : decision.replyText,
    usage: {
      inputTokens: num(usage.inputTokens),
      outputTokens: num(usage.outputTokens),
      totalTokens: num(usage.totalTokens),
    },
    decision,
    actions: Array.isArray(r.actions)
      ? r.actions.map((a: Record<string, any>) => ({
          type: String(a?.type ?? 'ANSWER'),
          executed: Boolean(a?.executed),
          detail: String(a?.detail ?? ''),
        }))
      : [],
    conversationIntent: VALID_CONVERSATION_INTENTS.includes(r.conversationIntent)
      ? r.conversationIntent
      : decision.conversationIntent ?? 'UNKNOWN',
    outcome: VALID_OUTCOMES.includes(r.outcome)
      ? r.outcome
      : decision.outcome ?? 'NEEDS_INFO',
    confidence: num(r.confidence, decision.confidence),
    requiresHuman: typeof r.requiresHuman === 'boolean' ? r.requiresHuman : decision.requiresHuman,
    costControlReason: typeof r.costControlReason === 'string' ? r.costControlReason : null,
  }
}

export async function testAgent(
  id: string,
  payload: { message: string; customerName?: string; context?: Record<string, unknown> }
): Promise<AgentTestResult> {
  const data = await api.post<unknown>(`/api/agents/${id}/test`, payload)
  return mapTestResultFromApi(data)
}
