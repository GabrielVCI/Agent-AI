import { useCallback, useRef } from 'react'
import api from '../lib/api'
import { useLiveQuery, type LiveQueryResult } from './useLiveQuery'
import {
  listConversations,
  getConversationMessages,
  type ConversationListFilters,
} from '../services/conversationsApi'
import {
  appointmentsApi,
  type Appointment,
  type AppointmentFilters,
} from '../services/appointmentsApi'
import { catalogApi, type CatalogItem, type ItemFilters } from '../services/catalogApi'
import { listAgents } from '../services/agentsApi'
import type { Agent, Conversation, Message } from '../types'
import {
  normalizeDashboardSummary,
  normalizeDashboardByPhone,
  normalizeAgentPerformance,
  normalizeDashboardActivity,
  normalizeDashboardQuotes,
  normalizeDashboardAudio,
  normalizeDashboardAlerts,
  type DashboardSummaryView,
  type PhoneSummaryView,
  type AgentPerfView,
  type ActivityDayView,
  type QuotesView,
  type AudioView,
  type AlertView,
} from '../lib/dashboard'

/**
 * Hooks de datos "casi en tiempo real" (Parte D de la fase de consistencia).
 *
 * Todos usan useLiveQuery: polling consciente de visibilidad, datos previos
 * conservados si un refetch silencioso falla (staleWarning), lastUpdatedAt
 * para la UI y un solo interval por hook. Intervalos por módulo (Parte A):
 * dashboard 30s · inbox 10s · hilo abierto 5s · citas 30s · catálogo 60s ·
 * agentes 60s · billing 60s · soporte 30s.
 */

export const REFRESH_INTERVALS = {
  dashboard: 30_000,
  conversations: 10_000,
  messages: 5_000,
  appointments: 30_000,
  catalog: 60_000,
  agents: 60_000,
  billing: 60_000,
  support: 30_000,
} as const

// ─── Dashboard ───────────────────────────────────────────────────────────────

export interface DashboardStats {
  summary: DashboardSummaryView | null
  phones: PhoneSummaryView[]
  agents: AgentPerfView[]
  activity: ActivityDayView[]
  quotes: QuotesView | null
  audio: AudioView | null
  alerts: AlertView[]
  /** true si el endpoint principal (summary) falló en la carga */
  summaryFailed: boolean
}

export interface DashboardStatsResult extends LiveQueryResult<DashboardStats> {
  /** Refetch manual que además invalida el cache Redis del backend (?fresh=1). */
  refreshFresh: () => Promise<void>
}

export function useDashboardStats(): DashboardStatsResult {
  // El botón "Actualizar" manda ?fresh=1 (bypass del cache de 60s del backend).
  // El polling de fondo NO lo manda, para aprovechar el cache.
  const freshRef = useRef(false)

  const fetcher = useCallback(async (): Promise<DashboardStats> => {
    const params = freshRef.current ? { fresh: '1' } : undefined
    freshRef.current = false
    // allSettled: un endpoint caído (p.ej. 403) no tumba el resto del dashboard
    const [s, p, a, act, q, au, al] = await Promise.allSettled([
      api.get<unknown>('/api/dashboard/summary', params),
      api.get<unknown>('/api/dashboard/by-phone', params),
      api.get<unknown>('/api/dashboard/agent-performance', params),
      api.get<unknown>('/api/dashboard/activity', params),
      api.get<unknown>('/api/dashboard/quotes', params),
      api.get<unknown>('/api/dashboard/audio', params),
      api.get<unknown>('/api/dashboard/alerts', params),
    ])
    return {
      summary: s.status === 'fulfilled' ? normalizeDashboardSummary(s.value) : null,
      phones: p.status === 'fulfilled' ? normalizeDashboardByPhone(p.value) : [],
      agents: a.status === 'fulfilled' ? normalizeAgentPerformance(a.value) : [],
      activity: act.status === 'fulfilled' ? normalizeDashboardActivity(act.value) : [],
      quotes: q.status === 'fulfilled' ? normalizeDashboardQuotes(q.value) : null,
      audio: au.status === 'fulfilled' ? normalizeDashboardAudio(au.value) : null,
      alerts: al.status === 'fulfilled' ? normalizeDashboardAlerts(al.value) : [],
      summaryFailed: s.status === 'rejected',
    }
  }, [])

  const base = useLiveQuery(fetcher, { intervalMs: REFRESH_INTERVALS.dashboard })

  const refreshFresh = useCallback(async () => {
    freshRef.current = true
    await base.refresh()
  }, [base.refresh]) // eslint-disable-line react-hooks/exhaustive-deps

  return { ...base, refreshFresh }
}

// ─── Conversaciones / mensajes ───────────────────────────────────────────────

export function useConversations(filters: ConversationListFilters = {}) {
  return useLiveQuery<Conversation[]>(() => listConversations(filters), {
    intervalMs: REFRESH_INTERVALS.conversations,
    deps: [JSON.stringify(filters)],
  })
}

export function useConversationMessages(conversationId: string | null) {
  return useLiveQuery<Message[]>(
    () => getConversationMessages(conversationId as string),
    {
      intervalMs: REFRESH_INTERVALS.messages,
      enabled: Boolean(conversationId),
      deps: [conversationId],
    }
  )
}

// ─── Citas ───────────────────────────────────────────────────────────────────

export function useAppointments(filters: AppointmentFilters = {}) {
  return useLiveQuery(() => appointmentsApi.list(filters), {
    intervalMs: REFRESH_INTERVALS.appointments,
    deps: [JSON.stringify(filters)],
  })
}

// ─── Catálogo ────────────────────────────────────────────────────────────────

export function useCatalogItems(filters: ItemFilters = {}) {
  // Devuelve PagedResult<CatalogItem>: { items, total, page, limit, pages }
  return useLiveQuery(() => catalogApi.listItems(filters), {
    intervalMs: REFRESH_INTERVALS.catalog,
    deps: [JSON.stringify(filters)],
  })
}

// ─── Agentes ─────────────────────────────────────────────────────────────────

export function useAgents() {
  return useLiveQuery<Agent[]>(() => listAgents(), {
    intervalMs: REFRESH_INTERVALS.agents,
  })
}

// ─── Billing / uso del plan ──────────────────────────────────────────────────

export interface BillingUsage {
  hasSubscription: boolean
  planName?: string
  subscriptionStatus?: string
  periodStart?: string
  periodEnd?: string
  usage?: {
    conversations: { used: number; limit: number; pct: number }
    quotes: { used: number; limit: number; pct: number }
    messages: { used: number }
  }
}

export function useBillingUsage() {
  return useLiveQuery<BillingUsage>(
    () => api.get<BillingUsage>('/api/dashboard/usage'),
    { intervalMs: REFRESH_INTERVALS.billing }
  )
}

// ─── Soporte ─────────────────────────────────────────────────────────────────

export interface SupportTicketsFilters {
  status?: string
  tier?: string
  severity?: string
  tenantId?: string
  search?: string
}

export function useSupportTickets<T = unknown>(filters: SupportTicketsFilters = {}) {
  return useLiveQuery<T[]>(
    async () => {
      const data = await api.get<T[]>('/api/support/tickets', {
        status: filters.status || undefined,
        tier: filters.tier || undefined,
        severity: filters.severity || undefined,
        tenantId: filters.tenantId || undefined,
        search: filters.search || undefined,
      })
      return Array.isArray(data) ? data : []
    },
    {
      intervalMs: REFRESH_INTERVALS.support,
      deps: [JSON.stringify(filters)],
    }
  )
}
