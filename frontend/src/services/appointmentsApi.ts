import api from '../lib/api'
import { normalizePaginatedResponse, type PagedResult } from '../lib/pagination'

// ─── Tipos (espejo del contrato /api/appointments del backend) ───────────────

export type AppointmentStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'RESCHEDULED'
  | 'NO_SHOW'
  | 'COMPLETED'

export type AppointmentPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'FOLLOW_UP'
export type AppointmentSource = 'AI' | 'MANUAL' | 'WHATSAPP' | 'ADMIN'

export interface Appointment {
  id: string
  customerName: string
  customerPhone: string
  customerEmail: string | null
  requestedAt: string
  scheduledAt: string
  serviceOrProduct: string
  catalogItemId: string | null
  catalogItem: { id: string; name: string } | null
  notes: string | null
  source: AppointmentSource
  status: AppointmentStatus
  confirmationStatus: 'UNCONFIRMED' | 'CONFIRMED' | 'DECLINED'
  priority: AppointmentPriority
  lastReminderAt: string | null
  confirmedAt: string | null
  cancelledAt: string | null
  rescheduledAt: string | null
  agentId: string | null
  agent: { id: string; name: string } | null
  conversationId: string | null
  conversation: { id: string; customerName: string | null } | null
  createdAt: string
  updatedAt: string
}

export interface AppointmentInput {
  customerName: string
  customerPhone: string
  customerEmail?: string | null
  scheduledAt: string
  serviceOrProduct: string
  catalogItemId?: string | null
  notes?: string | null
  priority?: AppointmentPriority
  status?: 'PENDING' | 'CONFIRMED'
}

export interface AppointmentFilters {
  dateFrom?: string
  dateTo?: string
  status?: AppointmentStatus
  priority?: AppointmentPriority
  search?: string
  agentId?: string
  source?: AppointmentSource
  page?: number
  limit?: number
  sortBy?: 'scheduledAt' | 'requestedAt' | 'createdAt'
  sortOrder?: 'asc' | 'desc'
}

export interface TimeRange {
  start: string
  end: string
}

export type WeekDay =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday'

export type WeeklySchedule = Partial<Record<WeekDay, TimeRange[]>>

export interface AppointmentSettings {
  reminderEnabled: boolean
  reminderHoursBefore: number
  reminderMessageTemplate: string
  autoConfirmAI: boolean
  /** null = sin configurar (la IA registra solicitudes sin validar horario) */
  weeklySchedule: WeeklySchedule | null
  slotDurationMinutes: number
  bufferMinutes: number
  maxAppointmentsPerSlot: number
}

export interface RemindersResult {
  enabled: boolean
  candidates: number
  sent: { id: string; customerName: string; scheduledAt: string }[]
  skipped: { id: string; customerName: string; reason: string }[]
}

export const appointmentsApi = {
  // Contrato paginado: { items, total, page, limit, pages, filters }.
  // normalizePaginatedResponse tolera también la forma legacy (array directo).
  list: async (filters: AppointmentFilters = {}): Promise<PagedResult<Appointment>> => {
    const data = await api.get<unknown>(
      '/api/appointments',
      filters as Record<string, string | number | undefined>
    )
    return normalizePaginatedResponse<Appointment>(data)
  },

  create: (data: AppointmentInput) => api.post<Appointment>('/api/appointments', data),

  update: (id: string, data: Partial<AppointmentInput>) =>
    api.put<Appointment>(`/api/appointments/${id}`, data),

  confirm: (id: string) => api.post<Appointment>(`/api/appointments/${id}/confirm`),

  cancel: (id: string, reason?: string) =>
    api.post<Appointment>(`/api/appointments/${id}/cancel`, reason ? { reason } : {}),

  reschedule: (id: string, scheduledAt: string, note?: string) =>
    api.post<Appointment>(`/api/appointments/${id}/reschedule`, { scheduledAt, note }),

  noShow: (id: string) => api.post<Appointment>(`/api/appointments/${id}/no-show`),

  complete: (id: string) => api.post<Appointment>(`/api/appointments/${id}/complete`),

  processReminders: () => api.post<RemindersResult>('/api/appointments/process-reminders'),

  getSettings: () => api.get<AppointmentSettings>('/api/appointments/settings'),

  updateSettings: (data: Partial<AppointmentSettings>) =>
    api.put<AppointmentSettings>('/api/appointments/settings', data),
}
