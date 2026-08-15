import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Sparkles, LogOut, ShieldCheck, Loader2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import api from '../lib/api'
import { getUserFriendlyErrorMessage } from '../lib/errors'
import { openPlanCheckout, ensureLemonJs } from '../lib/lemonCheckout'
import { SendwaryWordmark } from '../components/BrandLogo'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'
import LoadingSpinner from '../components/ui/LoadingSpinner'

/**
 * Paywall obligatorio (Parte C): un tenant sin plan activo aterriza aquí y no
 * puede entrar al panel hasta activar un plan. El checkout es un overlay
 * embebido de LemonSqueezy (lemon.js); tras pagar, el webhook activa la
 * suscripción y el polling de esta página detecta la activación y redirige.
 * Sin botón "saltar" a propósito. SUPER_ADMIN nunca llega aquí (guard).
 */

type PlanCode = 'BASIC' | 'PRO' | 'ENTERPRISE'

interface BillingPlan {
  id: string
  code: PlanCode | null
  name: string
  description: string | null
  priceMonthly: number
  currency: string
  setupFeeLabel: string | null
  monthlyMessageLimit: number
  features: string[]
  isPopular: boolean
}

interface BillingStatus {
  hasActivePlan: boolean
  reason: string
}

export default function ActivatePlanPage() {
  const { user, logout, refreshUser } = useAuth()
  const navigate = useNavigate()
  const [plans, setPlans] = useState<BillingPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [scriptFailed, setScriptFailed] = useState(false)
  const [busyCode, setBusyCode] = useState<string | null>(null)
  const [checkoutOpened, setCheckoutOpened] = useState(false)
  const [slowActivation, setSlowActivation] = useState(false)
  const openedAtRef = useRef<number | null>(null)

  useEffect(() => {
    api
      .get<BillingPlan[]>('/api/billing/plans')
      .then(data => setPlans(Array.isArray(data) ? data : []))
      .catch(err => setError(getUserFriendlyErrorMessage(err)))
      .finally(() => setLoading(false))

    // Precarga de lemon.js (una sola vez) para que el overlay abra al instante
    ensureLemonJs().then(ok => setScriptFailed(!ok))
  }, [])

  // Si el plan ya está activo (pago completado o admin lo asignó mientras
  // tanto), salir del paywall. Polling cada 4s SOLO tras abrir un checkout;
  // verificación única al montar para no martillar el backend.
  const checkStatus = useCallback(async (): Promise<boolean> => {
    try {
      const status = await api.get<BillingStatus>('/api/billing/status')
      if (status?.hasActivePlan) {
        await refreshUser()
        navigate('/', { replace: true })
        return true
      }
    } catch {
      // transitorio: el próximo intento decide
    }
    return false
  }, [navigate, refreshUser])

  useEffect(() => {
    void checkStatus()
  }, [checkStatus])

  useEffect(() => {
    if (!checkoutOpened) return
    const id = window.setInterval(async () => {
      const done = await checkStatus()
      if (!done && openedAtRef.current && Date.now() - openedAtRef.current > 90_000) {
        setSlowActivation(true)
      }
    }, 4000)
    return () => window.clearInterval(id)
  }, [checkoutOpened, checkStatus])

  const activate = async (plan: BillingPlan) => {
    if (!plan.code) return
    setBusyCode(plan.code)
    setError('')
    const result = await openPlanCheckout(plan.code)
    setBusyCode(null)
    if (!result.ok) {
      setError(result.message || 'No pudimos cargar el checkout. Intenta nuevamente.')
      return
    }
    openedAtRef.current = Date.now()
    setCheckoutOpened(true)
  }

  const fmtPrice = (p: BillingPlan) => `US$${Math.round(p.priceMonthly)}/mes`

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header con marca y salida (única acción permitida sin pagar) */}
      <header className="flex items-center justify-between px-6 py-4">
        <SendwaryWordmark markClassName="h-9 w-9" textClassName="text-xl" />
        <button
          onClick={logout}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 pb-12">
        <div className="text-center max-w-2xl mt-6 mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
            Elige un plan para activar Sendwary
          </h1>
          <p className="text-slate-500 mt-2">
            Selecciona el plan que mejor se adapte a tu negocio. El pago se procesa de forma
            segura con LemonSqueezy.
          </p>
          {user?.email && (
            <p className="text-xs text-slate-400 mt-2">
              Cuenta: {user.email} — la suscripción quedará asociada a tu empresa.
            </p>
          )}
        </div>

        {error && (
          <Alert variant="danger" className="mb-4 max-w-2xl w-full">
            {error}
          </Alert>
        )}
        {scriptFailed && (
          <Alert variant="warning" className="mb-4 max-w-2xl w-full">
            No pudimos cargar el checkout embebido. Al activar un plan se abrirá la página de
            pago segura de LemonSqueezy. Si tampoco abre, intenta nuevamente.
          </Alert>
        )}
        {checkoutOpened && (
          <Alert variant="info" className="mb-4 max-w-2xl w-full">
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Estamos verificando tu pago… al confirmarse entrarás automáticamente al panel.
            </span>
          </Alert>
        )}
        {slowActivation && (
          <Alert variant="warning" className="mb-4 max-w-2xl w-full">
            El pago fue recibido y estamos activando tu cuenta. Si tarda más de unos minutos,
            contacta soporte.
          </Alert>
        )}

        {loading ? (
          <div className="py-20">
            <LoadingSpinner size="lg" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-5xl w-full">
            {plans
              .filter(p => p.code)
              .map(plan => (
                <div
                  key={plan.id}
                  className={`relative bg-white rounded-2xl border p-6 flex flex-col ${
                    plan.isPopular
                      ? 'border-primary-400 shadow-lg shadow-primary-100'
                      : 'border-slate-200 shadow-sm'
                  }`}
                >
                  {plan.isPopular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 bg-primary-600 text-white text-xs font-medium px-3 py-1 rounded-full">
                      <Sparkles className="h-3 w-3" />
                      Más popular
                    </span>
                  )}
                  <h2 className="font-semibold text-slate-900 text-lg">{plan.name}</h2>
                  <p className="text-3xl font-bold text-slate-900 mt-2">{fmtPrice(plan)}</p>
                  {plan.setupFeeLabel && (
                    <p className="text-xs text-slate-400 mt-1">Implementación: {plan.setupFeeLabel}</p>
                  )}
                  <p className="text-sm text-slate-500 mt-1">
                    Hasta {plan.monthlyMessageLimit.toLocaleString()} mensajes/mes
                  </p>
                  <ul className="mt-4 space-y-2 flex-1">
                    {(plan.features ?? []).slice(0, 6).map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                        <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="mt-5 w-full lemonsqueezy-button"
                    variant={plan.isPopular ? 'primary' : 'outline'}
                    loading={busyCode === plan.code}
                    onClick={() => activate(plan)}
                  >
                    Activar {plan.name}
                  </Button>
                </div>
              ))}
          </div>
        )}

        <p className="flex items-center gap-1.5 text-xs text-slate-400 mt-8">
          <ShieldCheck className="h-3.5 w-3.5" />
          No almacenamos datos de tarjetas: el pago lo procesa LemonSqueezy.
        </p>
      </main>
    </div>
  )
}
