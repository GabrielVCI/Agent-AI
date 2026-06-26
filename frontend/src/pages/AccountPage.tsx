import { useEffect, useState } from 'react'
import { CreditCard, Download, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { Subscription, Invoice } from '../types'
import api from '../lib/api'
import { Card, CardHeader, StatCard } from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Alert from '../components/ui/Alert'
import LoadingSpinner from '../components/ui/LoadingSpinner'

type CancelReason =
  | 'too_expensive'
  | 'missing_features'
  | 'switching_product'
  | 'not_using'
  | 'other'

type AccountPlanApiResponse = {
  success?: boolean
  data?: unknown
  subscription?: unknown
  plan?: unknown
  account?: unknown
}

type InvoicesApiResponse = {
  success?: boolean
  data?: unknown
  invoices?: unknown
  items?: unknown
}

const cancelReasons: { value: CancelReason; label: string }[] = [
  { value: 'too_expensive', label: 'Es muy costoso' },
  { value: 'missing_features', label: 'Le faltan funcionalidades' },
  { value: 'switching_product', label: 'Cambiaré a otro producto' },
  { value: 'not_using', label: 'No lo estoy usando' },
  { value: 'other', label: 'Otra razón' },
]

function toArray<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]

  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>

    if (Array.isArray(obj.data)) return obj.data as T[]
    if (Array.isArray(obj.invoices)) return obj.invoices as T[]
    if (Array.isArray(obj.items)) return obj.items as T[]

    if (obj.data && typeof obj.data === 'object') {
      const dataObj = obj.data as Record<string, unknown>

      if (Array.isArray(dataObj.invoices)) return dataObj.invoices as T[]
      if (Array.isArray(dataObj.items)) return dataObj.items as T[]
      if (Array.isArray(dataObj.data)) return dataObj.data as T[]
    }
  }

  return []
}

function toNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback

  const parsed = Number(value)

  return Number.isFinite(parsed) ? parsed : fallback
}

function toStringSafe(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback

  return String(value)
}

function toDateString(value: unknown): string {
  if (!value) return 'Sin fecha'

  const date = new Date(String(value))

  if (Number.isNaN(date.getTime())) {
    return 'Sin fecha'
  }

  return date.toLocaleDateString('es')
}

function formatMoney(value: unknown): string {
  return toNumber(value).toLocaleString()
}

function normalizeFeatures(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(item => toStringSafe(item)).filter(Boolean)
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)

      if (Array.isArray(parsed)) {
        return parsed.map(item => toStringSafe(item)).filter(Boolean)
      }
    } catch {
      return value
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
    }
  }

  return []
}

function extractSubscriptionPayload(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw

  const obj = raw as Record<string, unknown>

  if (obj.data && typeof obj.data === 'object') return obj.data
  if (obj.subscription && typeof obj.subscription === 'object') return obj.subscription
  if (obj.account && typeof obj.account === 'object') return obj.account

  return obj
}

function normalizeSubscription(raw: unknown): Subscription | null {
  const payload = extractSubscriptionPayload(raw)

  if (!payload || typeof payload !== 'object') {
    return null
  }

  const sub = payload as Record<string, any>
  const rawPlan = sub.plan && typeof sub.plan === 'object' ? sub.plan : {}

  const normalizedPlan = {
    ...rawPlan,

    id: toStringSafe(rawPlan.id || sub.planId || ''),
    name: toStringSafe(rawPlan.name || sub.planName || 'Sin plan'),
    description: toStringSafe(rawPlan.description),

    features: normalizeFeatures(
      rawPlan.features ??
        sub.features ??
        rawPlan.metadata?.features
    ),

    maxAgents: toNumber(rawPlan.maxAgents ?? sub.maxAgents),
    maxConversationsPerMonth: toNumber(
      rawPlan.maxConversationsPerMonth ??
        rawPlan.maxMonthlyConversations ??
        sub.maxConversationsPerMonth ??
        sub.maxMonthlyConversations
    ),
    maxQuotesPerMonth: toNumber(
      rawPlan.maxQuotesPerMonth ??
        rawPlan.maxMonthlyQuotes ??
        sub.maxQuotesPerMonth ??
        sub.maxMonthlyQuotes
    ),
    maxAudioMinutes: toNumber(
      rawPlan.maxAudioMinutes ??
        rawPlan.maxMonthlyAudioMinutes ??
        sub.maxAudioMinutes
    ),
    maxDocuments: toNumber(
      rawPlan.maxDocuments ??
        rawPlan.maxKnowledgeDocuments ??
        sub.maxDocuments
    ),
    maxStorageMb: toNumber(
      rawPlan.maxStorageMb ??
        rawPlan.maxStorageMB ??
        rawPlan.maxStorage ??
        sub.maxStorageMb
    ),

    price: toNumber(
      rawPlan.price ??
        rawPlan.priceMonthly ??
        rawPlan.monthlyPrice ??
        sub.price ??
        sub.priceMonthly
    ),

    currency: toStringSafe(rawPlan.currency || sub.currency || 'USD'),
  }

  return {
    ...sub,

    id: toStringSafe(sub.id),
    tenantId: toStringSafe(sub.tenantId),
    planId: toStringSafe(sub.planId || normalizedPlan.id),

    status: toStringSafe(sub.status || 'ACTIVE') as Subscription['status'],

    currentPeriodStart: toStringSafe(
      sub.currentPeriodStart ||
        sub.periodStart ||
        sub.createdAt ||
        new Date().toISOString()
    ),

    currentPeriodEnd: toStringSafe(
      sub.currentPeriodEnd ||
        sub.periodEnd ||
        new Date().toISOString()
    ),

    plan: normalizedPlan,

    usedConversations: toNumber(
      sub.usedConversations ??
        sub.usage?.conversations ??
        sub.metrics?.usedConversations
    ),

    usedQuotes: toNumber(
      sub.usedQuotes ??
        sub.usage?.quotes ??
        sub.metrics?.usedQuotes
    ),

    usedAudioMinutes: toNumber(
      sub.usedAudioMinutes ??
        sub.usage?.audioMinutes ??
        sub.metrics?.usedAudioMinutes
    ),

    usedDocuments: toNumber(
      sub.usedDocuments ??
        sub.usage?.documents ??
        sub.metrics?.usedDocuments
    ),

    usedStorageMb: toNumber(
      sub.usedStorageMb ??
        sub.usedStorageMB ??
        sub.usage?.storageMb ??
        sub.usage?.storageMB ??
        sub.metrics?.usedStorageMb
    ),

    createdAt: toStringSafe(sub.createdAt || new Date().toISOString()),
    updatedAt: toStringSafe(
      sub.updatedAt || sub.createdAt || new Date().toISOString()
    ),
  } as unknown as Subscription
}

function normalizeInvoice(raw: unknown): Invoice {
  const inv = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>

  return {
    ...inv,

    id: toStringSafe(inv.id),
    description: toStringSafe(inv.description || inv.concept || 'Factura'),
    issuedAt: toStringSafe(
      inv.issuedAt ||
        inv.createdAt ||
        inv.date ||
        new Date().toISOString()
    ),
    amount: toNumber(inv.amount ?? inv.total ?? inv.price),
    currency: toStringSafe(inv.currency || 'USD'),
    status: toStringSafe(inv.status || 'PENDING') as Invoice['status'],
    downloadUrl: toStringSafe(inv.downloadUrl || inv.pdfUrl || inv.url),
  } as unknown as Invoice
}

function usageBar(usedRaw: unknown, maxRaw: unknown) {
  const used = toNumber(usedRaw)
  const max = toNumber(maxRaw)
  const pct = max > 0 ? Math.min(100, (used / max) * 100) : 0
  const color = pct > 85 ? 'bg-red-500' : pct > 60 ? 'bg-amber-500' : 'bg-primary-600'

  return (
    <div>
      <div className="flex justify-between text-xs text-slate-500 mb-1">
        <span>{used.toLocaleString()} usados</span>
        <span>{max.toLocaleString()} máx.</span>
      </div>

      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export default function AccountPage() {
  const [sub, setSub] = useState<Subscription | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [cancelModal, setCancelModal] = useState(false)
  const [cancelReason, setCancelReason] = useState<CancelReason>('other')
  const [cancelNote, setCancelNote] = useState('')
  const [cancelSent, setCancelSent] = useState(false)
  const [cancelLoading, setCancelLoading] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadAccount() {
      setLoading(true)
      setPageError('')

      const [subscriptionResult, invoicesResult] = await Promise.allSettled([
        api.get<AccountPlanApiResponse | Subscription>('/api/account/plan'),
        api.get<InvoicesApiResponse | Invoice[]>('/api/account/invoices'),
      ])

      if (cancelled) return

      if (subscriptionResult.status === 'fulfilled') {
        const normalizedSub = normalizeSubscription(subscriptionResult.value)
        setSub(normalizedSub)
      } else {
        console.error('Error cargando plan de cuenta:', subscriptionResult.reason)
        setSub(null)
        setPageError('No se pudo cargar la información del plan.')
      }

      if (invoicesResult.status === 'fulfilled') {
        const normalizedInvoices = toArray(invoicesResult.value).map(normalizeInvoice)
        setInvoices(normalizedInvoices)
      } else {
        console.error('Error cargando facturas:', invoicesResult.reason)
        setInvoices([])
      }

      setLoading(false)
    }

    loadAccount()

    return () => {
      cancelled = true
    }
  }, [])

  const submitCancellation = async () => {
    setCancelLoading(true)
    setPageError('')

    try {
      await api.post('/api/account/cancellation-request', {
        reason: cancelReason,
        notes: cancelNote,
      })

      setCancelSent(true)
    } catch (err: unknown) {
      const e = err as { message?: string }
      setPageError(e?.message || 'No se pudo enviar la solicitud de cancelación.')
    } finally {
      setCancelLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary-100 flex items-center justify-center">
          <CreditCard className="h-5 w-5 text-primary-600" />
        </div>

        <div>
          <h2 className="text-xl font-semibold text-slate-900">Cuenta</h2>
          <p className="text-sm text-slate-500">Plan, uso y facturación</p>
        </div>
      </div>

      {pageError && (
        <Alert variant="danger">
          {pageError}
        </Alert>
      )}

      {sub ? (
        <>
          <Card>
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Plan actual
                </p>

                <h3 className="text-2xl font-bold text-slate-900 mt-1">
                  {sub.plan?.name || 'Sin plan'}
                </h3>
              </div>

              <Badge
                variant={
                  sub.status === 'ACTIVE'
                    ? 'success'
                    : sub.status === 'TRIALING'
                      ? 'info'
                      : sub.status === 'SUSPENDED'
                        ? 'warning'
                        : 'danger'
                }
              >
                {sub.status === 'ACTIVE'
                  ? 'Activo'
                  : sub.status === 'TRIALING'
                    ? 'Prueba'
                    : sub.status === 'SUSPENDED'
                      ? 'Suspendido'
                      : 'Cancelado'}
              </Badge>
            </div>

            <div className="text-sm text-slate-500 mb-4">
              Período: {toDateString(sub.currentPeriodStart)} —{' '}
              {toDateString(sub.currentPeriodEnd)}
            </div>

            {Array.isArray(sub.plan?.features) && sub.plan.features.length > 0 ? (
              <ul className="space-y-1">
                {sub.plan.features.map(feature => (
                  <li
                    key={feature}
                    className="flex items-center gap-2 text-sm text-slate-600"
                  >
                    <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-400">
                Este plan no tiene funcionalidades listadas todavía.
              </p>
            )}
          </Card>

          <div className="grid grid-cols-2 gap-4">
            <StatCard
              label="Agentes"
              value={`${toNumber(sub.plan?.maxAgents)} máx.`}
              variant="primary"
            />

            <StatCard
              label="Precio mensual"
              value={`$${formatMoney(sub.plan?.price)}`}
              variant="default"
            />
          </div>

          <Card>
            <CardHeader title="Uso del mes" />

            <div className="space-y-5">
              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">
                  Conversaciones
                </p>
                {usageBar(sub.usedConversations, sub.plan?.maxConversationsPerMonth)}
              </div>

              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">
                  Cotizaciones
                </p>
                {usageBar(sub.usedQuotes, sub.plan?.maxQuotesPerMonth)}
              </div>

              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">
                  Minutos de audio
                </p>
                {usageBar(sub.usedAudioMinutes, sub.plan?.maxAudioMinutes)}
              </div>

              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">
                  Documentos RAG
                </p>
                {usageBar(sub.usedDocuments, sub.plan?.maxDocuments)}
              </div>

              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">
                  Almacenamiento (MB)
                </p>
                {usageBar(sub.usedStorageMb, sub.plan?.maxStorageMb)}
              </div>
            </div>
          </Card>
        </>
      ) : (
        <Card>
          <div className="py-8 text-center">
            <p className="text-sm text-slate-500">
              No hay información de suscripción disponible.
            </p>
          </div>
        </Card>
      )}

      <Card padding="none">
        <div className="p-6 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">Historial de facturación</h3>
        </div>

        {invoices.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">
            Sin facturas
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {invoices.map(inv => (
              <div key={inv.id} className="flex items-center gap-4 px-6 py-4">
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">
                    {inv.description || 'Factura'}
                  </p>

                  <p className="text-xs text-slate-500">
                    {toDateString(inv.issuedAt)}
                  </p>
                </div>

                <div className="text-sm font-semibold text-slate-900">
                  ${formatMoney(inv.amount)} {inv.currency || 'USD'}
                </div>

                <Badge
                  variant={
                    inv.status === 'PAID'
                      ? 'success'
                      : inv.status === 'PENDING'
                        ? 'warning'
                        : 'danger'
                  }
                >
                  {inv.status === 'PAID' ? (
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Pagada
                    </span>
                  ) : inv.status === 'PENDING' ? (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Pendiente
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <XCircle className="h-3 w-3" />
                      Fallida
                    </span>
                  )}
                </Badge>

                {inv.downloadUrl && (
                  <a href={inv.downloadUrl} target="_blank" rel="noreferrer">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Download className="h-3.5 w-3.5" />}
                    />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {sub?.status === 'ACTIVE' && (
        <Card>
          <CardHeader
            title="Cancelar suscripción"
            description="Tu cuenta permanecerá activa hasta el fin del período actual."
          />

          <Button variant="danger" onClick={() => setCancelModal(true)}>
            Solicitar cancelación
          </Button>
        </Card>
      )}

      <Modal
        open={cancelModal}
        onClose={() => {
          if (!cancelSent) setCancelModal(false)
        }}
        title="Solicitar cancelación"
        size="md"
      >
        {cancelSent ? (
          <div className="text-center py-4">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />

            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              Solicitud enviada
            </h3>

            <p className="text-sm text-slate-500 mb-6">
              Tu solicitud de cancelación fue enviada. Nuestro equipo la revisará
              y se pondrá en contacto contigo.
            </p>

            <Button
              onClick={() => {
                setCancelModal(false)
                setCancelSent(false)
              }}
            >
              Entendido
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Alert variant="warning">
              Tu cuenta permanecerá activa hasta el final del período de
              facturación actual.
            </Alert>

            <div>
              <label className="label">Razón de cancelación</label>

              <select
                className="input"
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value as CancelReason)}
              >
                {cancelReasons.map(reason => (
                  <option key={reason.value} value={reason.value}>
                    {reason.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Comentarios adicionales (opcional)</label>

              <textarea
                className="input resize-none"
                rows={3}
                value={cancelNote}
                onChange={e => setCancelNote(e.target.value)}
                placeholder="¿Hay algo que podríamos mejorar?"
              />
            </div>

            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={() => setCancelModal(false)}
                className="flex-1"
              >
                Volver
              </Button>

              <Button
                variant="danger"
                loading={cancelLoading}
                onClick={submitCancellation}
                className="flex-1"
              >
                Enviar solicitud
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}