import { useCallback, useEffect, useState, FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  CalendarDays, Plus, Search, Check, X, Clock, UserX, Flag,
  CheckCircle2, Bell, Bot, Phone, Settings2, ListChecks, Undo2,
} from "lucide-react"
import { useAuth } from '../contexts/AuthContext'
import { useAutoRefresh } from '../hooks/useAutoRefresh'
import PaginationBar from '../components/ui/PaginationBar'
import {
  appointmentsApi,
  Appointment,
  AppointmentStatus,
  AppointmentPriority,
  AppointmentSettings,
  WeekDay,
  WeeklySchedule,
} from '../services/appointmentsApi'
import { catalogApi, CatalogItem } from '../services/catalogApi'
import { Card } from '../components/ui/Card'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import Alert from '../components/ui/Alert'
import Modal from '../components/ui/Modal'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import AppointmentLinesModal from '../components/appointments/AppointmentLinesModal'

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder:text-slate-400 transition'

const statusMeta: Record<AppointmentStatus, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' }> = {
  PENDING: { label: 'Pendiente', variant: 'warning' },
  CONFIRMED: { label: 'Confirmada', variant: 'success' },
  CANCELLED: { label: 'Cancelada', variant: 'danger' },
  RESCHEDULED: { label: 'Pospuesta', variant: 'info' },
  NO_SHOW: { label: 'No asistió', variant: 'danger' },
  COMPLETED: { label: 'Completada', variant: 'default' },
}

const priorityMeta: Record<AppointmentPriority, { label: string; className: string }> = {
  LOW: { label: 'Baja', className: 'text-slate-400' },
  NORMAL: { label: 'Normal', className: 'text-slate-500' },
  HIGH: { label: 'Alta', className: 'text-red-600' },
  FOLLOW_UP: { label: 'Seguimiento', className: 'text-amber-600' },
}

function formatDateTime(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('es-DO', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

/** Convierte ISO a valor de <input type="datetime-local"> en hora local. */
function toLocalInputValue(iso?: string) {
  const date = iso ? new Date(iso) : new Date()
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// ─── Modal crear/editar cita ─────────────────────────────────────────────────

interface FormState {
  customerName: string
  customerPhone: string
  customerEmail: string
  scheduledAt: string
  serviceOrProduct: string
  catalogItemId: string
  notes: string
  priority: AppointmentPriority
}

const emptyForm: FormState = {
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  scheduledAt: '',
  serviceOrProduct: '',
  catalogItemId: '',
  notes: '',
  priority: 'NORMAL',
}

function AppointmentFormModal({
  open,
  onClose,
  onSaved,
  editing,
  catalogItems,
  prefill,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  editing: Appointment | null
  catalogItems: CatalogItem[]
  /** Datos iniciales al crear (p. ej. desde el perfil de contacto del inbox) */
  prefill?: { customerName?: string; customerPhone?: string } | null
}) {
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setForm(
        editing
          ? {
              customerName: editing.customerName,
              customerPhone: editing.customerPhone,
              customerEmail: editing.customerEmail ?? '',
              scheduledAt: toLocalInputValue(editing.scheduledAt),
              serviceOrProduct: editing.serviceOrProduct,
              catalogItemId: editing.catalogItemId ?? '',
              notes: editing.notes ?? '',
              priority: editing.priority,
            }
          : {
              ...emptyForm,
              scheduledAt: '',
              customerName: prefill?.customerName ?? '',
              customerPhone: prefill?.customerPhone ?? '',
            }
      )
      setError('')
    }
  }, [open, editing, prefill])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(f => ({ ...f, [key]: value }))

  const handleCatalogSelect = (id: string) => {
    const item = catalogItems.find(i => i.id === id)
    setForm(f => ({
      ...f,
      catalogItemId: id,
      serviceOrProduct: item ? item.name : f.serviceOrProduct,
    }))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!form.scheduledAt) {
      setError('Selecciona fecha y hora')
      return
    }
    setSaving(true)
    try {
      const payload = {
        customerName: form.customerName.trim(),
        customerPhone: form.customerPhone.trim(),
        customerEmail: form.customerEmail.trim() || null,
        scheduledAt: new Date(form.scheduledAt).toISOString(),
        serviceOrProduct: form.serviceOrProduct.trim(),
        catalogItemId: form.catalogItemId || null,
        notes: form.notes.trim() || null,
        priority: form.priority,
      }
      if (editing) {
        await appointmentsApi.update(editing.id, payload)
      } else {
        await appointmentsApi.create(payload)
      }
      onSaved()
      onClose()
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e?.message || 'No se pudo guardar la cita')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar cita' : 'Nueva cita'} size="lg">
      {error && (
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Cliente</label>
            <input
              type="text"
              value={form.customerName}
              onChange={e => set('customerName', e.target.value)}
              required
              minLength={2}
              placeholder="Nombre del cliente"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Teléfono</label>
            <input
              type="tel"
              value={form.customerPhone}
              onChange={e => set('customerPhone', e.target.value)}
              required
              minLength={6}
              placeholder="18095551234"
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Fecha y hora</label>
            <input
              type="datetime-local"
              value={form.scheduledAt}
              onChange={e => set('scheduledAt', e.target.value)}
              required
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Prioridad</label>
            <select
              value={form.priority}
              onChange={e => set('priority', e.target.value as AppointmentPriority)}
              className={inputClass}
            >
              <option value="LOW">Baja</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">Alta</option>
              <option value="FOLLOW_UP">Seguimiento</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Ítem del catálogo <span className="text-slate-400">(opcional)</span>
            </label>
            <select
              value={form.catalogItemId}
              onChange={e => handleCatalogSelect(e.target.value)}
              className={inputClass}
            >
              <option value="">Sin vincular</option>
              {catalogItems.map(i => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Servicio / producto
            </label>
            <input
              type="text"
              value={form.serviceOrProduct}
              onChange={e => set('serviceOrProduct', e.target.value)}
              required
              minLength={2}
              placeholder="Ej: Consulta general"
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Notas</label>
          <textarea
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            rows={2}
            placeholder="Opcional"
            className={inputClass}
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving}>
            {editing ? 'Guardar cambios' : 'Crear cita'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Modal de posponer ───────────────────────────────────────────────────────

function RescheduleModal({
  appointment,
  onClose,
  onSaved,
}: {
  appointment: Appointment | null
  onClose: () => void
  onSaved: () => void
}) {
  const [newDate, setNewDate] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (appointment) {
      setNewDate(toLocalInputValue(appointment.scheduledAt))
      setNote('')
      setError('')
    }
  }, [appointment])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!appointment || !newDate) return
    setSaving(true)
    setError('')
    try {
      await appointmentsApi.reschedule(
        appointment.id,
        new Date(newDate).toISOString(),
        note.trim() || undefined
      )
      onSaved()
      onClose()
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e?.message || 'No se pudo posponer la cita')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={appointment !== null} onClose={onClose} title="Posponer cita">
      {error && (
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Nueva fecha y hora
          </label>
          <input
            type="datetime-local"
            value={newDate}
            onChange={e => setNewDate(e.target.value)}
            required
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Motivo</label>
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Opcional — se agrega a las notas"
            className={inputClass}
          />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving}>
            Posponer
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Editor de horario semanal ───────────────────────────────────────────────

const weekDays: { id: WeekDay; label: string }[] = [
  { id: 'monday', label: 'Lunes' },
  { id: 'tuesday', label: 'Martes' },
  { id: 'wednesday', label: 'Miércoles' },
  { id: 'thursday', label: 'Jueves' },
  { id: 'friday', label: 'Viernes' },
  { id: 'saturday', label: 'Sábado' },
  { id: 'sunday', label: 'Domingo' },
]

function WeeklyScheduleEditor({
  value,
  onChange,
}: {
  value: WeeklySchedule | null
  onChange: (v: WeeklySchedule | null) => void
}) {
  const enabled = value !== null

  const setDay = (day: WeekDay, ranges: { start: string; end: string }[] | undefined) => {
    const next: WeeklySchedule = { ...(value ?? {}) }
    if (ranges) next[day] = ranges
    else delete next[day]
    onChange(next)
  }

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={enabled}
          onChange={e =>
            onChange(
              e.target.checked
                ? {
                    monday: [{ start: '09:00', end: '18:00' }],
                    tuesday: [{ start: '09:00', end: '18:00' }],
                    wednesday: [{ start: '09:00', end: '18:00' }],
                    thursday: [{ start: '09:00', end: '18:00' }],
                    friday: [{ start: '09:00', end: '18:00' }],
                  }
                : null
            )
          }
          className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
        />
        Validar horario del negocio al agendar
      </label>
      {!enabled && (
        <p className="text-xs text-slate-400">
          Sin horario configurado, el agente IA registra las citas como solicitudes pendientes sin
          validar el horario.
        </p>
      )}
      {enabled && (
        <div className="space-y-1.5 rounded-lg border border-slate-200 p-3">
          {weekDays.map(day => {
            const ranges = value?.[day.id] ?? []
            const open = ranges.length > 0
            const range = ranges[0] ?? { start: '09:00', end: '18:00' }
            return (
              <div key={day.id} className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-slate-700 w-28">
                  <input
                    type="checkbox"
                    checked={open}
                    onChange={e =>
                      setDay(day.id, e.target.checked ? [{ start: '09:00', end: '18:00' }] : undefined)
                    }
                    className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  {day.label}
                </label>
                {open ? (
                  <div className="flex items-center gap-1.5 text-sm">
                    <input
                      type="time"
                      value={range.start}
                      onChange={e => setDay(day.id, [{ ...range, start: e.target.value }])}
                      className="px-2 py-1 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <span className="text-slate-400">a</span>
                    <input
                      type="time"
                      value={range.end}
                      onChange={e => setDay(day.id, [{ ...range, end: e.target.value }])}
                      className="px-2 py-1 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                ) : (
                  <span className="text-xs text-slate-400">Cerrado</span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Modal de settings de recordatorios ──────────────────────────────────────

function SettingsModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [settings, setSettings] = useState<AppointmentSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setError('')
      appointmentsApi
        .getSettings()
        .then(setSettings)
        .catch(() => setError('No se pudo cargar la configuración'))
    }
  }, [open])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!settings) return
    setSaving(true)
    setError('')
    try {
      await appointmentsApi.updateSettings(settings)
      onClose()
    } catch (err: unknown) {
      const er = err as { message?: string }
      setError(er?.message || 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Recordatorios de citas" size="lg">
      {error && (
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
      )}
      {!settings ? (
        <div className="py-8 flex justify-center">
          <LoadingSpinner />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={settings.reminderEnabled}
              onChange={e => setSettings({ ...settings, reminderEnabled: e.target.checked })}
              className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            />
            Enviar recordatorios por WhatsApp
          </label>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Horas de anticipación
            </label>
            <input
              type="number"
              min={1}
              max={168}
              value={settings.reminderHoursBefore}
              onChange={e =>
                setSettings({ ...settings, reminderHoursBefore: Number(e.target.value) })
              }
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Mensaje del recordatorio
            </label>
            <textarea
              value={settings.reminderMessageTemplate}
              onChange={e =>
                setSettings({ ...settings, reminderMessageTemplate: e.target.value })
              }
              rows={3}
              className={inputClass}
            />
            <p className="text-xs text-slate-400 mt-1">
              Variables: {'{{nombre}}'}, {'{{servicio}}'}, {'{{fecha}}'}, {'{{hora}}'},{' '}
              {'{{negocio}}'}
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={settings.autoConfirmAI}
              onChange={e => setSettings({ ...settings, autoConfirmAI: e.target.checked })}
              className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            />
            Confirmar automáticamente las citas creadas por el agente IA
          </label>

          {/* Disponibilidad del negocio */}
          <div className="border-t border-slate-200 pt-4">
            <p className="text-sm font-semibold text-slate-900 mb-2">Disponibilidad del negocio</p>
            <WeeklyScheduleEditor
              value={settings.weeklySchedule}
              onChange={weeklySchedule => setSettings({ ...settings, weeklySchedule })}
            />
            <div className="grid grid-cols-3 gap-3 mt-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Duración de cita (min)
                </label>
                <input
                  type="number"
                  min={5}
                  max={480}
                  value={settings.slotDurationMinutes}
                  onChange={e =>
                    setSettings({ ...settings, slotDurationMinutes: Number(e.target.value) })
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Margen entre citas (min)
                </label>
                <input
                  type="number"
                  min={0}
                  max={240}
                  value={settings.bufferMinutes}
                  onChange={e => setSettings({ ...settings, bufferMinutes: Number(e.target.value) })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Máx. citas por horario
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={settings.maxAppointmentsPerSlot}
                  onChange={e =>
                    setSettings({ ...settings, maxAppointmentsPerSlot: Number(e.target.value) })
                  }
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" loading={saving}>
              Guardar
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}

// ─── Página ──────────────────────────────────────────────────────────────────

export default function AppointmentsPage() {
  const { user } = useAuth()
  const canManage = user?.role === 'OWNER' || user?.role === 'ADMIN'

  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // Filtros. Sin fechas, el BACKEND aplica "últimos 30 días" por defecto
  // (defaultRangeApplied llega en la respuesta para mostrar el aviso).
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Paginación (server-side). REGLA: cualquier cambio de filtro resetea page=1
  // (por eso los inputs usan los helpers set*AndResetPage de abajo).
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [defaultRangeApplied, setDefaultRangeApplied] = useState(true)

  const withPageReset = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v)
    setPage(1)
  }
  const setSearchF = withPageReset(setSearch)
  const setFilterStatusF = withPageReset(setFilterStatus)
  const setFilterPriorityF = withPageReset(setFilterPriority)
  const setDateFromF = withPageReset(setDateFrom)
  const setDateToF = withPageReset(setDateTo)

  // Modales
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Appointment | null>(null)
  const [prefill, setPrefill] = useState<{ customerName?: string; customerPhone?: string } | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()

  // Deep-link desde el inbox: /appointments?new=1&name=...&phone=... abre el
  // formulario prellenado con los datos del contacto.
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setPrefill({
        customerName: searchParams.get('name') ?? '',
        customerPhone: searchParams.get('phone') ?? '',
      })
      setEditing(null)
      setFormOpen(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null)
  // Servicios y productos de la cita (Módulo 3)
  const [linesFor, setLinesFor] = useState<Appointment | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [processingReminders, setProcessingReminders] = useState(false)
  const [actionBusy, setActionBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError('')
    try {
      const result = await appointmentsApi.list({
        search: search.trim() || undefined,
        status: (filterStatus || undefined) as Appointment['status'] | undefined,
        priority: (filterPriority || undefined) as Appointment['priority'] | undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        page,
        limit,
        // Últimos 30 días: lo más reciente primero
        sortBy: 'scheduledAt',
        sortOrder: 'desc',
      })
      setAppointments(result.items)
      setTotal(result.total)
      setPages(result.pages)
      setDefaultRangeApplied(Boolean(result.filters?.defaultRangeApplied))
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e?.message || 'No se pudieron cargar las citas')
    } finally {
      setLoading(false)
    }
  }, [search, filterStatus, filterPriority, dateFrom, dateTo, page, limit])

  useEffect(() => {
    // Debounce del search (300ms); el resto de filtros cargan de inmediato
    const t = window.setTimeout(load, search ? 300 : 0)
    return () => window.clearTimeout(t)
  }, [load, search])

  // Citas nuevas (p. ej. creadas por el agente IA) aparecen sin recargar
  useAutoRefresh(load, 30_000)

  useEffect(() => {
    catalogApi
      .listItems({ status: 'active', limit: 100 })
      .then(result => setCatalogItems(result.items))
      .catch(() => setCatalogItems([]))
  }, [])

  const flash = (msg: string) => {
    setNotice(msg)
    window.setTimeout(() => setNotice(''), 3500)
  }

  const runAction = async (id: string, action: () => Promise<unknown>, okMsg: string) => {
    setActionBusy(id)
    setError('')
    try {
      await action()
      flash(okMsg)
      await load()
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e?.message || 'La acción no se pudo completar')
    } finally {
      setActionBusy(null)
    }
  }

  const handleProcessReminders = async () => {
    setProcessingReminders(true)
    setError('')
    try {
      const result = await appointmentsApi.processReminders()
      if (!result.enabled) {
        flash('Los recordatorios están desactivados en la configuración')
      } else {
        flash(
          `Recordatorios: ${result.sent.length} enviado(s), ${result.skipped.length} omitido(s) de ${result.candidates} candidato(s)`
        )
      }
      await load()
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e?.message || 'No se pudieron procesar los recordatorios')
    } finally {
      setProcessingReminders(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 max-w-screen-xl mx-auto w-full space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Citas</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Solicitudes registradas manualmente o por tu agente IA
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              icon={<Settings2 className="h-4 w-4" />}
              onClick={() => setSettingsOpen(true)}
            >
              Recordatorios
            </Button>
            <Button
              variant="outline"
              icon={<Bell className="h-4 w-4" />}
              loading={processingReminders}
              onClick={handleProcessReminders}
            >
              Enviar recordatorios
            </Button>
            <Button
              icon={<Plus className="h-4 w-4" />}
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              Nueva cita
            </Button>
          </div>
        )}
      </div>

      {error && <Alert variant="danger">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      {/* Barra compacta de filtros: 1 fila en desktop, 2 col en tablet, 1 col en mobile */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(200px,1fr)_150px_155px_138px_138px] gap-2">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearchF(e.target.value)}
            placeholder="Cliente, teléfono o servicio…"
            className={`${inputClass} pl-9`}
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatusF(e.target.value)}
          className={inputClass}
          title="Estado"
        >
          <option value="">Todos los estados</option>
          {Object.entries(statusMeta).map(([value, meta]) => (
            <option key={value} value={value}>
              {meta.label}
            </option>
          ))}
        </select>
        <select
          value={filterPriority}
          onChange={e => setFilterPriorityF(e.target.value)}
          className={inputClass}
          title="Prioridad"
        >
          <option value="">Todas las prioridades</option>
          {Object.entries(priorityMeta).map(([value, meta]) => (
            <option key={value} value={value}>
              {meta.label}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={e => setDateFromF(e.target.value)}
          className={inputClass}
          title="Desde"
          aria-label="Desde"
        />
        <input
          type="date"
          value={dateTo}
          onChange={e => setDateToF(e.target.value)}
          className={inputClass}
          title="Hasta"
          aria-label="Hasta"
        />
      </div>

      {/* Rango efectivo: default 30 días del backend o fechas elegidas */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {defaultRangeApplied && !dateFrom && !dateTo ? (
          <>
            <Badge variant="info">Mostrando últimos 30 días</Badge>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const today = new Date().toISOString().slice(0, 10)
                const inSixty = new Date(Date.now() + 60 * 86400_000).toISOString().slice(0, 10)
                setDateFromF(today)
                setDateToF(inSixty)
              }}
            >
              Próximas citas
            </Button>
          </>
        ) : (dateFrom || dateTo) ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setDateFromF('')
              setDateToF('')
            }}
          >
            Limpiar fechas (volver a últimos 30 días)
          </Button>
        ) : null}
      </div>

      <Card padding="none">
        {appointments.length === 0 ? (
          <EmptyState
            icon={<CalendarDays className="h-10 w-10" />}
            title={
              search || filterStatus || filterPriority || dateFrom || dateTo
                ? 'No encontramos resultados con estos filtros'
                : 'Sin citas en los últimos 30 días'
            }
            description="Ajusta los filtros o el rango de fechas, crea una cita manual o deja que tu agente IA registre solicitudes desde WhatsApp."
            action={
              canManage ? (
                <Button
                  icon={<Plus className="h-4 w-4" />}
                  onClick={() => {
                    setEditing(null)
                    setFormOpen(true)
                  }}
                >
                  Crear la primera
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {appointments.map(a => {
              const meta = statusMeta[a.status] ?? statusMeta.PENDING
              const priority = priorityMeta[a.priority] ?? priorityMeta.NORMAL
              const busy = actionBusy === a.id
              // NO_SHOW se maneja aparte (solo permite reagendar)
              const isClosed =
                a.status === 'CANCELLED' || a.status === 'COMPLETED' || a.status === 'NO_SHOW'
              return (
                <div key={a.id} className="p-4 hover:bg-slate-50">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => {
                            if (canManage) {
                              setEditing(a)
                              setFormOpen(true)
                            }
                          }}
                          className={`font-medium text-slate-900 truncate ${canManage ? 'hover:text-primary-700' : 'cursor-default'}`}
                        >
                          {a.customerName}
                        </button>
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                        {a.source === 'AI' && (
                          <Badge variant="purple">
                            <Bot className="h-3 w-3 mr-1" />
                            IA
                          </Badge>
                        )}
                        <span className={`inline-flex items-center gap-1 text-xs ${priority.className}`}>
                          <Flag className="h-3 w-3" />
                          {priority.label}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 mt-1">{a.serviceOrProduct}</p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {formatDateTime(a.scheduledAt)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3.5 w-3.5" />
                          {a.customerPhone}
                        </span>
                        {a.lastReminderAt && (
                          <span className="inline-flex items-center gap-1 text-green-600">
                            <Bell className="h-3.5 w-3.5" />
                            Recordatorio enviado
                          </span>
                        )}
                      </div>
                      {a.notes && (
                        <p className="text-xs text-slate-400 mt-1.5 whitespace-pre-line line-clamp-2">
                          {a.notes}
                        </p>
                      )}
                    </div>

                    {canManage && !isClosed && (
                      <div className="flex flex-wrap gap-1.5">
                        {/* Qué se atendió: se registra ANTES de cerrar la cita,
                            porque al cerrarla el historial queda congelado. */}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          icon={<ListChecks className="h-3.5 w-3.5" />}
                          onClick={() => setLinesFor(a)}
                        >
                          Servicios
                          {a.lines.length > 0 && ` (${a.lines.length})`}
                        </Button>
                        {a.status !== 'CONFIRMED' && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            icon={<Check className="h-3.5 w-3.5" />}
                            onClick={() =>
                              runAction(a.id, () => appointmentsApi.confirm(a.id), 'Cita confirmada')
                            }
                          >
                            Confirmar
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          icon={<Clock className="h-3.5 w-3.5" />}
                          onClick={() => setRescheduling(a)}
                        >
                          Posponer
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          icon={<UserX className="h-3.5 w-3.5" />}
                          onClick={() =>
                            runAction(a.id, () => appointmentsApi.noShow(a.id), 'Marcada como no asistió')
                          }
                        >
                          No asistió
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                          onClick={() =>
                            runAction(a.id, () => appointmentsApi.complete(a.id), 'Cita completada')
                          }
                        >
                          Completar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          icon={<X className="h-3.5 w-3.5" />}
                          onClick={() =>
                            runAction(a.id, () => appointmentsApi.cancel(a.id), 'Cita cancelada')
                          }
                        >
                          Cancelar
                        </Button>
                      </div>
                    )}
                    {canManage && a.status === 'NO_SHOW' && (
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          icon={<Clock className="h-3.5 w-3.5" />}
                          onClick={() => setRescheduling(a)}
                        >
                          Reagendar
                        </Button>
                      </div>
                    )}

                    {/* Cita cerrada: su historial es de solo lectura, pero un
                        cierre equivocado se puede corregir reabriéndola (el
                        backend recalcula visitas y cancela sus seguimientos). */}
                    {canManage && a.status === 'COMPLETED' && (
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          icon={<ListChecks className="h-3.5 w-3.5" />}
                          onClick={() => setLinesFor(a)}
                        >
                          Ver servicios
                          {a.lines.length > 0 && ` (${a.lines.length})`}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          icon={<Undo2 className="h-3.5 w-3.5" />}
                          onClick={() =>
                            runAction(
                              a.id,
                              () => appointmentsApi.reopen(a.id, 'corrección desde el panel'),
                              'Cita reabierta. Las métricas del cliente se recalcularon.'
                            )
                          }
                        >
                          Reabrir
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {appointments.length > 0 && (
          <div className="px-4 pb-3">
            <PaginationBar
              total={total}
              page={page}
              pages={pages}
              limit={limit}
              onPageChange={setPage}
              onLimitChange={l => {
                setLimit(l)
                setPage(1)
              }}
              noun="citas"
            />
          </div>
        )}
      </Card>

      <AppointmentFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false)
          setPrefill(null)
        }}
        onSaved={() => {
          flash(editing ? 'Cita actualizada' : 'Cita creada')
          load()
        }}
        editing={editing}
        catalogItems={catalogItems}
        prefill={prefill}
      />

      <RescheduleModal
        appointment={rescheduling}
        onClose={() => setRescheduling(null)}
        onSaved={() => {
          flash('Cita pospuesta')
          load()
        }}
      />

      <AppointmentLinesModal
        open={linesFor !== null}
        appointment={linesFor}
        onClose={() => setLinesFor(null)}
        onChanged={() => void load()}
      />

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
