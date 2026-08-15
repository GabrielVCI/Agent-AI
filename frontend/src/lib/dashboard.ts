// Normalización y formato de métricas del Dashboard.
// El backend puede devolver métricas como string ("12.5%", "0.00"), null, undefined,
// objetos en lugar de arrays, o nombres de campo distintos a los que asume la UI.
// Estos mappers garantizan estructuras y números seguros: la UI nunca opera sobre datos crudos.

// ──────────────────────────── Helpers base ────────────────────────────

/** Convierte cualquier valor a número seguro: "12.5%" -> 12.5, "0.00" -> 0, null/undefined/NaN -> fallback. */
export function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  if (typeof value === 'string') {
    const parsed = parseFloat(value.replace(/[^0-9.+-]/g, ''))
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return fallback
}

/** Devuelve string seguro; null/undefined/objetos -> fallback. */
export function toStringSafe(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return fallback
}

/** Garantiza un array; cualquier cosa que no sea array -> []. */
export function toArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

// ──────────────────────────── Formateadores ────────────────────────────

/** 12.5 | "12.5%" | null -> "12.5%" */
export function formatPercent(value: unknown, digits = 1): string {
  return `${toNumber(value).toFixed(digits)}%`
}

/** 1234.5 | "1234.5" | null -> "1,234.5" */
export function formatNumber(value: unknown): string {
  return toNumber(value).toLocaleString()
}

/** Entero seguro con separador de miles: 1234 -> "1,234" */
export function formatInteger(value: unknown): string {
  return Math.round(toNumber(value)).toLocaleString()
}

/** segundos -> "45s" | "2m 3s" | "1h 5m" (tolerante a string/null/NaN) */
export function formatTime(value: unknown): string {
  const s = Math.max(0, Math.round(toNumber(value)))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

// alias retrocompatible
export const num = toNumber

// ──────────────────────────── Tipos normalizados (View) ────────────────────────────

export interface DashboardSummaryView {
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
  // Fase consistencia: métricas operativas en vivo
  messagesToday: number
  upcomingAppointments: number
  pendingAppointments: number
  activeProducts: number
  activeAgents: number
}

export interface PhoneSummaryView {
  phone: string
  agentName: string
  messagesReceived: number
  messagesSent: number
  conversationsHandled: number
  quotesCreated: number
  humanTakenOver: number
  aiResolved: number
  unresolvedConversations: number
  quoteConversionRate: number
}

export interface AgentPerfView {
  agentId: string
  agentName: string
  conversationsHandled: number
  quotesGenerated: number
  humanInterventionRate: number
}

export interface ActivityDayView {
  date: string
  conversations: number
  quotes: number
}

export interface QuotesView {
  quotesCreated: number
  conversionRate: number
  avgValue: number
  totalValue: number
}

export interface AudioView {
  received: number
  transcribed: number
  failed: number
  initiatedByAudio: number
  percentByAudio: number
}

export interface AlertView {
  id: string
  type: string
  message: string
}

// ──────────────────────────── Normalizadores ────────────────────────────
// Cada uno tolera múltiples nombres de campo (contrato real del backend vs. ideal de la UI).

/** /api/dashboard/summary */
export function normalizeDashboardSummary(raw: unknown): DashboardSummaryView {
  const r = (raw ?? {}) as Record<string, unknown>
  const planUsage = (r.planUsage ?? null) as Record<string, unknown> | null

  const convLimit = planUsage ? toNumber(planUsage.conversationsLimit) : 0
  const monthlyUsage =
    planUsage && convLimit > 0
      ? (toNumber(planUsage.conversationsUsed) / convLimit) * 100
      : toNumber(r.monthlyUsage)

  return {
    aiResponded: toNumber(r.aiResponded ?? r.botActiveConversations),
    totalConversations: toNumber(r.totalConversations),
    quotesRequested: toNumber(r.quotesRequested ?? r.totalQuotes),
    humanInterventionRate: toNumber(r.humanInterventionRate),
    avgFirstResponseTime: toNumber(r.avgFirstResponseTime ?? r.averageFirstResponseTime),
    monthlyUsage: toNumber(monthlyUsage),
    inboundMessages: toNumber(r.inboundMessages),
    outboundMessages: toNumber(r.outboundMessages),
    unresolvedConversations: toNumber(r.unresolvedConversations ?? r.unansweredConversations),
    aiResolvedConversations: toNumber(r.aiResolvedConversations ?? r.closedConversations),
    messagesToday: toNumber(r.messagesToday),
    upcomingAppointments: toNumber(r.upcomingAppointments),
    pendingAppointments: toNumber(r.pendingAppointments),
    activeProducts: toNumber(r.activeProducts),
    activeAgents: toNumber(r.activeAgents),
  }
}

/** /api/dashboard/by-phone -> array */
export function normalizeDashboardByPhone(raw: unknown): PhoneSummaryView[] {
  return toArray<Record<string, unknown>>(raw).map((p) => ({
    phone: toStringSafe(p?.displayPhone ?? p?.phoneNumberId ?? p?.phone, '—'),
    agentName: toStringSafe(p?.agentName, '—'),
    messagesReceived: toNumber(p?.messagesInbound ?? p?.messagesReceived),
    messagesSent: toNumber(p?.messagesOutbound ?? p?.messagesSent),
    conversationsHandled: toNumber(p?.conversations ?? p?.conversationsHandled),
    quotesCreated: toNumber(p?.quotesCreated),
    humanTakenOver: toNumber(p?.humanInterventions ?? p?.humanTakenOver),
    aiResolved: toNumber(p?.closedByAI ?? p?.aiResolved),
    unresolvedConversations: toNumber(p?.unanswered ?? p?.unresolvedConversations),
    quoteConversionRate: toNumber(p?.conversionRate ?? p?.quoteConversionRate),
  }))
}

/** /api/dashboard/agent-performance -> array (rate se calcula si el backend no lo envía) */
export function normalizeAgentPerformance(raw: unknown): AgentPerfView[] {
  return toArray<Record<string, unknown>>(raw).map((a) => {
    const conversations = toNumber(a?.conversations ?? a?.conversationsHandled)
    const humanInterventions = toNumber(a?.humanInterventions)
    const rate =
      a?.humanInterventionRate != null
        ? toNumber(a.humanInterventionRate)
        : conversations > 0
          ? (humanInterventions / conversations) * 100
          : 0
    return {
      agentId: toStringSafe(a?.agentId ?? a?.agentName),
      agentName: toStringSafe(a?.agentName, '—'),
      conversationsHandled: conversations,
      quotesGenerated: toNumber(a?.quotesCreated ?? a?.quotesGenerated),
      humanInterventionRate: rate,
    }
  })
}

/** /api/dashboard/activity -> array. El backend devuelve { conversationsByDay: {fecha: n}, ... }. */
export function normalizeDashboardActivity(raw: unknown): ActivityDayView[] {
  if (Array.isArray(raw)) {
    return raw.map((d: Record<string, unknown>) => ({
      date: toStringSafe(d?.date),
      conversations: toNumber(d?.conversations),
      quotes: toNumber(d?.quotes),
    }))
  }
  const r = (raw ?? {}) as Record<string, unknown>
  const byDay = (r.conversationsByDay ?? {}) as Record<string, unknown>
  const quotesByDay = (r.quotesByDay ?? {}) as Record<string, unknown>
  return Object.keys(byDay)
    .sort()
    .map((date) => ({
      date,
      conversations: toNumber(byDay[date]),
      quotes: toNumber(quotesByDay[date]),
    }))
}

/** /api/dashboard/quotes */
export function normalizeDashboardQuotes(raw: unknown): QuotesView {
  const r = (raw ?? {}) as Record<string, unknown>
  return {
    quotesCreated: toNumber(r.totalCreated ?? r.quotesCreated),
    conversionRate: toNumber(r.conversionRate),
    avgValue: toNumber(r.averageValue ?? r.avgValue),
    totalValue: toNumber(r.totalValue),
  }
}

/** /api/dashboard/audio */
export function normalizeDashboardAudio(raw: unknown): AudioView {
  const r = (raw ?? {}) as Record<string, unknown>
  return {
    received: toNumber(r.audioReceived ?? r.received),
    transcribed: toNumber(r.audioTranscribed ?? r.transcribed),
    failed: toNumber(r.audioFailed ?? r.failed),
    initiatedByAudio: toNumber(r.initiatedByAudio),
    percentByAudio: toNumber(r.percentByAudio),
  }
}

/** /api/dashboard/alerts -> array */
export function normalizeDashboardAlerts(raw: unknown): AlertView[] {
  return toArray<Record<string, unknown>>(raw).map((a, i) => ({
    id: toStringSafe(a?.id, String(i)),
    type: toStringSafe(a?.type, 'INFO').toUpperCase(),
    message: toStringSafe(a?.message),
  }))
}
