import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Pencil, MessageSquare, CalendarPlus, Star, Archive, ArchiveRestore,
  Phone, Mail, MapPin, IdCard, Cake, CalendarDays, FileText, Bot, Sparkles,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Card, CardHeader } from '../components/ui/Card'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import Alert from '../components/ui/Alert'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import PaginationBar from '../components/ui/PaginationBar'
import CustomerFormModal from '../components/customers/CustomerFormModal'
import CustomerCategoriesCard from '../components/customers/CustomerCategoriesCard'
import CategoryBadge from '../components/customers/CategoryBadge'
import CustomerFollowUpsCard from '../components/customers/CustomerFollowUpsCard'
import {
  customersApi,
  type CustomerCommercialSummary,
  type CustomerProfile,
  type CustomerTimelineEntry,
} from '../services/customersApi'
import { formatDate, relativeVisit, riskBadge, stageBadge } from './CustomersPage'

function formatMoney(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString('es-DO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatDateTime(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('es-DO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

/** Cumpleaños en texto: "18 de abril" (sin año, que es dato sensible de más). */
function formatBirthday(value: string | null) {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  const label = new Intl.DateTimeFormat('es-DO', { day: 'numeric', month: 'long' }).format(
    new Date(Date.UTC(2000, month - 1, day))
  )
  return `${label} (${year})`
}

function Field({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string | null
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="mt-0.5 text-slate-400 flex-shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <p className={`text-sm break-words ${value ? 'text-slate-900' : 'text-slate-400'}`}>
          {value || 'Sin registrar'}
        </p>
      </div>
    </div>
  )
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
    </div>
  )
}

const TIMELINE_STYLE: Record<CustomerTimelineEntry['type'], { icon: React.ReactNode; ring: string }> = {
  APPOINTMENT: { icon: <CalendarDays className="h-4 w-4" />, ring: 'bg-primary-50 text-primary-600' },
  QUOTE: { icon: <FileText className="h-4 w-4" />, ring: 'bg-blue-50 text-blue-600' },
  CONVERSATION: { icon: <MessageSquare className="h-4 w-4" />, ring: 'bg-green-50 text-green-600' },
  AUTOMATION: { icon: <Bot className="h-4 w-4" />, ring: 'bg-violet-50 text-violet-600' },
  SCHEDULED_MESSAGE: { icon: <Bot className="h-4 w-4" />, ring: 'bg-violet-50 text-violet-600' },
}

export default function CustomerDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const canManage = user?.role === 'OWNER' || user?.role === 'ADMIN'

  const [customer, setCustomer] = useState<CustomerProfile | null>(null)
  const [summary, setSummary] = useState<CustomerCommercialSummary | null>(null)
  const [timeline, setTimeline] = useState<CustomerTimelineEntry[]>([])
  const [timelinePage, setTimelinePage] = useState(1)
  const [timelinePages, setTimelinePages] = useState(1)
  const [timelineTotal, setTimelineTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  const loadCustomer = useCallback(async () => {
    setError('')
    try {
      const [profile, commercial] = await Promise.all([
        customersApi.get(id),
        customersApi.summary(id),
      ])
      setCustomer(profile)
      setSummary(commercial)
    } catch (err) {
      setError((err as { message?: string })?.message || 'No pudimos cargar este cliente')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void loadCustomer()
  }, [loadCustomer])

  useEffect(() => {
    customersApi
      .timeline(id, timelinePage, 15)
      .then(result => {
        setTimeline(result.items)
        setTimelinePages(result.pages)
        setTimelineTotal(result.total)
      })
      .catch(() => setTimeline([]))
  }, [id, timelinePage])

  const flash = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 3000)
  }

  const toggleVip = async () => {
    if (!customer) return
    setBusy(true)
    try {
      const updated = await customersApi.update(customer.id, { isVip: !customer.isVip })
      setCustomer(updated)
      flash(updated.isVip ? 'Marcado como VIP' : 'Ya no es VIP')
    } catch (err) {
      setError((err as { message?: string })?.message || 'No se pudo actualizar')
    } finally {
      setBusy(false)
    }
  }

  const toggleArchive = async () => {
    if (!customer) return
    setBusy(true)
    try {
      const updated = await customersApi.archive(customer.id, customer.stage !== 'ARCHIVED')
      setCustomer(updated)
      flash(updated.stage === 'ARCHIVED' ? 'Cliente archivado' : 'Cliente restaurado')
    } catch (err) {
      setError((err as { message?: string })?.message || 'No se pudo actualizar')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="p-4 lg:p-6 max-w-screen-xl mx-auto w-full space-y-4">
        <Link to="/clientes" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" /> Volver a clientes
        </Link>
        <Alert variant="danger">{error || 'Este cliente no existe o no pertenece a tu empresa.'}</Alert>
      </div>
    )
  }

  const quotes = summary?.quotes
  const serviced = summary?.serviced

  return (
    <div className="p-4 lg:p-6 max-w-screen-xl mx-auto w-full space-y-4">
      <Link
        to="/clientes"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a clientes
      </Link>

      {error && <Alert variant="danger">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      {/* Header */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">{customer.name}</h1>
              {stageBadge(customer.stage)}
              {customer.isVip && (
                <Badge variant="warning">
                  <Star className="h-3 w-3 mr-1 fill-current" />
                  VIP
                </Badge>
              )}
              {riskBadge(customer.riskStatus)}
            </div>
            <p className="mt-1 text-sm text-slate-600">{customer.phoneDisplay}</p>
            {customer.email && <p className="text-sm text-slate-500">{customer.email}</p>}
            {/* Categorías del Módulo 2: se administran en su propia tarjeta,
                aquí solo se resumen para reconocer al cliente de un vistazo. */}
            {customer.categories.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {customer.categories.map(category => (
                  <CategoryBadge key={category.id} category={category} />
                ))}
              </div>
            )}
            <p className="mt-1 text-xs text-slate-400">
              {relativeVisit(customer)}
              {customer.lastVisitAt ? ` · última visita el ${formatDate(customer.lastVisitAt)}` : ''}
            </p>
          </div>

          {canManage && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                icon={<Pencil className="h-4 w-4" />}
                onClick={() => setEditOpen(true)}
              >
                Editar
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={<MessageSquare className="h-4 w-4" />}
                onClick={() => navigate('/conversations')}
              >
                Conversaciones
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={<CalendarPlus className="h-4 w-4" />}
                onClick={() =>
                  navigate(
                    `/appointments?new=1&name=${encodeURIComponent(
                      customer.name
                    )}&phone=${encodeURIComponent(customer.phoneNormalized ?? customer.phone)}`
                  )
                }
              >
                Agendar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                loading={busy}
                icon={<Star className={`h-4 w-4 ${customer.isVip ? 'fill-amber-400 text-amber-400' : ''}`} />}
                onClick={toggleVip}
              >
                {customer.isVip ? 'Quitar VIP' : 'Marcar VIP'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                loading={busy}
                icon={
                  customer.stage === 'ARCHIVED' ? (
                    <ArchiveRestore className="h-4 w-4" />
                  ) : (
                    <Archive className="h-4 w-4" />
                  )
                }
                onClick={toggleArchive}
              >
                {customer.stage === 'ARCHIVED' ? 'Restaurar' : 'Archivar'}
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Segmentación (Módulo 2) */}
      <CustomerCategoriesCard
        customerId={customer.id}
        canManage={canManage}
        onChanged={() => void loadCustomer()}
      />

      {/* Próximos seguimientos (Módulo 3): automatizaciones reales ya programadas */}
      <CustomerFollowUpsCard customerId={customer.id} canManage={canManage} />

      {/* Resumen comercial */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="Visitas"
          value={String(summary?.visitCount ?? 0)}
          hint="Citas completadas"
        />
        <StatTile
          label="Valor realizado"
          value={serviced ? formatMoney(serviced.total, serviced.currency) : '—'}
          hint="Servicios y productos de sus visitas"
        />
        <StatTile
          label="Promedio por visita"
          value={serviced ? formatMoney(serviced.averagePerVisit, serviced.currency) : '—'}
          hint={`${serviced?.visitsWithValue ?? 0} visita(s) con importe`}
        />
        <StatTile
          label="Primera visita"
          value={formatDate(summary?.firstVisitAt ?? null)}
          hint={summary?.appointments.upcoming ? `${summary.appointments.upcoming} cita(s) próxima(s)` : undefined}
        />
      </div>

      <Alert variant="info">
        El <strong>valor realizado</strong> es lo que costaban los servicios y productos de cada
        visita el día en que se hicieron. Sendwary todavía no registra cobros de cliente final, así
        que no es dinero pagado.
        {quotes && quotes.issued > 0 && (
          <>
            {' '}
            Además tiene {quotes.issued} cotización(es) por{' '}
            {formatMoney(quotes.totalQuoted, quotes.currency)}.
          </>
        )}
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Información personal */}
        <Card className="lg:col-span-1">
          <CardHeader title="Información" description="Datos de contacto del cliente" />
          <div className="divide-y divide-slate-100">
            <Field icon={<Phone className="h-4 w-4" />} label="WhatsApp" value={customer.phoneDisplay} />
            <Field icon={<Mail className="h-4 w-4" />} label="Email" value={customer.email} />
            <Field icon={<Cake className="h-4 w-4" />} label="Cumpleaños" value={formatBirthday(customer.birthDate)} />
            <Field icon={<IdCard className="h-4 w-4" />} label="Cédula o documento" value={customer.documentId} />
            <Field icon={<MapPin className="h-4 w-4" />} label="Dirección" value={customer.address} />
            <Field
              icon={<Sparkles className="h-4 w-4" />}
              label="Origen"
              value={
                {
                  WHATSAPP: 'WhatsApp',
                  MANUAL: 'Alta manual',
                  APPOINTMENT: 'Cita',
                  IMPORT: 'Importación',
                  VOICE: 'Llamada',
                  API: 'API',
                }[customer.source]
              }
            />
          </div>
          {customer.notes && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="text-xs text-slate-500 mb-1">Notas internas</p>
              {/* Texto plano: nunca se interpreta como HTML. */}
              <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">
                {customer.notes}
              </p>
            </div>
          )}
        </Card>

        {/* Actividad + historial */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader
              title="Actividad comercial"
              description="Todo sale de las citas, cotizaciones y conversaciones reales"
            />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              {[
                { label: 'Citas', value: summary?.appointments.total ?? 0 },
                { label: 'Completadas', value: summary?.appointments.completed ?? 0 },
                { label: 'No asistió', value: summary?.appointments.noShow ?? 0 },
                { label: 'Conversaciones', value: summary?.conversations ?? 0 },
              ].map(item => (
                <div key={item.label} className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-lg font-bold text-slate-900">{item.value}</p>
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">{item.label}</p>
                </div>
              ))}
            </div>

            {summary && summary.services.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  Servicios realizados
                </p>
                <div className="space-y-1.5">
                  {summary.services.map(service => (
                    <div
                      key={service.name}
                      className="flex items-center justify-between gap-3 text-sm border-b border-slate-100 pb-1.5 last:border-0"
                    >
                      <span className="text-slate-700 truncate">{service.name}</span>
                      <span className="text-xs text-slate-500 whitespace-nowrap">
                        {service.count}× · {formatDate(service.lastAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {summary && summary.products.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  Productos cotizados
                </p>
                <div className="space-y-1.5">
                  {summary.products.map(product => (
                    <div
                      key={product.id}
                      className="flex items-center justify-between gap-3 text-sm border-b border-slate-100 pb-1.5 last:border-0"
                    >
                      <span className="text-slate-700 truncate">{product.name}</span>
                      <span className="text-xs text-slate-500 whitespace-nowrap">
                        {product.quantity} und · {formatMoney(product.amount, quotes?.currency ?? 'DOP')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card padding="none">
            <div className="px-6 pt-6">
              <CardHeader
                title="Historial"
                description={`${timelineTotal} evento(s) entre citas, cotizaciones, conversaciones y automatizaciones`}
              />
            </div>
            {timeline.length === 0 ? (
              <EmptyState
                icon={<CalendarDays className="h-10 w-10" />}
                title="Todavía no hay actividad"
                description="Aquí verás sus citas, cotizaciones, conversaciones y los mensajes automáticos que reciba."
              />
            ) : (
              <div className="px-6 pb-2">
                <ol className="relative border-l border-slate-200 ml-3 space-y-4 py-2">
                  {timeline.map(entry => {
                    const style = TIMELINE_STYLE[entry.type]
                    return (
                      <li key={entry.id} className="ml-6">
                        <span
                          className={`absolute -left-[13px] flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-white ${style.ring}`}
                        >
                          {style.icon}
                        </span>
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <p className="text-sm font-medium text-slate-900">{entry.title}</p>
                          <time className="text-xs text-slate-400">
                            {formatDateTime(entry.occurredAt)}
                          </time>
                        </div>
                        {entry.summary && (
                          <p className="text-sm text-slate-500 break-words">{entry.summary}</p>
                        )}
                      </li>
                    )
                  })}
                </ol>
              </div>
            )}
            {timelineTotal > 0 && (
              <div className="px-6 pb-4">
                <PaginationBar
                  total={timelineTotal}
                  page={timelinePage}
                  pages={timelinePages}
                  limit={15}
                  onPageChange={setTimelinePage}
                  onLimitChange={() => undefined}
                  noun="eventos"
                />
              </div>
            )}
          </Card>
        </div>
      </div>

      <CustomerFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        editing={customer}
        onSaved={updated => {
          setCustomer(updated)
          flash('Cliente actualizado')
          void loadCustomer()
        }}
      />
    </div>
  )
}
