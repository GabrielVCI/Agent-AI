import api from '../lib/api'
import { normalizePaginatedResponse, type PagedResult } from '../lib/pagination'
import type { CustomerCategoryType } from './customerCategoriesApi'

/** Insignia compacta que acompaña a cada cliente en listado y ficha. */
export interface CustomerCategoryBadge {
  id: string
  name: string
  color: string
  type: CustomerCategoryType
}

// ─── Tipos (espejo del contrato /api/customers del backend) ──────────────────

export type CustomerStage = 'CONTACT' | 'CLIENT' | 'ARCHIVED'
export type CustomerSource = 'WHATSAPP' | 'MANUAL' | 'APPOINTMENT' | 'IMPORT' | 'VOICE' | 'API'
export type CustomerRiskStatus = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH'

export interface CustomerListItem {
  id: string
  name: string
  firstName: string | null
  lastName: string | null
  phone: string
  phoneNormalized: string | null
  phoneDisplay: string
  email: string | null
  stage: CustomerStage
  source: CustomerSource
  /** Etiquetas de texto libre (legado del Módulo 1). */
  tags: string[]
  /** Categorías activas del cliente (Módulo 2). */
  categories: CustomerCategoryBadge[]
  isVip: boolean
  riskStatus: CustomerRiskStatus
  firstVisitAt: string | null
  lastVisitAt: string | null
  visitCount: number
  daysSinceLastVisit: number | null
  lastActivityAt: string | null
  createdAt: string
}

/** Ficha completa. Solo llega en GET /api/customers/:id. */
export interface CustomerProfile extends CustomerListItem {
  documentId: string | null
  address: string | null
  birthDate: string | null
  notes: string | null
  clientSince: string | null
  vipSince: string | null
  archivedAt: string | null
  updatedAt: string
}

export interface CustomerCommercialSummary {
  visitCount: number
  firstVisitAt: string | null
  lastVisitAt: string | null
  daysSinceLastVisit: number | null
  appointments: {
    total: number
    completed: number
    cancelled: number
    noShow: number
    upcoming: number
  }
  quotes: { issued: number; totalQuoted: number; averageQuoted: number; currency: string }
  /**
   * Valor de lo REALIZADO en las visitas, con el precio del catálogo del día.
   * NO es dinero cobrado: Sendwary todavía no registra pagos de cliente final,
   * así que la UI lo etiqueta como "valor realizado", nunca como "pagado".
   */
  serviced: {
    total: number
    averagePerVisit: number
    visitsWithValue: number
    currency: string
  }
  services: { name: string; count: number; lastAt: string }[]
  products: { id: string; name: string; quantity: number; amount: number }[]
  conversations: number
  messages: number
}

export type CustomerTimelineType =
  | 'APPOINTMENT'
  | 'QUOTE'
  | 'CONVERSATION'
  | 'AUTOMATION'
  | 'SCHEDULED_MESSAGE'

export interface CustomerTimelineEntry {
  id: string
  type: CustomerTimelineType
  occurredAt: string
  title: string
  summary: string | null
  referenceId: string | null
  metadata: Record<string, unknown>
}

export interface CustomerAppointmentItem {
  id: string
  scheduledAt: string
  serviceOrProduct: string
  status: string
  confirmationStatus: string
  priority: string
  source: string
  notes: string | null
  conversationId: string | null
  agent: { id: string; name: string } | null
  catalogItem: { id: string; name: string } | null
}

/**
 * Seguimiento programado (Módulo 3). Es un AutomationJob real del motor: no
 * existe una tabla de recurrencias, y por eso cancelarlo o moverlo pasa por el
 * Automation Core en vez de borrar filas.
 */
export interface CustomerFollowUp {
  id: string
  scheduledFor: string
  status: string
  ruleName: string
  serviceId: string | null
  serviceName: string | null
  eventType: string
  actionType: string
  appointmentId: string | null
}

export interface CustomerCounters {
  total: number
  clients: number
  contacts: number
  vip: number
  atRisk: number
  withoutVisits: number
}

export interface CustomerFilters {
  search?: string
  stage?: CustomerStage
  includeArchived?: boolean
  isVip?: boolean
  riskStatus?: CustomerRiskStatus
  tag?: string
  /** Ids de categoría; se envían como lista separada por comas. */
  categoryIds?: string[]
  /** `all` (por defecto) = pertenece a TODAS; `any` = a alguna. */
  categoryMatch?: "all" | "any"
  source?: CustomerSource
  inactiveDays?: number
  hasVisits?: boolean
  lastVisitFrom?: string
  lastVisitTo?: string
  page?: number
  limit?: number
  sortBy?: 'lastVisitAt' | 'visitCount' | 'createdAt' | 'name' | 'firstVisitAt'
  sortOrder?: 'asc' | 'desc'
}

export interface CustomerInput {
  firstName: string
  lastName: string
  phone: string
  email?: string | null
  birthDate?: string | null
  documentId?: string | null
  address?: string | null
  notes?: string | null
  tags?: string[]
  isVip?: boolean
  riskStatus?: CustomerRiskStatus
}

// ─── Importación ─────────────────────────────────────────────────────────────

export interface CustomerImportRowResult {
  row: number
  name: string
  phone: string
  errors: string[]
  duplicate: boolean
  duplicateReason: 'EXISTING' | 'IN_FILE' | null
  existingCustomerId: string | null
  created: boolean
}

export interface CustomerImportResult {
  preview: boolean
  fileName: string
  processed: number
  valid: number
  invalid: number
  existing: number
  duplicatesInFile: number
  created: number
  rows: CustomerImportRowResult[]
  truncated: boolean
}

// ─── Cliente HTTP ────────────────────────────────────────────────────────────

/** Quita los vacíos para no mandar `?search=` y que el backend filtre de más. */
function cleanParams(filters: CustomerFilters): Record<string, string | number | boolean> {
  const params: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue
    // Las categorías viajan como "a,b,c": el filtro lo resuelve el backend en
    // la base de datos, nunca el navegador sobre la página actual.
    if (Array.isArray(value)) {
      if (value.length === 0) continue
      params[key] = value.join(',')
      continue
    }
    params[key] = value as string | number | boolean
  }
  return params
}

export const customersApi = {
  list: async (filters: CustomerFilters = {}): Promise<PagedResult<CustomerListItem>> => {
    const data = await api.get<unknown>('/api/customers', cleanParams(filters))
    return normalizePaginatedResponse<CustomerListItem>(data)
  },

  counters: () => api.get<CustomerCounters>('/api/customers/counters'),

  tags: () => api.get<string[]>('/api/customers/tags'),

  get: (id: string) => api.get<CustomerProfile>(`/api/customers/${id}`),

  summary: (id: string) => api.get<CustomerCommercialSummary>(`/api/customers/${id}/summary`),

  timeline: async (id: string, page = 1, limit = 20) => {
    const data = await api.get<unknown>(`/api/customers/${id}/timeline`, { page, limit })
    return normalizePaginatedResponse<CustomerTimelineEntry>(data)
  },

  appointments: async (id: string, page = 1, limit = 20) => {
    const data = await api.get<unknown>(`/api/customers/${id}/appointments`, { page, limit })
    return normalizePaginatedResponse<CustomerAppointmentItem>(data)
  },

  // ── Próximos seguimientos (Módulo 3) ──
  followUps: (id: string) => api.get<CustomerFollowUp[]>(`/api/customers/${id}/followups`),

  cancelFollowUp: (id: string, jobId: string) =>
    api.delete<{ cancelled: boolean }>(`/api/customers/${id}/followups/${jobId}`),

  rescheduleFollowUp: (id: string, jobId: string, scheduledFor: string) =>
    api.patch<{ scheduledFor: string }>(`/api/customers/${id}/followups/${jobId}`, {
      scheduledFor,
    }),

  create: (data: CustomerInput) => api.post<CustomerProfile>('/api/customers', data),

  update: (id: string, data: Partial<CustomerInput>) =>
    api.patch<CustomerProfile>(`/api/customers/${id}`, data),

  archive: (id: string, archived: boolean) =>
    api.patch<CustomerProfile>(`/api/customers/${id}/archive`, { archived }),

  importPreview: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.upload<CustomerImportResult>('/api/customers/import/preview', formData)
  },

  import: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.upload<CustomerImportResult>('/api/customers/import', formData)
  },

  downloadTemplate: () =>
    api.download('/api/customers/import/template', undefined, 'plantilla-clientes-sendwary.xlsx'),
}
