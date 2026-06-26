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

/** Backend -> Conversation que consume la UI. */
export function mapConversationFromApi(raw: unknown): Conversation {
  const c = (raw ?? {}) as Record<string, any>
  const customer = (c.customer ?? {}) as Record<string, any>
  const agent = (c.agent ?? {}) as Record<string, any>
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
    agentName: str(agent.name) || undefined,
    status: normalizeConversationStatus(c.status),
    lastMessage: lastMessageText || undefined,
    lastMessageAt: c.lastMessageAt ? str(c.lastMessageAt) : undefined,
    unreadCount: typeof c.unreadCount === 'number' ? c.unreadCount : 0,
    hasQuote: Boolean(c.currentQuote ?? c.hasQuote),
    hasAudio: Boolean(c.hasAudio) || normalizeMessageType(lastMsg.messageType) === 'AUDIO',
    operatorName: str(c.operatorName) || undefined,
  }
}

/** Backend -> Message que consume la UI. */
export function mapMessageFromApi(raw: unknown): Message {
  const m = (raw ?? {}) as Record<string, any>
  const senderType = str(m.senderType)

  return {
    id: str(m.id),
    conversationId: str(m.conversationId),
    direction: m.direction === 'OUTBOUND' ? 'OUTBOUND' : 'INBOUND',
    type: normalizeMessageType(m.messageType ?? m.type),
    content: str(m.textContent ?? m.content) || undefined,
    mediaUrl: str(m.mediaUrl) || undefined,
    transcription: str(m.transcriptionText ?? m.transcription) || undefined,
    transcriptionStatus: m.transcriptionStatus,
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

export async function listConversations(): Promise<Conversation[]> {
  const data = await api.get<unknown>('/api/conversations')
  return toArray(data).map(mapConversationFromApi)
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
