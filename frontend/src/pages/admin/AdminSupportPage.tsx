import { useCallback, useEffect, useState, FormEvent } from 'react'
import {
  LifeBuoy, Plus, Sparkles, RefreshCw, AlertTriangle, CheckCircle2,
  Activity, BookOpen, ClipboardList, Bot,
} from 'lucide-react'
import api from '../../lib/api'
import { Card } from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import Alert from '../../components/ui/Alert'
import Modal from '../../components/ui/Modal'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import EmptyState from '../../components/ui/EmptyState'
import { useAutoRefresh } from '../../hooks/useAutoRefresh'

// ─── Tipos (contrato /api/support) ───────────────────────────────────────────

type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_USER' | 'RESOLVED' | 'ESCALATED' | 'CLOSED'
type Tier = 'TIER_1' | 'TIER_2' | 'TIER_3'
type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

interface SupportTicket {
  id: string
  tenantId: string | null
  title: string
  description: string
  status: TicketStatus
  tier: Tier
  severity: Severity
  category: string | null
  source: string
  aiSummary: string | null
  detectedIssue: string | null
  recommendedAction: string | null
  resolution: string | null
  createdAt: string
  resolvedAt: string | null
}

interface TriageResult {
  tier: Tier
  severity: Severity
  category: string
  playbookSlug: string | null
  playbookTitle: string | null
  detectedIssue: string
  recommendedSteps: string[]
  requiresHuman: boolean
  incident: boolean
  confidence: number
  aiSummary: string | null
}

interface TriageResponse {
  triage: TriageResult
  playbookExcerpt: string | null
  tenantContext: Record<string, unknown> | null
  health: Record<string, unknown> | null
  ticketId: string | null
  actionsTaken: string[]
}

const statusMeta: Record<TicketStatus, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' }> = {
  OPEN: { label: 'Abierto', variant: 'info' },
  IN_PROGRESS: { label: 'En progreso', variant: 'purple' },
  WAITING_USER: { label: 'Espera usuario', variant: 'warning' },
  RESOLVED: { label: 'Resuelto', variant: 'success' },
  ESCALATED: { label: 'Escalado', variant: 'danger' },
  CLOSED: { label: 'Cerrado', variant: 'default' },
}

const tierMeta: Record<Tier, { label: string; variant: 'info' | 'warning' | 'danger' }> = {
  TIER_1: { label: 'Tier 1', variant: 'info' },
  TIER_2: { label: 'Tier 2', variant: 'warning' },
  TIER_3: { label: 'Tier 3', variant: 'danger' },
}

const severityMeta: Record<Severity, { label: string; variant: 'default' | 'info' | 'warning' | 'danger' }> = {
  LOW: { label: 'Baja', variant: 'default' },
  MEDIUM: { label: 'Media', variant: 'info' },
  HIGH: { label: 'Alta', variant: 'warning' },
  CRITICAL: { label: 'Crítica', variant: 'danger' },
}

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder:text-slate-400 transition'

function formatDate(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : new Intl.DateTimeFormat('es-DO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(d)
}

// ─── Triage IA ───────────────────────────────────────────────────────────────

function TriagePanel({ onTicketCreated }: { onTicketCreated: () => void }) {
  const [description, setDescription] = useState('')
  const [tenantId, setTenantId] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<TriageResponse | null>(null)

  const run = async (e: FormEvent) => {
    e.preventDefault()
    if (description.trim().length < 10) return
    setRunning(true)
    setError('')
    try {
      const data = await api.post<TriageResponse>('/api/support/ai/triage', {
        description: description.trim(),
        tenantId: tenantId.trim() || null,
      })
      setResult(data)
      if (data.ticketId) onTicketCreated()
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e?.message || 'No se pudo ejecutar el triage')
    } finally {
      setRunning(false)
    }
  }

  const t = result?.triage

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-primary-600" />
        <h3 className="text-base font-semibold text-slate-900">Triage IA</h3>
      </div>
      <form onSubmit={run} className="space-y-3">
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          placeholder="Describe el problema reportado… (ej: 'Mi agente no responde WhatsApp')"
          className={inputClass}
        />
        <div className="flex flex-wrap gap-2">
          <input
            value={tenantId}
            onChange={e => setTenantId(e.target.value)}
            placeholder="tenantId (opcional, agrega contexto)"
            className={`${inputClass} flex-1 min-w-[220px]`}
          />
          <Button type="submit" loading={running} icon={<Sparkles className="h-4 w-4" />}>
            Ejecutar triage
          </Button>
        </div>
      </form>

      {error && <Alert variant="danger" className="mt-3">{error}</Alert>}

      {result && t && (
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={tierMeta[t.tier].variant}>{tierMeta[t.tier].label}</Badge>
            <Badge variant={severityMeta[t.severity].variant}>Severidad: {severityMeta[t.severity].label}</Badge>
            <Badge variant="default">{t.category}</Badge>
            {t.incident && (
              <Badge variant="danger">
                <AlertTriangle className="h-3 w-3 mr-1" />
                INCIDENTE
              </Badge>
            )}
            <span className="text-xs text-slate-400">confianza {(t.confidence * 100).toFixed(0)}%</span>
          </div>

          <p className="text-sm font-medium text-slate-800">{t.detectedIssue}</p>
          {t.aiSummary && <p className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3">{t.aiSummary}</p>}

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Pasos recomendados</p>
            <ol className="list-decimal list-inside space-y-1 text-sm text-slate-700">
              {t.recommendedSteps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          </div>

          {t.playbookTitle && (
            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5" />
              Playbook: <span className="font-medium">{t.playbookTitle}</span>
              {t.playbookSlug && <span className="text-slate-400">(docs/support-playbooks/{t.playbookSlug}.md)</span>}
            </p>
          )}

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Acciones del agente</p>
            <ul className="space-y-1 text-xs text-slate-600">
              {result.actionsTaken.map((a, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <Bot className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-primary-500" />
                  {a}
                </li>
              ))}
            </ul>
          </div>

          {result.ticketId && (
            <Alert variant={t.incident ? 'danger' : 'info'}>
              {t.incident ? 'Incidente creado y escalado' : 'Ticket creado'}: {result.ticketId}
            </Alert>
          )}
        </div>
      )}
    </Card>
  )
}

// ─── Detalle / resolución de ticket ──────────────────────────────────────────

function TicketDetailModal({
  ticket,
  onClose,
  onSaved,
}: {
  ticket: SupportTicket | null
  onClose: () => void
  onSaved: () => void
}) {
  const [status, setStatus] = useState<TicketStatus>('OPEN')
  const [resolution, setResolution] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [suggestion, setSuggestion] = useState<string | null>(null)

  useEffect(() => {
    if (ticket) {
      setStatus(ticket.status)
      setResolution(ticket.resolution ?? '')
      setError('')
      setSuggestion(null)
    }
  }, [ticket])

  const save = async () => {
    if (!ticket) return
    setSaving(true)
    setError('')
    try {
      const data = await api.patch<{ ticket: SupportTicket; playbookSuggestion: string | null }>(
        `/api/support/tickets/${ticket.id}`,
        { status, resolution: resolution.trim() || null }
      )
      setSuggestion(data.playbookSuggestion)
      onSaved()
      if (!data.playbookSuggestion) onClose()
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e?.message || 'No se pudo actualizar el ticket')
    } finally {
      setSaving(false)
    }
  }

  if (!ticket) return null

  return (
    <Modal open={ticket !== null} onClose={onClose} title={ticket.title} size="lg">
      {error && <Alert variant="danger" className="mb-3">{error}</Alert>}

      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant={tierMeta[ticket.tier].variant}>{tierMeta[ticket.tier].label}</Badge>
          <Badge variant={severityMeta[ticket.severity].variant}>{severityMeta[ticket.severity].label}</Badge>
          <Badge variant={statusMeta[ticket.status].variant}>{statusMeta[ticket.status].label}</Badge>
          <Badge variant="default">Origen: {ticket.source}</Badge>
          {ticket.tenantId && <Badge variant="default">tenant: {ticket.tenantId.slice(0, 10)}…</Badge>}
        </div>

        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Descripción</p>
          <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-lg p-3">{ticket.description}</p>
        </div>

        {ticket.aiSummary && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Resumen IA</p>
            <p className="text-sm text-slate-600">{ticket.aiSummary}</p>
          </div>
        )}

        {ticket.recommendedAction && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Diagnóstico / pasos sugeridos</p>
            <p className="text-sm text-slate-600 whitespace-pre-wrap">{ticket.recommendedAction}</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Estado</label>
            <select value={status} onChange={e => setStatus(e.target.value as TicketStatus)} className={inputClass}>
              {Object.entries(statusMeta).map(([v, m]) => (
                <option key={v} value={v}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Resolución</label>
          <textarea
            value={resolution}
            onChange={e => setResolution(e.target.value)}
            rows={3}
            placeholder="Qué se hizo para resolver (alimenta la sugerencia de playbook)…"
            className={inputClass}
          />
        </div>

        {suggestion && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5" />
              Sugerencia de actualización de playbook (revísala y pégala manualmente)
            </p>
            <pre className="text-xs bg-slate-900 text-slate-100 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{suggestion}</pre>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cerrar</Button>
          <Button onClick={save} loading={saving} icon={<CheckCircle2 className="h-4 w-4" />}>
            Guardar
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Página ──────────────────────────────────────────────────────────────────

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterTier, setFilterTier] = useState('')
  const [filterSeverity, setFilterSeverity] = useState('')
  const [searchTickets, setSearchTickets] = useState('')
  const [selected, setSelected] = useState<SupportTicket | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newTenantId, setNewTenantId] = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const data = await api.get<SupportTicket[]>('/api/support/tickets', {
        status: filterStatus || undefined,
        tier: filterTier || undefined,
        severity: filterSeverity || undefined,
        search: searchTickets.trim() || undefined,
      })
      setTickets(Array.isArray(data) ? data : [])
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e?.message || 'No se pudieron cargar los tickets')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [filterStatus, filterTier, filterSeverity, searchTickets])

  useEffect(() => {
    // Debounce del search (300ms); los selects cargan de inmediato
    const t = window.setTimeout(() => load(), searchTickets ? 300 : 0)
    return () => window.clearTimeout(t)
  }, [load, searchTickets])
  useAutoRefresh(() => load(true), 30_000)

  const createTicket = async (e: FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setError('')
    try {
      await api.post('/api/support/tickets', {
        title: newTitle.trim(),
        description: newDescription.trim(),
        tenantId: newTenantId.trim() || null,
      })
      setCreateOpen(false)
      setNewTitle('')
      setNewDescription('')
      setNewTenantId('')
      await load()
    } catch (err: unknown) {
      const er = err as { message?: string }
      setError(er?.message || 'No se pudo crear el ticket')
    } finally {
      setCreating(false)
    }
  }

  const incidents = tickets.filter(t => t.tier === 'TIER_3' && t.status !== 'RESOLVED' && t.status !== 'CLOSED')

  return (
    <div className="p-4 lg:p-6 max-w-screen-xl mx-auto w-full space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <LifeBuoy className="h-5 w-5 text-primary-600" />
            Soporte
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Tickets, triage IA y contexto seguro de tenants</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" icon={<RefreshCw className="h-4 w-4" />} onClick={() => load()}>
            Actualizar
          </Button>
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
            Nuevo ticket
          </Button>
        </div>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {/* Incidentes activos SIEMPRE visibles arriba */}
      {incidents.length > 0 && (
        <Alert variant="danger">
          <span className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            {incidents.length} incidente(s) Tier 3 activo(s) — revisar de inmediato.
          </span>
        </Alert>
      )}

      <TriagePanel onTicketCreated={() => load(true)} />

      {/* Filtros (search + selects, todos server-side) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <input
          type="text"
          value={searchTickets}
          onChange={e => setSearchTickets(e.target.value)}
          placeholder="Buscar por título, descripción o categoría…"
          className={inputClass}
        />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={inputClass}>
          <option value="">Todos los estados</option>
          {Object.entries(statusMeta).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
        </select>
        <select value={filterTier} onChange={e => setFilterTier(e.target.value)} className={inputClass}>
          <option value="">Todos los tiers</option>
          {Object.entries(tierMeta).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
        </select>
        <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)} className={inputClass}>
          <option value="">Todas las severidades</option>
          {Object.entries(severityMeta).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
        </select>
      </div>

      {/* Lista */}
      <Card padding="none">
        {loading ? (
          <div className="py-16 flex justify-center"><LoadingSpinner size="lg" /></div>
        ) : tickets.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="h-10 w-10" />}
            title="Sin tickets"
            description="Crea un ticket manual o ejecuta el triage IA con un problema reportado."
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {tickets.map(t => (
              <button
                key={t.id}
                onClick={() => setSelected(t)}
                className="w-full text-left p-4 hover:bg-slate-50 transition-colors"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-900">{t.title}</span>
                  <Badge variant={tierMeta[t.tier].variant}>{tierMeta[t.tier].label}</Badge>
                  <Badge variant={severityMeta[t.severity].variant}>{severityMeta[t.severity].label}</Badge>
                  <Badge variant={statusMeta[t.status].variant}>{statusMeta[t.status].label}</Badge>
                  <span className="ml-auto text-xs text-slate-400">{formatDate(t.createdAt)}</span>
                </div>
                <p className="text-sm text-slate-500 mt-1 line-clamp-1">
                  {t.detectedIssue || t.description}
                </p>
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Crear ticket */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nuevo ticket">
        <form onSubmit={createTicket} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Asunto</label>
            <input value={newTitle} onChange={e => setNewTitle(e.target.value)} required minLength={4} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Descripción</label>
            <textarea value={newDescription} onChange={e => setNewDescription(e.target.value)} required minLength={10} rows={4} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              tenantId <span className="text-slate-400">(opcional)</span>
            </label>
            <input value={newTenantId} onChange={e => setNewTenantId(e.target.value)} className={inputClass} />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancelar
            </Button>
            <Button type="submit" loading={creating}>Crear</Button>
          </div>
        </form>
      </Modal>

      <TicketDetailModal ticket={selected} onClose={() => setSelected(null)} onSaved={() => load(true)} />
    </div>
  )
}
