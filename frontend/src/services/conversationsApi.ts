import api from '../lib/api'
import type {
  Conversation,
  ConversationStatus,
  Message,
  MessageType,
} from '../types'

/**
 * Capa única de contrato de Conversaciones frontend <-> backend.
 *
 * El backend (conversation.controller.ts) serializa con nombres de campo del
 * schema Prisma (customerName, whatsappPhone, agent:{name}, lastMessagePreview,
 * messageType, textContent, createdAt, senderType...). La UI usa otro
 * vocabulario (contactName, contactPhone, agentName, lastMessage:string,
 * type, content, sentAt, isFromBot). Aquí se traduce en un solo lugar y se
 * tolera que cualquier campo venga null/undefined: la UI nunca toca datos
 * crudos y no puede crashear por contrato.
 */

const VALID_MESSAGE_TYPES: MessageType[] = ['TEXT', 'AUDIO', 'IMAGE', 'DOCUMENT', 'SYSTEM']

function str(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return fallback
}

/** OPEN (estado interno) se muestra como bot activo; el resto se respeta. */
function normalizeConversationStatus(value: unknown): ConversationStatus {
  switch (value) {
    case 'HUMAN_ACTIVE':
      return 'HUMAN_ACTIVE'
    case 'CLOSED':
      return 'CLOSED'
    case 'UNRESOLVED':
      return 'UNRESOLVED'
    case 'BOT_ACTIVE':
    case 'OPEN':
    default:
      return 'BOT_ACTIVE'
  }
}

function normalizeMessageType(value: unknown): MessageType {
  return VALID_MESSAGE_TYPES.includes(value as MessageType) ? (value as MessageType) : 'TEXT'
}

export interface InboxLabel {
  id: string
  name: string
  color: string
  usageCount?: number
}

function mapLabels(raw: unknown): InboxLabel[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(l => {
      const label = (l ?? {}) as Record<string, any>
      return { id: str(label.id), name: str(label.name), color: str(label.color, 'slate') }
    })
    .filter(l => l.id && l.name)
}

/** Backend -> Conversation que consume la UI. */
export function mapConversationFromApi(raw: unknown): Conversation {
  const c = (raw ?? {}) as Record<string, any>
  const customer = (c.customer ?? {}) as Record<string, any>
  const agent = (c.agent ?? {}) as Record<string, any>
  const assignedTo = (c.assignedTo ?? {}) as Record<string, any>
  const lastMsg = (c.lastMessage ?? {}) as Record<string, any>

  const lastMessageText =
    str(c.lastMessagePreview) ||
    str(lastMsg.textContent) ||
    str(lastMsg.transcriptionText) ||
    ''

  return {
    id: str(c.id),
    contactName: str(c.customerName) || str(customer.name) || undefined,
    contactPhone: str(c.whatsappPhone) || str(customer.phone) || '—',
    whatsappNumber: str(c.whatsappPhone) || str(agent.whatsappDisplayPhone) || '',
    agentId: str(agent.id) || undefined,
    agentName: str(agent.name) || undefined,
    status: normalizeConversationStatus(c.status),
    lastMessage: lastMessageText || undefined,
    lastMessageAt: c.lastMessageAt ? str(c.lastMessageAt) : undefined,
    unreadCount: typeof c.unreadCount === 'number' ? c.unreadCount : 0,
    hasQuote: Boolean(c.currentQuote ?? c.hasQuote),
    hasAudio: Boolean(c.hasAudio) || normalizeMessageType(lastMsg.messageType) === 'AUDIO',
    operatorName: str(assignedTo.name) || str(c.operatorName) || undefined,
    assignedToId: str(assignedTo.id) || undefined,
    labels: mapLabels(c.labels),
    needsHuman: Boolean(c.needsHuman),
    awaitingReply: Boolean(c.awaitingReply),
    channel: c.channel === 'VOICE' ? 'VOICE' : 'WHATSAPP',
  }
}

const VALID_SENDERS = ['CUSTOMER', 'AGENT', 'HUMAN', 'SYSTEM'] as const
type MessageSender = (typeof VALID_SENDERS)[number]

function normalizeSenderType(value: unknown): MessageSender | undefined {
  return VALID_SENDERS.includes(value as MessageSender)
    ? (value as MessageSender)
    : undefined
}

/** Backend -> Message que consume la UI. */
export function mapMessageFromApi(raw: unknown): Message {
  const m = (raw ?? {}) as Record<string, any>
  const senderType = normalizeSenderType(m.senderType)

  return {
    id: str(m.id),
    conversationId: str(m.conversationId),
    direction: m.direction === 'OUTBOUND' ? 'OUTBOUND' : 'INBOUND',
    type: normalizeMessageType(m.messageType ?? m.type),
    senderType,
    content: str(m.textContent ?? m.content) || undefined,
    mediaUrl: str(m.mediaUrl) || undefined,
    transcription: str(m.transcriptionText ?? m.transcription) || undefined,
    transcriptionStatus: m.transcriptionStatus ?? m.metadata?.transcriptionStatus,
    transcriptionProvider:
      str(m.transcriptionProvider ?? m.metadata?.transcriptionProvider) || undefined,
    senderName: str(m.senderName) || undefined,
    sentAt: str(m.sentAt ?? m.createdAt) || new Date().toISOString(),
    isFromBot: senderType === 'AGENT' || Boolean(m.isFromBot),
  }
}

function toArray<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if (Array.isArray(obj.data)) return obj.data as T[]
    if (Array.isArray(obj.conversations)) return obj.conversations as T[]
    if (Array.isArray(obj.messages)) return obj.messages as T[]
    if (Array.isArray(obj.items)) return obj.items as T[]
  }
  return []
}

// --- Endpoints ---

export interface ConversationListFilters {
  agentId?: string
  status?: string
  /** Búsqueda server-side: nombre/teléfono del cliente o último mensaje */
  search?: string
  /** Solo conversaciones con al menos una cotización */
  withQuote?: boolean
  /** Solo conversaciones con handoff humano abierto */
  pendingHuman?: boolean
  /** Solo conversaciones asignadas al usuario autenticado */
  assignedToMe?: boolean
  /** Solo conversaciones sin asignar */
  unassigned?: boolean
  /** Filtrar por etiqueta */
  labelId?: string
  /** Solo conversaciones con el cliente esperando respuesta */
  awaiting?: boolean
  /** Rango sobre lastMessageAt (YYYY-MM-DD) */
  dateFrom?: string
  dateTo?: string
  page?: number
  limit?: number
}

export async function listConversations(
  filters: ConversationListFilters = {}
): Promise<Conversation[]> {
  const data = await api.get<unknown>('/api/conversations', {
    agentId: filters.agentId || undefined,
    status: filters.status || undefined,
    search: filters.search?.trim() || undefined,
    withQuote: filters.withQuote ? 'true' : undefined,
    pendingHuman: filters.pendingHuman ? 'true' : undefined,
    assignedToMe: filters.assignedToMe ? 'true' : undefined,
    unassigned: filters.unassigned ? 'true' : undefined,
    labelId: filters.labelId || undefined,
    awaiting: filters.awaiting ? 'true' : undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    page: filters.page || undefined,
    limit: filters.limit || undefined,
  })
  return toArray(data).map(mapConversationFromApi)
}

// ─── Inbox: etiquetas, asignación y perfil de contacto ──────────────────────

export const labelsApi = {
  list: async (): Promise<InboxLabel[]> => {
    const data = await api.get<unknown>('/api/conversations/labels')
    return mapLabels(Array.isArray(data) ? data : [])
  },
  create: (name: string, color: string) =>
    api.post<InboxLabel>('/api/conversations/labels', { name, color }),
  update: (id: string, data: { name?: string; color?: string }) =>
    api.put<InboxLabel>(`/api/conversations/labels/${id}`, data),
  remove: (id: string) => api.delete(`/api/conversations/labels/${id}`),
  attach: (conversationId: string, labelId: string) =>
    api.post(`/api/conversations/${conversationId}/labels`, { labelId }),
  detach: (conversationId: string, labelId: string) =>
    api.delete(`/api/conversations/${conversationId}/labels/${labelId}`),
}

export async function assignConversation(conversationId: string, userId: string): Promise<void> {
  await api.post(`/api/conversations/${conversationId}/assign`, { userId })
}

export async function unassignConversation(conversationId: string): Promise<void> {
  await api.post(`/api/conversations/${conversationId}/unassign`)
}

export interface ContactProfile {
  contact: {
    id: string
    name: string | null
    phone: string
    email: string | null
    notes: string | null
    lastActivityAt: string | null
  }
  conversation: {
    id: string
    status: string
    createdAt: string
    agent: { id: string; name: string } | null
    assignedTo: { id: string; name: string } | null
  }
  labels: InboxLabel[]
  appointments: {
    id: string
    serviceOrProduct: string
    scheduledAt: string
    status: string
    source: string
  }[]
  quotes: { id: string; quoteNumber: string; status: string; total: number }[]
  lastProduct: string | null
}

export async function getConversationProfile(conversationId: string): Promise<ContactProfile> {
  return api.get<ContactProfile>(`/api/conversations/${conversationId}/profile`)
}

export async function updateConversationContact(
  conversationId: string,
  data: { name?: string; email?: string | null; notes?: string | null }
): Promise<void> {
  await api.put(`/api/conversations/${conversationId}/contact`, data)
}

export interface TenantUser {
  id: string
  name: string
  lastName?: string | null
  role: string
}

export async function listTenantUsers(): Promise<TenantUser[]> {
  const data = await api.get<unknown>('/api/company/users')
  return toArray<TenantUser>(data)
}

export async function getConversationMessages(conversationId: string): Promise<Message[]> {
  const data = await api.get<unknown>(`/api/conversations/${conversationId}/messages`)
  return toArray(data).map(mapMessageFromApi)
}

export async function replyToConversation(conversationId: string, message: string): Promise<void> {
  await api.post(`/api/conversations/${conversationId}/reply`, { message })
}

export async function takeoverConversation(conversationId: string): Promise<void> {
  await api.post(`/api/conversations/${conversationId}/takeover`)
}

export async function releaseConversationToAgent(conversationId: string): Promise<void> {
  await api.post(`/api/conversations/${conversationId}/release-to-agent`)
}

export async function closeConversation(conversationId: string): Promise<void> {
  await api.post(`/api/conversations/${conversationId}/close`)
}
