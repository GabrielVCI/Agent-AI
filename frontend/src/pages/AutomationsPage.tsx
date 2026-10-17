import { useCallback, useEffect, useState } from 'react'
import {
  Zap, Plus, Play, Pause, Pencil, Archive, Sparkles, ArrowRight, Clock,
  AlertTriangle, X, Inbox,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useAutoRefresh } from '../hooks/useAutoRefresh'
import { Card } from '../components/ui/Card'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import Alert from '../components/ui/Alert'
import Modal from '../components/ui/Modal'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import PaginationBar from '../components/ui/PaginationBar'
import AutomationRuleModal from '../components/automations/AutomationRuleModal'
import {
  ACTION_META,
  JOB_STATUS_META,
  RULE_STATUS_META,
  SCHEDULE_META,
  actionLabel,
  eventIcon,
  eventLabel,
} from '../components/automations/automation-meta'
import { getUserFriendlyErrorMessage } from '../lib/errors'
import {
  automationsApi,
  type AutomationCatalog,
  type AutomationHealth,
  type AutomationJob,
  type AutomationJobStatus,
  type AutomationRule,
} from '../services/automationsApi'

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition'

type Tab = 'rules' | 'queue'

function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('es-DO', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

/** "en 3 días" / "hace 2 h": lo que se quiere leer de un envío programado. */
function relative(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now()
  const minutes = Math.round(Math.abs(diff) / 60000)
  const prefix = diff >= 0 ? 'en' : 'hace'
  if (minutes < 60) return `${prefix} ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${prefix} ${hours} h`
  return `${prefix} ${Math.round(hours / 24)} días`
}

/** Resumen legible de cuándo se ejecuta una regla. */
function scheduleSummary(rule: AutomationRule): string {
  const minutes = rule.delayMinutes
  const human =
    minutes >= 1440
      ? `${Math.round(minutes / 1440)} día(s)`
      : minutes >= 60
        ? `${Math.round(minutes / 60)} h`
        : `${minutes} min`

  switch (rule.scheduleStrategy) {
    case 'IMMEDIATE':
      return 'enseguida'
    case 'DELAY':
      return `${human} después`
    case 'DAILY_AT_LOCAL_TIME':
      return `${human} después, a las ${rule.scheduleConfig?.localTime ?? '—'}`
    case 'RELATIVE_TO_FIELD': {
      const offset = rule.scheduleConfig?.offsetMinutes ?? 0
      const hours = Math.abs(Math.round(offset / 60))
      return offset < 0 ? `${hours} h antes` : `${hours} h después`
    }
    default:
      return ''
  }
}

export default function AutomationsPage() {
  const { user } = useAuth()
  const canManage = user?.role === 'OWNER' || user?.role === 'ADMIN'

  const [tab, setTab] = useState<Tab>('rules')
  const [catalog, setCatalog] = useState<AutomationCatalog | null>(null)
  const [health, setHealth] = useState<AutomationHealth | null>(null)
  const [rules, setRules] = useState<AutomationRule[]>([])
  const [jobs, setJobs] = useState<AutomationJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const [statusFilter, setStatusFilter] = useState('')
  const [jobStatusFilter, setJobStatusFilter] = useState('')

  const [jobPage, setJobPage] = useState(1)
  const [jobPages, setJobPages] = useState(1)
  const [jobTotal, setJobTotal] = useState(0)
  const [jobLimit, setJobLimit] = useState(20)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<AutomationRule | null>(null)
  const [archiving, setArchiving] = useState<AutomationRule | null>(null)
  const [templatesOpen, setTemplatesOpen] = useState(false)

  const flash = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 4000)
  }

  const loadRules = useCallback(async () => {
    try {
      const result = await automationsApi.listRules({
        status: (statusFilter || undefined) as AutomationRule['status'] | undefined,
        limit: 100,
      })
      setRules(result.items)
      setError('')
    } catch (err) {
      setError(getUserFriendlyErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  const loadJobs = useCallback(async () => {
    try {
      const result = await automationsApi.listJobs({
        status: (jobStatusFilter || undefined) as AutomationJobStatus | undefined,
        page: jobPage,
        limit: jobLimit,
      })
      setJobs(result.items)
      setJobPages(result.pages)
      setJobTotal(result.total)
    } catch (err) {
      setError(getUserFriendlyErrorMessage(err))
    }
  }, [jobStatusFilter, jobPage, jobLimit])

  const loadAside = useCallback(() => {
    automationsApi.catalog().then(setCatalog).catch(() => setCatalog(null))
    automationsApi.health().then(setHealth).catch(() => setHealth(null))
  }, [])

  useEffect(() => {
    void loadRules()
  }, [loadRules])

  useEffect(() => {
    if (tab === 'queue') void loadJobs()
  }, [tab, loadJobs])

  useEffect(loadAside, [loadAside])

  // La cola se mueve sola (el worker la consume): refresco periódico.
  useAutoRefresh(() => {
    loadAside()
    if (tab === 'queue') void loadJobs()
  }, 30_000)

  const setRuleStatus = async (rule: AutomationRule, status: AutomationRule['status']) => {
    setBusyId(rule.id)
    setError('')
    try {
      await automationsApi.updateRule(rule.id, { status, enabled: status === 'ACTIVE' })
      flash(
        status === 'ACTIVE'
          ? `"${rule.name}" está activa y empezará a ejecutarse.`
          : `"${rule.name}" quedó en pausa.`
      )
      await loadRules()
      loadAside()
    } catch (err) {
      setError(getUserFriendlyErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const archiveRule = async (rule: AutomationRule) => {
    setBusyId(rule.id)
    setError('')
    try {
      const result = await automationsApi.archiveRule(rule.id)
      flash(
        result.cancelledJobs > 0
          ? `"${rule.name}" archivada. Se cancelaron ${result.cancelledJobs} envío(s) pendiente(s).`
          : `"${rule.name}" archivada.`
      )
      setArchiving(null)
      await loadRules()
      loadAside()
    } catch (err) {
      setError(getUserFriendlyErrorMessage(err))
      setArchiving(null)
    } finally {
      setBusyId(null)
    }
  }

  const useTemplate = async (templateKey: string, title: string) => {
    setBusyId(templateKey)
    setError('')
    try {
      await automationsApi.useTemplate(templateKey)
      flash(`"${title}" se agregó como borrador. Revísala y actívala.`)
      setTemplatesOpen(false)
      await loadRules()
    } catch (err) {
      setError(getUserFriendlyErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const cancelJob = async (job: AutomationJob) => {
    setBusyId(job.id)
    setError('')
    try {
      await automationsApi.cancelJob(job.id, 'Cancelado desde el panel')
      flash('Envío cancelado.')
      await loadJobs()
      loadAside()
    } catch (err) {
      setError(getUserFriendlyErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  /** Plantillas que el tenant todavía no instanció. */
  const usedTemplateKeys = new Set(rules.map(rule => rule.templateKey).filter(Boolean))
  const availableTemplates =
    catalog?.templates.filter(template => !usedTemplateKeys.has(template.key)) ?? []

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
          <h1 className="text-xl font-bold text-slate-900">Automatizaciones</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Recordatorios, seguimientos y mensajes que tu negocio envía solo
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              icon={<Sparkles className="h-4 w-4" />}
              onClick={() => setTemplatesOpen(true)}
            >
              Usar plantilla
            </Button>
            <Button
              icon={<Plus className="h-4 w-4" />}
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              Nueva automatización
            </Button>
          </div>
        )}
      </div>

      {error && <Alert variant="danger">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      {/* Salud del motor: cifras reales de la cola */}
      {health && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {[
            { label: 'Programados', value: health.pending, tone: 'text-blue-600' },
            { label: 'Enviados', value: health.counts.COMPLETED, tone: 'text-green-600' },
            { label: 'Fallidos', value: health.counts.FAILED, tone: 'text-red-600' },
            { label: 'Cancelados', value: health.counts.CANCELLED, tone: 'text-slate-500' },
            {
              label: 'Activas',
              value: rules.filter(rule => rule.status === 'ACTIVE').length,
              tone: 'text-slate-900',
            },
          ].map(item => (
            <Card key={item.label} padding="sm">
              <p className={`text-xl font-bold ${item.tone}`}>{item.value}</p>
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                {item.label}
              </p>
            </Card>
          ))}
        </div>
      )}

      {health?.nextDue && (
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <Clock className="h-3.5 w-3.5" />
          Próximo envío: {eventLabel(health.nextDue.eventType)} ·{' '}
          {formatDateTime(health.nextDue.scheduledFor)} ({relative(health.nextDue.scheduledFor)})
        </p>
      )}

      {health && health.staleProcessing > 0 && (
        <Alert variant="warning">
          Hay {health.staleProcessing} envío(s) atascado(s) procesándose hace más de 15 minutos. El
          motor los recupera solo; si persiste, avisa a soporte.
        </Alert>
      )}

      {/* Pestañas */}
      <div className="flex gap-1 border-b border-slate-200">
        {([
          { id: 'rules' as Tab, label: 'Automatizaciones' },
          { id: 'queue' as Tab, label: 'Envíos programados' },
        ]).map(item => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`px-4 py-2 text-sm font-medium transition border-b-2 -mb-px ${
              tab === item.id
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* ── Reglas ── */}
      {tab === 'rules' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className={`${inputClass} w-44`}
              title="Estado"
            >
              <option value="">Todas menos archivadas</option>
              <option value="ACTIVE">Solo activas</option>
              <option value="DRAFT">Solo borradores</option>
              <option value="INACTIVE">Solo pausadas</option>
              <option value="ARCHIVED">Archivadas</option>
            </select>
          </div>

          {rules.length === 0 ? (
            <Card padding="none">
              <EmptyState
                icon={<Zap className="h-10 w-10" />}
                title={
                  statusFilter
                    ? 'No hay automatizaciones con ese estado'
                    : 'Todavía no tienes automatizaciones'
                }
                description={
                  statusFilter
                    ? 'Cambia el filtro para ver el resto.'
                    : 'Empieza por una plantilla: recordar la cita del día siguiente, hacer seguimiento después del servicio o invitar a volver a quien no viene hace un mes.'
                }
                action={
                  canManage && !statusFilter ? (
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button
                        icon={<Sparkles className="h-4 w-4" />}
                        onClick={() => setTemplatesOpen(true)}
                      >
                        Ver plantillas
                      </Button>
                      <Button
                        variant="outline"
                        icon={<Plus className="h-4 w-4" />}
                        onClick={() => {
                          setEditing(null)
                          setFormOpen(true)
                        }}
                      >
                        Crear desde cero
                      </Button>
                    </div>
                  ) : undefined
                }
              />
            </Card>
          ) : (
            <div className="space-y-2">
              {rules.map(rule => {
                const status = RULE_STATUS_META[rule.status]
                const busy = busyId === rule.id
                return (
                  <Card key={rule.id} padding="sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-slate-900">{rule.name}</span>
                          <Badge variant={status.variant}>{status.label}</Badge>
                          {rule.templateKey && (
                            <Badge variant="info" className="gap-1">
                              <Sparkles className="h-3 w-3" />
                              Plantilla
                            </Badge>
                          )}
                        </div>

                        {/* Cuando → Entonces, en una línea legible */}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                          <span className="inline-flex items-center gap-1 text-slate-500">
                            {eventIcon(rule.eventType)}
                            {eventLabel(rule.eventType)}
                          </span>
                          <ArrowRight className="h-3 w-3 text-slate-300" />
                          <span className="inline-flex items-center gap-1">
                            {ACTION_META[rule.actionType]?.icon}
                            {actionLabel(rule.actionType)}
                          </span>
                          <span className="text-slate-400">· {scheduleSummary(rule)}</span>
                        </div>

                        {rule.description && (
                          <p className="mt-1 text-xs text-slate-400">{rule.description}</p>
                        )}

                        {rule.cancelOnEventTypes.length > 0 && (
                          <p className="mt-1 text-[11px] text-slate-400">
                            Se cancela si:{' '}
                            {rule.cancelOnEventTypes.map(eventLabel).join(' · ')}
                          </p>
                        )}
                      </div>

                      {canManage && rule.status !== 'ARCHIVED' && (
                        <div className="flex flex-wrap gap-1.5">
                          {rule.status === 'ACTIVE' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              icon={<Pause className="h-3.5 w-3.5" />}
                              onClick={() => void setRuleStatus(rule, 'INACTIVE')}
                            >
                              Pausar
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              disabled={busy}
                              icon={<Play className="h-3.5 w-3.5" />}
                              onClick={() => void setRuleStatus(rule, 'ACTIVE')}
                            >
                              Activar
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            icon={<Pencil className="h-3.5 w-3.5" />}
                            onClick={() => {
                              setEditing(rule)
                              setFormOpen(true)
                            }}
                          >
                            Editar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            icon={<Archive className="h-3.5 w-3.5" />}
                            onClick={() => setArchiving(rule)}
                          >
                            Archivar
                          </Button>
                        </div>
                      )}
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ── Cola ── */}
      {tab === 'queue' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={jobStatusFilter}
              onChange={e => {
                setJobStatusFilter(e.target.value)
                setJobPage(1)
              }}
              className={`${inputClass} w-48`}
              title="Estado del envío"
            >
              <option value="">Todos los envíos</option>
              {(Object.keys(JOB_STATUS_META) as AutomationJobStatus[]).map(status => (
                <option key={status} value={status}>
                  {JOB_STATUS_META[status].label}
                </option>
              ))}
            </select>
          </div>

          <Card padding="none">
            {jobs.length === 0 ? (
              <EmptyState
                icon={<Inbox className="h-10 w-10" />}
                title="No hay envíos con ese filtro"
                description="Aquí aparece lo que tus automatizaciones tienen programado, ya enviado o fallido."
              />
            ) : (
              <>
                <div className="divide-y divide-slate-100">
                  {jobs.map(job => {
                    const status = JOB_STATUS_META[job.status]
                    const cancellable =
                      job.status === 'SCHEDULED' ||
                      job.status === 'PENDING' ||
                      job.status === 'RETRY_PENDING'
                    return (
                      <div
                        key={job.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-slate-900">
                              {job.ruleName ?? 'Automatización eliminada'}
                            </span>
                            <Badge variant={status.variant}>{status.label}</Badge>
                          </div>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {actionLabel(job.actionType)} · {formatDateTime(job.scheduledFor)} (
                            {relative(job.scheduledFor)})
                            {job.attemptCount > 0 &&
                              ` · intento ${job.attemptCount}/${job.maxAttempts}`}
                          </p>
                          {job.lastError && (
                            <p className="mt-1 flex items-start gap-1 text-xs text-red-600">
                              <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
                              {job.lastError}
                            </p>
                          )}
                          {job.cancelReason && (
                            <p className="mt-1 text-xs text-slate-400">
                              Cancelado: {job.cancelReason}
                            </p>
                          )}
                        </div>

                        {canManage && cancellable && (
                          <button
                            title="Cancelar este envío"
                            disabled={busyId === job.id}
                            onClick={() => void cancelJob(job)}
                            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>

                <div className="px-4 pb-3">
                  <PaginationBar
                    total={jobTotal}
                    page={jobPage}
                    pages={jobPages}
                    limit={jobLimit}
                    onPageChange={setJobPage}
                    onLimitChange={value => {
                      setJobLimit(value)
                      setJobPage(1)
                    }}
                    noun="envíos"
                  />
                </div>
              </>
            )}
          </Card>
        </>
      )}

      <AutomationRuleModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editing={editing}
        catalog={catalog}
        onSaved={rule => {
          flash(
            editing
              ? 'Automatización actualizada'
              : `"${rule.name}" se creó como borrador. Actívala cuando quieras que empiece.`
          )
          void loadRules()
        }}
      />

      {/* Plantillas */}
      <Modal
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        size="xl"
        title="Plantillas de Sendwary"
        description="Automatizaciones listas para usar. Se agregan como borrador para que las revises antes de activarlas."
      >
        {availableTemplates.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">
            Ya tienes todas las plantillas disponibles. Crea una automatización desde cero para
            algo distinto.
          </p>
        ) : (
          <div className="space-y-2">
            {availableTemplates.map(templateItem => (
              <div
                key={templateItem.key}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-200 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900">{templateItem.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{templateItem.summary}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      {eventIcon(templateItem.eventType)}
                      {eventLabel(templateItem.eventType)}
                    </span>
                    <ArrowRight className="h-3 w-3" />
                    <span>{actionLabel(templateItem.actionType)}</span>
                  </div>
                </div>
                <Button
                  size="sm"
                  loading={busyId === templateItem.key}
                  // `useTemplate` es "usar esta plantilla", no un hook de React:
                  // la regla solo se guía por el prefijo `use` del nombre.
                  // eslint-disable-next-line react-hooks/rules-of-hooks
                  onClick={() => void useTemplate(templateItem.key, templateItem.title)}
                >
                  Agregar
                </Button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Confirmación de archivado */}
      <Modal
        open={archiving !== null}
        onClose={() => setArchiving(null)}
        title="¿Archivar esta automatización?"
        size="sm"
      >
        <p className="text-sm text-slate-600">
          <strong>{archiving?.name}</strong> dejará de ejecutarse y se cancelarán sus envíos aún
          pendientes. El historial de lo que ya se envió se conserva.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setArchiving(null)} disabled={busyId !== null}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            loading={busyId === archiving?.id}
            onClick={() => archiving && void archiveRule(archiving)}
          >
            Archivar
          </Button>
        </div>
      </Modal>
    </div>
  )
}
