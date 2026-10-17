import { useCallback, useEffect, useState } from 'react'
import { Gauge, ArrowUpCircle, Bot, Users } from 'lucide-react'
import { Card, CardHeader } from '../ui/Card'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import Alert from '../ui/Alert'
import LoadingSpinner from '../ui/LoadingSpinner'
import api from '../../lib/api'
import { openPlanCheckout } from '../../lib/lemonCheckout'

// ─── Contrato /api/billing/usage (defensivo: todo puede faltar) ──────────────

interface BillingOverview {
  plan: {
    code: string | null
    name: string
    priceMonthly: number
    currency: string
    setupFeeLabel: string | null
    monthlyMessageLimit: number
    monthlyTokenLimit: number | null
    maxAgents: number | null
    maxUsers: number | null
    hasCustomLimit?: boolean
  } | null
  subscription: {
    status: string
    billingMode?: string | null
    paymentStatus?: string | null
    renewsAt: string | null
    endsAt: string | null
  } | null
  usage: {
    inboundMessages: number
    outboundMessages: number
    totalMessages: number
    aiTotalTokens: number
    messageLimit: number
    tokenLimit: number | null
    percentUsed: number
    nearLimit: boolean
    exceeded: boolean
    periodEnd: string
  }
  seats: {
    agentsUsed: number
    maxAgents: number | null
    usersUsed: number
    maxUsers: number | null
  }
}

const statusMeta: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'default' }> = {
  ACTIVE: { label: 'Activa', variant: 'success' },
  TRIALING: { label: 'Prueba', variant: 'info' },
  PAST_DUE: { label: 'Pago pendiente', variant: 'warning' },
  CANCEL_REQUESTED: { label: 'Cancelación solicitada', variant: 'warning' },
  CANCELLED: { label: 'Cancelada', variant: 'danger' },
  EXPIRED: { label: 'Expirada', variant: 'danger' },
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' })
}

/** Tarjeta de plan + consumo del mes con alertas al 80% y 100%. */
export default function UsageCard({
  onPlanCode,
}: {
  /** Notifica el código del plan actual (para resaltar la card correspondiente) */
  onPlanCode?: (code: string | null) => void
}) {
  const [data, setData] = useState<BillingOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [upgradeMsg, setUpgradeMsg] = useState('')
  const [upgrading, setUpgrading] = useState(false)

  const load = useCallback(async () => {
    try {
      const overview = await api.get<BillingOverview>('/api/billing/usage')
      setData(overview ?? null)
      onPlanCode?.(overview?.plan?.code ?? null)
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'No se pudo cargar el uso del plan')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleUpgrade = async () => {
    if (!data) return
    // Escalera simple: BASIC → PRO → ENTERPRISE (overlay LS con fallback)
    const nextCode = data.plan?.code === 'BASIC' ? 'PRO' : 'ENTERPRISE'
    setUpgrading(true)
    setUpgradeMsg('')
    const result = await openPlanCheckout({ planCode: nextCode })
    if (!result.ok && result.message) setUpgradeMsg(result.message)
    setUpgrading(false)
  }

  if (loading) {
    return (
      <Card>
        <div className="flex justify-center py-8">
          <LoadingSpinner />
        </div>
      </Card>
    )
  }

  if (error || !data) {
    return (
      <Card>
        <Alert variant="warning">{error || 'Sin información de uso disponible'}</Alert>
      </Card>
    )
  }

  const { plan, subscription, usage, seats } = data
  const status = subscription ? statusMeta[subscription.status] ?? { label: subscription.status, variant: 'default' as const } : null
  const pct = Math.min(100, usage.percentUsed)
  const barColor = usage.exceeded ? 'bg-red-500' : usage.nearLimit ? 'bg-amber-500' : 'bg-primary-600'

  return (
    <Card>
      <CardHeader
        title="Suscripción y uso"
        description="Consumo de mensajes del mes en curso"
        action={
          <Button
            size="sm"
            variant={usage.nearLimit || usage.exceeded ? 'primary' : 'outline'}
            icon={<ArrowUpCircle className="h-4 w-4" />}
            loading={upgrading}
            onClick={handleUpgrade}
          >
            Mejorar plan
          </Button>
        }
      />

      {upgradeMsg && (
        <Alert variant="info" className="mb-4">
          {upgradeMsg}
        </Alert>
      )}

      {subscription?.paymentStatus === 'OVERDUE' && (
        <Alert variant="warning" className="mb-4" title="Pago pendiente">
          Tu suscripción tiene un pago atrasado. Contacta a soporte para regularizarla y evitar
          interrupciones del servicio.
        </Alert>
      )}

      {usage.exceeded && (
        <Alert variant="danger" className="mb-4" title="Límite mensual alcanzado">
          Las respuestas automáticas de IA están pausadas hasta el próximo periodo o hasta mejorar
          el plan. Los mensajes entrantes se siguen guardando y tu equipo puede responder manualmente.
        </Alert>
      )}
      {!usage.exceeded && usage.nearLimit && (
        <Alert variant="warning" className="mb-4" title={`Has usado el ${usage.percentUsed}% de tu plan`}>
          Al llegar al 100% las respuestas automáticas se pausarán. Considera mejorar tu plan.
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-sm font-semibold text-slate-900">{plan?.name ?? 'Sin plan'}</span>
        {status && <Badge variant={status.variant}>{status.label}</Badge>}
        {plan && (
          <span className="text-xs text-slate-500">
            {plan.currency === 'USD' ? 'USD ' : ''}
            {plan.priceMonthly}/mes
            {plan.setupFeeLabel ? ` · ${plan.setupFeeLabel}` : ''}
          </span>
        )}
        {plan?.hasCustomLimit && <Badge variant="purple">Límite personalizado</Badge>}
        <span className="text-xs text-slate-400 ml-auto">
          Renueva: {formatDate(subscription?.renewsAt ?? usage.periodEnd)}
        </span>
      </div>

      {/* Barra de mensajes */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-slate-500 mb-1">
          <span className="inline-flex items-center gap-1">
            <Gauge className="h-3.5 w-3.5" />
            Mensajes procesados
          </span>
          <span>
            {usage.totalMessages.toLocaleString()} /{' '}
            {usage.messageLimit > 0 ? usage.messageLimit.toLocaleString() : '∞'} ({usage.percentUsed}%)
          </span>
        </div>
        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-slate-400 mt-1">
          {usage.inboundMessages.toLocaleString()} recibidos ·{' '}
          {usage.outboundMessages.toLocaleString()} enviados
        </p>
      </div>

      {/* Tokens (límite técnico opcional) */}
      {usage.tokenLimit && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>Tokens de IA</span>
            <span>
              {usage.aiTotalTokens.toLocaleString()} / {usage.tokenLimit.toLocaleString()}
            </span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-slate-400"
              style={{ width: `${Math.min(100, (usage.aiTotalTokens / usage.tokenLimit) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Asientos */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="bg-slate-50 rounded-lg p-2.5 flex items-center gap-2">
          <Bot className="h-4 w-4 text-slate-400" />
          <div>
            <p className="text-slate-500">Agentes IA</p>
            <p className="font-semibold text-slate-800">
              {seats.agentsUsed} / {seats.maxAgents ?? '∞'}
            </p>
          </div>
        </div>
        <div className="bg-slate-50 rounded-lg p-2.5 flex items-center gap-2">
          <Users className="h-4 w-4 text-slate-400" />
          <div>
            <p className="text-slate-500">Usuarios</p>
            <p className="font-semibold text-slate-800">
              {seats.usersUsed} / {seats.maxUsers ?? '∞'}
            </p>
          </div>
        </div>
      </div>
    </Card>
  )
}
