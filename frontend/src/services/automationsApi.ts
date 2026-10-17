import api from '../lib/api'
import { normalizePaginatedResponse, type PagedResult } from '../lib/pagination'

// ─── Tipos (espejo del contrato /api/automations del backend) ────────────────

export type AutomationRuleStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'

export type AutomationScheduleStrategy =
  | 'IMMEDIATE'
  | 'DELAY'
  | 'RELATIVE_TO_FIELD'
  | 'DAILY_AT_LOCAL_TIME'

export type AutomationJobStatus =
  | 'PENDING'
  | 'SCHEDULED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'RETRY_PENDING'

export type AutomationExecutionStatus = 'SUCCESS' | 'FAILED' | 'RETRY_SCHEDULED' | 'SKIPPED'

/**
 * Evento y acción llegan como STRING desde el catálogo del backend, no como
 * uniones fijas: el motor es la única fuente de verdad sobre qué existe. Si
 * mañana se añade una acción, el panel la ofrece sin tocar este archivo.
 */
export interface AutomationEventDefinition {
  type: string
  entityType: string
  description: string
  /** false = el motor todavía no emite este evento desde ningún módulo. */
  implemented: boolean
}

export interface AutomationRuleTemplate {
  key: string
  title: string
  summary: string
  eventType: string
  actionType: string
}

export interface AutomationCatalog {
  events: AutomationEventDefinition[]
  /** Acciones con executor REAL registrado. Nunca se ofrece una sin motor. */
  actions: string[]
  templates: AutomationRuleTemplate[]
}

/** Configuración de programación (`scheduleConfigJson`). */
export interface AutomationScheduleConfig {
  /** RELATIVE_TO_FIELD: ruta dentro del payload con una fecha ISO. */
  field?: string
  /** RELATIVE_TO_FIELD: minutos a sumar (negativo = antes de la fecha). */
  offsetMinutes?: number
  /** DAILY_AT_LOCAL_TIME: hora local del negocio "HH:mm". */
  localTime?: string
  dedupeTag?: string
  dedupeWindow?: 'entity' | 'day' | 'occurrence'
}

export interface AutomationRule {
  id: string
  name: string
  description: string | null
  eventType: string
  status: AutomationRuleStatus
  enabled: boolean
  /** DSL de condiciones. null = la regla siempre aplica. */
  conditions: unknown
  actionType: string
  actionConfig: Record<string, unknown> | null
  scheduleStrategy: AutomationScheduleStrategy
  delayMinutes: number
  scheduleConfig: AutomationScheduleConfig | null
  cancelOnEventTypes: string[]
  priority: number
  maxAttempts: number | null
  /** Plantilla de origen, si se instanció desde una. */
  templateKey: string | null
  createdAt: string
  updatedAt: string
}

export interface AutomationRuleInput {
  name: string
  description?: string | null
  eventType: string
  status?: AutomationRuleStatus
  enabled?: boolean
  conditions?: unknown
  actionType: string
  actionConfig: Record<string, unknown>
  scheduleStrategy?: AutomationScheduleStrategy
  delayMinutes?: number
  scheduleConfig?: AutomationScheduleConfig | null
  cancelOnEventTypes?: string[]
  priority?: number
  maxAttempts?: number | null
}

export interface AutomationJob {
  id: string
  ruleId: string
  ruleName: string | null
  eventType: string
  entityType: string
  entityId: string
  customerId: string | null
  actionType: string
  status: AutomationJobStatus
  priority: number
  scheduledFor: string
  attemptCount: number
  maxAttempts: number
  startedAt: string | null
  completedAt: string | null
  failedAt: string | null
  cancelledAt: string | null
  cancelReason: string | null
  /** Error YA saneado por el motor: nunca contiene tokens. */
  lastError: string | null
  lastErrorCode: string | null
  correlationId: string | null
  createdAt: string
  updatedAt: string
}

export interface AutomationExecution {
  id: string
  jobId: string
  ruleId: string
  attemptNumber: number
  startedAt: string
  finishedAt: string | null
  status: AutomationExecutionStatus
  resultSummary: string | null
  errorType: string | null
  errorMessage: string | null
  durationMs: number | null
  createdAt: string
}

export interface AutomationHealth {
  counts: Record<AutomationJobStatus, number>
  /** PENDING + SCHEDULED + RETRY_PENDING. */
  pending: number
  nextDue: { id: string; scheduledFor: string; eventType: string } | null
  lastFailed: {
    id: string
    failedAt: string | null
    lastError: string | null
    lastErrorCode: string | null
    attemptCount: number
    automationRuleId: string
    entityType: string
    entityId: string
  } | null
  /** Jobs atascados en PROCESSING más de 15 min (lease vencido). */
  staleProcessing: number
}

// ─── Condiciones ─────────────────────────────────────────────────────────────

export const CONDITION_OPERATORS = [
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'nin',
  'exists',
  'contains',
] as const

export type ConditionOperator = (typeof CONDITION_OPERATORS)[number]

export const CONDITION_OPERATOR_LABELS: Record<ConditionOperator, string> = {
  eq: 'es igual a',
  ne: 'es distinto de',
  gt: 'es mayor que',
  gte: 'es mayor o igual que',
  lt: 'es menor que',
  lte: 'es menor o igual que',
  in: 'está entre',
  nin: 'no está entre',
  exists: 'tiene valor',
  contains: 'contiene',
}

export interface LeafCondition {
  field: string
  op: ConditionOperator
  value?: unknown
}

/** Grupo del DSL. El panel solo genera un nivel: `all` o `any` de hojas. */
export interface GroupCondition {
  all?: LeafCondition[]
  any?: LeafCondition[]
}

/**
 * Lee el DSL del backend a la forma plana que edita el panel.
 *
 * Devuelve `null` si la regla usa una condición más compleja de la que el panel
 * sabe pintar (anidada, con `not`). En ese caso la UI la muestra en solo
 * lectura en vez de destruirla al guardar.
 */
export function parseConditions(
  raw: unknown
): { match: 'all' | 'any'; conditions: LeafCondition[] } | null {
  if (raw === null || raw === undefined) return { match: 'all', conditions: [] }
  if (typeof raw !== 'object') return null

  const group = raw as GroupCondition & { not?: unknown }
  if (group.not !== undefined) return null

  const list = group.all ?? group.any
  if (!Array.isArray(list)) return null

  // Cualquier hoja que no sea {field, op} plana obliga a modo solo lectura.
  for (const item of list) {
    if (typeof item !== 'object' || item === null) return null
    const leaf = item as LeafCondition
    if (typeof leaf.field !== 'string') return null
    if (!CONDITION_OPERATORS.includes(leaf.op)) return null
  }

  return { match: group.all ? 'all' : 'any', conditions: list as LeafCondition[] }
}

/** Forma del DSL que espera el backend. Sin condiciones = null (siempre aplica). */
export function buildConditions(
  match: 'all' | 'any',
  conditions: LeafCondition[]
): unknown {
  const clean = conditions.filter(condition => condition.field.trim().length > 0)
  if (clean.length === 0) return null
  return match === 'any' ? { any: clean } : { all: clean }
}

// ─── Cliente HTTP ────────────────────────────────────────────────────────────

export const automationsApi = {
  catalog: () => api.get<AutomationCatalog>('/api/automations/catalog'),

  health: () => api.get<AutomationHealth>('/api/automations/health'),

  listRules: async (filters: {
    status?: AutomationRuleStatus
    eventType?: string
    page?: number
    limit?: number
  } = {}): Promise<PagedResult<AutomationRule>> => {
    const params: Record<string, string | number> = {}
    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined || value === null || value === '') continue
      params[key] = value as string | number
    }
    return normalizePaginatedResponse<AutomationRule>(
      await api.get<unknown>('/api/automations/rules', params)
    )
  },

  getRule: (id: string) => api.get<AutomationRule>(`/api/automations/rules/${id}`),

  createRule: (data: AutomationRuleInput) =>
    api.post<AutomationRule>('/api/automations/rules', data),

  updateRule: (id: string, data: Partial<AutomationRuleInput>) =>
    api.patch<AutomationRule>(`/api/automations/rules/${id}`, data),

  /** Archiva la regla y cancela sus envíos pendientes. No borra historial. */
  archiveRule: (id: string) =>
    api.delete<{ cancelledJobs: number }>(`/api/automations/rules/${id}`),

  useTemplate: (templateKey: string) =>
    api.post<AutomationRule>('/api/automations/rules/from-template', { templateKey }),

  listJobs: async (filters: {
    status?: AutomationJobStatus
    eventType?: string
    ruleId?: string
    page?: number
    limit?: number
  } = {}): Promise<PagedResult<AutomationJob>> => {
    const params: Record<string, string | number> = {}
    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined || value === null || value === '') continue
      params[key] = value as string | number
    }
    return normalizePaginatedResponse<AutomationJob>(
      await api.get<unknown>('/api/automations/jobs', params)
    )
  },

  cancelJob: (id: string, reason?: string) =>
    api.post<{ cancelled: boolean }>(`/api/automations/jobs/${id}/cancel`, { reason }),

  listExecutions: async (filters: {
    jobId?: string
    ruleId?: string
    status?: AutomationExecutionStatus
    page?: number
    limit?: number
  } = {}): Promise<PagedResult<AutomationExecution>> => {
    const params: Record<string, string | number> = {}
    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined || value === null || value === '') continue
      params[key] = value as string | number
    }
    return normalizePaginatedResponse<AutomationExecution>(
      await api.get<unknown>('/api/automations/executions', params)
    )
  },
}
