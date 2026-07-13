import { useEffect, useState } from 'react'
import { Check, Sparkles } from 'lucide-react'
import Button from '../ui/Button'
import Alert from '../ui/Alert'
import LoadingSpinner from '../ui/LoadingSpinner'
import api from '../../lib/api'
import { openPlanCheckout } from '../../lib/lemonCheckout'

interface BillingPlan {
  id: string
  code: 'BASIC' | 'PRO' | 'ENTERPRISE' | null
  name: string
  description: string | null
  priceMonthly: number
  currency: string
  setupFeeLabel: string | null
  estimatedMessagesMin: number | null
  monthlyMessageLimit: number
  features: string[]
  isPopular: boolean
}

/** Cards de los planes reales de Sendwary con CTA de mejora (overlay LS). */
export default function PlanCards({ currentPlanCode }: { currentPlanCode?: string | null }) {
  const [plans, setPlans] = useState<BillingPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyCode, setBusyCode] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<BillingPlan[]>('/api/billing/plans')
      .then(data => setPlans(Array.isArray(data) ? data : []))
      .catch((err: unknown) =>
        setError((err as { message?: string })?.message || 'No se pudieron cargar los planes')
      )
      .finally(() => setLoading(false))
  }, [])

  const handleSelect = async (plan: BillingPlan) => {
    if (!plan.code) return
    setBusyCode(plan.code)
    setNotice('')
    const result = await openPlanCheckout(plan.code)
    if (!result.ok && result.message) setNotice(result.message)
    setBusyCode(null)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner />
      </div>
    )
  }
  if (error) return <Alert variant="warning">{error}</Alert>
  if (plans.length === 0) return null

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-slate-900">Planes Sendwary</h3>
        <p className="text-sm text-slate-500">
          Los volúmenes de mensajes son estimados; el sistema aplica el límite mensual de cada plan.
        </p>
      </div>

      {notice && <Alert variant="info">{notice}</Alert>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
        {plans.map(plan => {
          const isCurrent = Boolean(plan.code && plan.code === currentPlanCode)
          return (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-2xl border bg-white p-5 ${
                plan.isPopular
                  ? 'border-primary-500 ring-1 ring-primary-500 shadow-md'
                  : 'border-slate-200 shadow-sm'
              }`}
            >
              {plan.isPopular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-primary-600 px-3 py-0.5 text-xs font-semibold text-white whitespace-nowrap">
                  <Sparkles className="h-3 w-3" />
                  Más popular
                </span>
              )}

              <h4 className="text-lg font-bold text-slate-900">{plan.name}</h4>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-slate-900">
                  {plan.currency === 'USD' ? 'USD ' : ''}
                  {plan.priceMonthly}
                </span>
                <span className="text-sm text-slate-500">/mes</span>
              </div>
              {plan.setupFeeLabel && (
                <p className="text-xs text-slate-500 mt-0.5">{plan.setupFeeLabel}</p>
              )}
              {plan.estimatedMessagesMin != null && (
                <p className="text-xs text-slate-400 mt-1">
                  ~{plan.estimatedMessagesMin.toLocaleString()}–
                  {plan.monthlyMessageLimit.toLocaleString()} mensajes/mes
                </p>
              )}
              {plan.description && (
                <p className="text-sm text-slate-600 mt-3">{plan.description}</p>
              )}

              <ul className="mt-4 space-y-1.5 flex-1">
                {(plan.features ?? []).map(feature => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-slate-600">
                    <Check className="h-4 w-4 text-primary-600 flex-shrink-0 mt-0.5" />
                    {feature}
                  </li>
                ))}
              </ul>

              <Button
                className="mt-5 w-full"
                variant={isCurrent ? 'secondary' : plan.isPopular ? 'primary' : 'outline'}
                disabled={isCurrent}
                loading={busyCode === plan.code}
                onClick={() => handleSelect(plan)}
              >
                {isCurrent ? 'Tu plan actual' : `Elegir ${plan.name}`}
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
