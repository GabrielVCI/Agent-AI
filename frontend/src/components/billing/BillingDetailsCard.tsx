import { useEffect, useState } from 'react'
import { CreditCard } from 'lucide-react'
import api from '../../lib/api'
import { Card, CardHeader } from '../ui/Card'
import Badge from '../ui/Badge'

/**
 * Detalles de facturación (Parte I del paywall): plan, estado, modo de cobro
 * y los identificadores de LemonSqueezy de la suscripción del tenant (útiles
 * para soporte). Solo lectura; nunca datos de tarjeta.
 */

interface BillingDetails {
  plan: { name: string; code: string | null } | null
  subscription: {
    status: string
    billingMode: string
    paymentStatus: string
    renewsAt: string | null
    lemonSqueezySubscriptionId: string | null
    lemonSqueezyCustomerId: string | null
  } | null
}

const statusMeta: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'default' | 'info' }> = {
  ACTIVE: { label: 'Activa', variant: 'success' },
  TRIALING: { label: 'Período de prueba', variant: 'info' },
  PAST_DUE: { label: 'Pago pendiente', variant: 'warning' },
  CANCEL_REQUESTED: { label: 'Cancelación solicitada', variant: 'warning' },
  CANCELLED: { label: 'Cancelada', variant: 'danger' },
  EXPIRED: { label: 'Expirada', variant: 'danger' },
}

const modeLabel: Record<string, string> = {
  MANUAL: 'Manual (gestionado por Sendwary)',
  LEMONSQUEEZY: 'LemonSqueezy (automático)',
  FREE: 'Cortesía',
  CUSTOM: 'Plan personalizado',
}

export default function BillingDetailsCard() {
  const [details, setDetails] = useState<BillingDetails | null>(null)

  useEffect(() => {
    api
      .get<BillingDetails>('/api/billing/subscription')
      .then(setDetails)
      .catch(() => setDetails(null))
  }, [])

  const sub = details?.subscription
  if (!sub) return null

  const meta = statusMeta[sub.status] ?? { label: sub.status, variant: 'default' as const }

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-800 font-medium text-right break-all">{value}</span>
    </div>
  )

  return (
    <Card>
      <CardHeader
        title="Detalles de facturación"
        description="Identificadores de tu suscripción (útiles al contactar soporte)"
      />
      <div className="divide-y divide-slate-100">
        {row('Plan actual', details?.plan?.name ?? '—')}
        {row('Estado', <Badge variant={meta.variant}>{meta.label}</Badge>)}
        {row('Modo de cobro', modeLabel[sub.billingMode] ?? sub.billingMode)}
        {sub.renewsAt && row('Próxima renovación', new Date(sub.renewsAt).toLocaleDateString())}
        {sub.lemonSqueezySubscriptionId &&
          row(
            'LemonSqueezy Subscription ID',
            <code className="text-xs bg-slate-50 px-1.5 py-0.5 rounded">{sub.lemonSqueezySubscriptionId}</code>
          )}
        {sub.lemonSqueezyCustomerId &&
          row(
            'LemonSqueezy Customer ID',
            <code className="text-xs bg-slate-50 px-1.5 py-0.5 rounded">{sub.lemonSqueezyCustomerId}</code>
          )}
        {!sub.lemonSqueezySubscriptionId && (
          <p className="pt-2 text-xs text-slate-400 flex items-center gap-1.5">
            <CreditCard className="h-3.5 w-3.5" />
            Esta suscripción no está vinculada a LemonSqueezy (cobro {modeLabel[sub.billingMode]?.toLowerCase() ?? 'manual'}).
          </p>
        )}
      </div>
    </Card>
  )
}
