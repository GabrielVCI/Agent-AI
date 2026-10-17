import api from '../lib/api'
import { normalizePaginatedResponse, type PagedResult } from '../lib/pagination'

// ─── Tipos (espejo del contrato /api/maintenance del backend) ────────────────

export type MaintenanceStatus = 'OVERDUE' | 'DUE_TODAY' | 'UPCOMING'

export interface MaintenanceEntry {
  id: string
  customerId: string
  customerName: string
  phoneDisplay: string
  serviceId: string
  serviceName: string
  itemType: 'PRODUCT' | 'SERVICE'
  /** Última vez que se le hizo ese servicio. */
  lastPerformedAt: string
  /** Cuándo le toca, según la política ACTUAL del catálogo. */
  dueAt: string
  status: MaintenanceStatus
  overdueDays: number
  daysUntilDue: number
  /** true = ya tiene cita futura para ese servicio: no hay que contactarle. */
  hasUpcomingAppointment: boolean
  recurrenceLabel: string
}

export interface MaintenanceCounters {
  overdue: number
  dueToday: number
  upcoming: number
  /** Ya agendados. Se cuentan aparte para que no parezca que "faltan". */
  scheduled: number
}

export interface MaintenanceService {
  id: string
  name: string
  itemType: 'PRODUCT' | 'SERVICE'
  recurrenceLabel: string
}

export interface MaintenanceFilters {
  serviceId?: string
  status?: MaintenanceStatus
  /** "Vencidos hace N días o más". */
  overdueMinDays?: number
  search?: string
  includeScheduled?: boolean
  page?: number
  limit?: number
}

function cleanParams(filters: MaintenanceFilters): Record<string, string | number | boolean> {
  const params: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '' || value === false) continue
    params[key] = value as string | number | boolean
  }
  return params
}

export const maintenanceApi = {
  schedule: async (filters: MaintenanceFilters = {}): Promise<PagedResult<MaintenanceEntry>> =>
    normalizePaginatedResponse<MaintenanceEntry>(
      await api.get<unknown>('/api/maintenance/schedule', cleanParams(filters))
    ),

  counters: () => api.get<MaintenanceCounters>('/api/maintenance/counters'),

  services: () => api.get<MaintenanceService[]>('/api/maintenance/services'),
}
