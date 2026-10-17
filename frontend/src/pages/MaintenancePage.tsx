import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Repeat, Search, CalendarPlus, MessageSquare, AlertTriangle, CalendarCheck,
  Clock, Wrench, ShoppingBag, Settings2, ChevronRight,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useAutoRefresh } from '../hooks/useAutoRefresh'
import { Card } from '../components/ui/Card'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import Alert from '../components/ui/Alert'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import PaginationBar from '../components/ui/PaginationBar'
import { getUserFriendlyErrorMessage } from '../lib/errors'
import {
  maintenanceApi,
  type MaintenanceCounters,
  type MaintenanceEntry,
  type MaintenanceService,
  type MaintenanceStatus,
} from '../services/maintenanceApi'

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder:text-slate-400 transition'

/** Presets de "vencido hace X". 40 días es el caso del retoque de color. */
const OVERDUE_PRESETS = [15, 30, 40, 60, 90] as const

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('es-DO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

/** Frase que el negocio quiere leer, no una fecha cruda. */
function dueLabel(entry: MaintenanceEntry): string {
  if (entry.status === 'DUE_TODAY') return 'Le toca hoy'
  if (entry.status === 'OVERDUE') {
    return entry.overdueDays === 1 ? 'Vencido hace 1 día' : `Vencido hace ${entry.overdueDays} días`
  }
  if (entry.daysUntilDue <= 1) return 'Le toca mañana'
  return `En ${entry.daysUntilDue} días`
}

function statusBadge(entry: MaintenanceEntry) {
  if (entry.status === 'OVERDUE') return <Badge variant="danger">Vencido</Badge>
  if (entry.status === 'DUE_TODAY') return <Badge variant="warning">Le toca hoy</Badge>
  return <Badge variant="info">Próximo</Badge>
}

export default function MaintenancePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const canManage = user?.role === 'OWNER' || user?.role === 'ADMIN'

  const [entries, setEntries] = useState<MaintenanceEntry[]>([])
  const [counters, setCounters] = useState<MaintenanceCounters | null>(null)
  const [services, setServices] = useState<MaintenanceService[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filtros (todos server-side)
  const [search, setSearch] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [status, setStatus] = useState<MaintenanceStatus | ''>('')
  const [overdueMinDays, setOverdueMinDays] = useState<number | ''>('')
  const [includeScheduled, setIncludeScheduled] = useState(false)

  // Paginación server-side. REGLA: cualquier cambio de filtro resetea page=1.
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)

  const withPageReset =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value)
      setPage(1)
    }

  const load = useCallback(async () => {
    setError('')
    try {
      const result = await maintenanceApi.schedule({
        search: search.trim() || undefined,
        serviceId: serviceId || undefined,
        status: status || undefined,
        overdueMinDays: overdueMinDays === '' ? undefined : overdueMinDays,
        includeScheduled: includeScheduled || undefined,
        page,
        limit,
      })
      setEntries(result.items)
      setTotal(result.total)
      setPages(result.pages)
    } catch (err) {
      setError(getUserFriendlyErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [search, serviceId, status, overdueMinDays, includeScheduled, page, limit])

  useEffect(() => {
    // Debounce de 300 ms solo para el buscador; el resto carga de inmediato.
    const timer = window.setTimeout(load, search ? 300 : 0)
    return () => window.clearTimeout(timer)
  }, [load, search])

  const loadAside = useCallback(() => {
    maintenanceApi.counters().then(setCounters).catch(() => setCounters(null))
    maintenanceApi.services().then(setServices).catch(() => setServices([]))
  }, [])

  useEffect(loadAside, [loadAside])

  // El cronograma cambia solo cuando se cierran citas: refresco suave.
  useAutoRefresh(() => {
    void load()
    loadAside()
  }, 60_000)

  const hasFilters = Boolean(
    search || serviceId || status || overdueMinDays !== '' || includeScheduled
  )

  const clearFilters = () => {
    setSearch('')
    setServiceId('')
    setStatus('')
    setOverdueMinDays('')
    setIncludeScheduled(false)
    setPage(1)
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
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Mantenimiento</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            A quién le toca volver y quién ya se pasó de fecha
          </p>
        </div>
        {canManage && (
          <Button
            variant="outline"
            icon={<Settings2 className="h-4 w-4" />}
            onClick={() => navigate('/catalog')}
          >
            Configurar recurrencias
          </Button>
        )}
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {/* Contadores reales */}
      {counters && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {[
            {
              label: 'Vencidos',
              value: counters.overdue,
              tone: 'text-red-600',
              status: 'OVERDUE' as const,
            },
            {
              label: 'Les toca hoy',
              value: counters.dueToday,
              tone: 'text-amber-600',
              status: 'DUE_TODAY' as const,
            },
            {
              label: 'Próximos',
              value: counters.upcoming,
              tone: 'text-blue-600',
              status: 'UPCOMING' as const,
            },
            {
              label: 'Ya agendados',
              value: counters.scheduled,
              tone: 'text-green-600',
              status: null,
            },
          ].map(item => (
            <button
              key={item.label}
              onClick={() => {
                if (item.status) {
                  withPageReset(setStatus)(status === item.status ? '' : item.status)
                } else {
                  withPageReset(setIncludeScheduled)(!includeScheduled)
                }
              }}
              className={`rounded-xl border bg-white px-4 py-3 text-left shadow-sm transition hover:border-slate-300 ${
                (item.status && status === item.status) ||
                (!item.status && includeScheduled)
                  ? 'border-primary-300 ring-1 ring-primary-200'
                  : 'border-slate-200'
              }`}
            >
              <p className={`text-xl font-bold ${item.tone}`}>{item.value}</p>
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                {item.label}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Sin servicios con recurrencia: el cronograma no puede existir */}
      {services.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={<Repeat className="h-10 w-10" />}
            title="Todavía no hay servicios que se repitan"
            description="El cronograma se construye solo a partir de tus servicios. Marca en el catálogo cuáles necesitan mantenimiento y cada cuánto (tinte cada 30 días, keratina cada 90, cambio de aceite cada 6 meses…) y aquí verás a quién le toca."
            action={
              canManage ? (
                <Button
                  icon={<Settings2 className="h-4 w-4" />}
                  onClick={() => navigate('/catalog')}
                >
                  Ir al catálogo
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <>
          {/* Barra compacta de filtros */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(200px,1fr)_220px_160px] gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={e => withPageReset(setSearch)(e.target.value)}
                placeholder="Cliente, teléfono o servicio…"
                className={`${inputClass} pl-9`}
              />
            </div>
            <select
              value={serviceId}
              onChange={e => withPageReset(setServiceId)(e.target.value)}
              className={inputClass}
              title="Servicio"
            >
              <option value="">Todos los servicios</option>
              {services.map(service => (
                <option key={service.id} value={service.id}>
                  {service.name} · {service.recurrenceLabel}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={e => withPageReset(setStatus)(e.target.value as MaintenanceStatus | '')}
              className={inputClass}
              title="Estado"
            >
              <option value="">Todos los estados</option>
              <option value="OVERDUE">Vencidos</option>
              <option value="DUE_TODAY">Les toca hoy</option>
              <option value="UPCOMING">Próximos</option>
            </select>
          </div>

          {/* Filtros rápidos */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-400">Vencido hace:</span>
            {OVERDUE_PRESETS.map(days => (
              <button
                key={days}
                onClick={() =>
                  withPageReset(setOverdueMinDays)(overdueMinDays === days ? '' : days)
                }
                className={`px-3 py-1.5 rounded-full border transition ${
                  overdueMinDays === days
                    ? 'bg-red-50 border-red-300 text-red-700'
                    : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {days}+ días
              </button>
            ))}
            <button
              onClick={() => withPageReset(setIncludeScheduled)(!includeScheduled)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition ${
                includeScheduled
                  ? 'bg-green-50 border-green-300 text-green-700'
                  : 'border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <CalendarCheck className="h-3.5 w-3.5" />
              Incluir los que ya tienen cita
            </button>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="px-3 py-1.5 rounded-full border border-slate-300 text-slate-500 hover:bg-slate-50 transition"
              >
                Limpiar filtros
              </button>
            )}
          </div>

          <Card padding="none">
            {entries.length === 0 ? (
              <EmptyState
                icon={<CalendarCheck className="h-10 w-10" />}
                title={
                  hasFilters ? 'No hay nadie con estos filtros' : 'Nadie tiene mantenimiento pendiente'
                }
                description={
                  hasFilters
                    ? 'Ajusta los filtros o límpialos para ver todo el cronograma.'
                    : 'Cuando tus clientes vayan completando servicios que se repiten, aquí aparecerá a quién le toca volver.'
                }
              />
            ) : (
              <>
                {/* Desktop: tabla compacta */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-4 py-3 font-medium">Cliente</th>
                        <th className="px-4 py-3 font-medium">Servicio</th>
                        <th className="px-4 py-3 font-medium">Última vez</th>
                        <th className="px-4 py-3 font-medium">Le toca</th>
                        <th className="px-4 py-3 font-medium text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {entries.map(entry => (
                        <tr
                          key={entry.id}
                          className="hover:bg-slate-50/70 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <Link
                              to={`/clientes/${entry.customerId}`}
                              className="font-medium text-slate-900 hover:text-primary-600 transition-colors"
                            >
                              {entry.customerName}
                            </Link>
                            <p className="text-xs text-slate-500">{entry.phoneDisplay}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1.5 text-slate-700">
                              {entry.itemType === 'PRODUCT' ? (
                                <ShoppingBag className="h-3.5 w-3.5 text-slate-400" />
                              ) : (
                                <Wrench className="h-3.5 w-3.5 text-slate-400" />
                              )}
                              {entry.serviceName}
                            </span>
                            <p className="text-xs text-slate-400">{entry.recurrenceLabel}</p>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                            {formatDate(entry.lastPerformedAt)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {statusBadge(entry)}
                              {entry.hasUpcomingAppointment && (
                                <Badge variant="success">Ya tiene cita</Badge>
                              )}
                            </div>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {dueLabel(entry)} · {formatDate(entry.dueAt)}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              {canManage && (
                                <button
                                  title="Agendar cita"
                                  onClick={() =>
                                    navigate(
                                      `/appointments?new=1&name=${encodeURIComponent(
                                        entry.customerName
                                      )}&phone=${encodeURIComponent(entry.phoneDisplay)}`
                                    )
                                  }
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-primary-600 hover:bg-primary-50 transition"
                                >
                                  <CalendarPlus className="h-4 w-4" />
                                </button>
                              )}
                              <button
                                title="Ver conversaciones"
                                onClick={() => navigate('/conversations')}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                              >
                                <MessageSquare className="h-4 w-4" />
                              </button>
                              <Link
                                to={`/clientes/${entry.customerId}`}
                                title="Ver ficha"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                              >
                                <ChevronRight className="h-4 w-4" />
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile: tarjetas (nada de tablas con scroll horizontal) */}
                <div className="md:hidden divide-y divide-slate-100">
                  {entries.map(entry => (
                    <div key={entry.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link
                            to={`/clientes/${entry.customerId}`}
                            className="font-medium text-slate-900"
                          >
                            {entry.customerName}
                          </Link>
                          <p className="text-sm text-slate-500">{entry.serviceName}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          {statusBadge(entry)}
                          {entry.hasUpcomingAppointment && (
                            <Badge variant="success">Ya tiene cita</Badge>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          {entry.status === 'OVERDUE' ? (
                            <AlertTriangle className="h-3 w-3 text-red-500" />
                          ) : (
                            <Clock className="h-3 w-3" />
                          )}
                          {dueLabel(entry)}
                        </span>
                        <span>·</span>
                        <span>Última vez: {formatDate(entry.lastPerformedAt)}</span>
                      </div>
                      {canManage && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2"
                          icon={<CalendarPlus className="h-3.5 w-3.5" />}
                          onClick={() =>
                            navigate(
                              `/appointments?new=1&name=${encodeURIComponent(
                                entry.customerName
                              )}&phone=${encodeURIComponent(entry.phoneDisplay)}`
                            )
                          }
                        >
                          Agendar
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="px-4 pb-3">
                  <PaginationBar
                    total={total}
                    page={page}
                    pages={pages}
                    limit={limit}
                    onPageChange={setPage}
                    onLimitChange={value => {
                      setLimit(value)
                      setPage(1)
                    }}
                    noun="mantenimientos"
                  />
                </div>
              </>
            )}
          </Card>

          <p className="text-xs text-slate-400">
            Las fechas se calculan con la recurrencia que tiene <strong>hoy</strong> cada servicio
            en tu catálogo. Si cambias un intervalo, el cronograma se actualiza al instante; los
            recordatorios que ya estaban programados conservan su fecha original y se ven en la
            ficha de cada cliente.
          </p>
        </>
      )}
    </div>
  )
}
