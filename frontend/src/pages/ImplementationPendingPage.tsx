import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  CheckCircle2,
  Clock,
  CreditCard,
  Headset,
  LogOut,
  Rocket,
  Settings2,
  UserCheck,
  CalendarCheck,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { ActivationStatus } from '../types'
import api from '../lib/api'
import { SendwaryWordmark } from '../components/BrandLogo'
import Button from '../components/ui/Button'
import LoadingSpinner from '../components/ui/LoadingSpinner'

const SUPPORT_EMAIL = 'soporte@sendwary.com'

type StepState = 'done' | 'current' | 'pending'

function TimelineStep({
  icon,
  title,
  description,
  state,
  isLast,
}: {
  icon: React.ReactNode
  title: string
  description: string
  state: StepState
  isLast?: boolean
}) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 ${
            state === 'done'
              ? 'bg-primary-600 border-primary-600 text-white'
              : state === 'current'
                ? 'bg-primary-50 border-primary-500 text-primary-600'
                : 'bg-white border-slate-200 text-slate-300'
          }`}
        >
          {state === 'done' ? <CheckCircle2 className="h-5 w-5" /> : icon}
        </div>
        {!isLast && (
          <div
            className={`w-0.5 flex-1 min-h-[24px] ${
              state === 'done' ? 'bg-primary-500' : 'bg-slate-200'
            }`}
          />
        )}
      </div>
      <div className={`pb-6 ${isLast ? 'pb-0' : ''}`}>
        <p
          className={`text-sm font-semibold ${
            state === 'pending' ? 'text-slate-400' : 'text-slate-900'
          }`}
        >
          {title}
        </p>
        <p className={`text-xs mt-0.5 ${state === 'pending' ? 'text-slate-400' : 'text-slate-500'}`}>
          {description}
        </p>
      </div>
    </div>
  )
}

/**
 * Pantalla premium de implementación: el cliente verificó su cuenta y el
 * equipo de Sendwary está preparando su plataforma. No hay acceso al
 * dashboard hasta que SUPER_ADMIN complete la activación final.
 */
export default function ImplementationPendingPage() {
  const { user, logout } = useAuth()
  const [status, setStatus] = useState<ActivationStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .get<ActivationStatus>('/api/billing/activation-status')
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-slate-50">
        <SendwaryWordmark markClassName="h-11 w-11" textClassName="text-2xl" />
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  // Fuera de implementación (activado, o el gate lo mandará al lugar correcto)
  if (status && !status.shouldShowImplementationScreen) {
    return <Navigate to="/" replace />
  }

  const feePaid = Boolean(status?.implementationFeePaid)
  const inProgress = status?.implementationStatus === 'IN_PROGRESS'

  const steps: { icon: React.ReactNode; title: string; description: string; state: StepState }[] = [
    {
      icon: <UserCheck className="h-5 w-5" />,
      title: 'Cuenta creada',
      description: 'Tu registro en Sendwary quedó completado.',
      state: 'done',
    },
    {
      icon: <CheckCircle2 className="h-5 w-5" />,
      title: 'Cuenta verificada',
      description: 'Confirmaste tu correo correctamente.',
      state: 'done',
    },
    {
      icon: <CreditCard className="h-5 w-5" />,
      title: 'Pago de implementación',
      description: feePaid
        ? 'Pago de implementación registrado.'
        : 'Nuestro equipo te indicará los pasos para completar este pago.',
      state: feePaid ? 'done' : 'current',
    },
    {
      icon: <Settings2 className="h-5 w-5" />,
      title: 'Configuración técnica',
      description:
        'WhatsApp, agentes IA, catálogo o servicios, citas y reglas de atención.',
      state: inProgress ? 'current' : feePaid ? 'current' : 'pending',
    },
    {
      icon: <Rocket className="h-5 w-5" />,
      title: 'Activación final',
      description: 'Activamos tu cuenta cuando todo esté listo y probado.',
      state: 'pending',
    },
    {
      icon: <CalendarCheck className="h-5 w-5" />,
      title: 'Inicio del primer mes',
      description: 'Tu primer mes de servicio comienza con la activación final.',
      state: 'pending',
    },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50 via-slate-50 to-slate-50 px-4 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-8 flex justify-center">
          <SendwaryWordmark markClassName="h-11 w-11" textClassName="text-2xl" />
        </div>

        <div className="bg-white rounded-2xl shadow-xl shadow-primary-600/5 border border-slate-100 overflow-hidden">
          {/* Header premium */}
          <div className="bg-gradient-to-r from-primary-600 to-primary-700 px-8 py-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/15">
              <Clock className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-1">
              Tu implementación está en proceso
            </h1>
            <p className="text-primary-100 text-sm">
              Ya verificaste tu cuenta. El siguiente paso es preparar Sendwary para tu negocio.
            </p>
          </div>

          <div className="p-8">
            {/* Estado actual */}
            <div className="grid gap-3 sm:grid-cols-3 mb-8">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                <p className="text-xs font-semibold text-emerald-700">Cuenta verificada</p>
                <p className="text-xs text-emerald-600 mt-0.5">Listo ✓</p>
              </div>
              <div className="rounded-xl border border-primary-100 bg-primary-50 px-4 py-3">
                <p className="text-xs font-semibold text-primary-700">Implementación</p>
                <p className="text-xs text-primary-600 mt-0.5">
                  {inProgress ? 'En proceso' : 'Pendiente de inicio'}
                </p>
              </div>
              <div
                className={`rounded-xl border px-4 py-3 ${
                  feePaid
                    ? 'border-emerald-100 bg-emerald-50'
                    : 'border-amber-100 bg-amber-50'
                }`}
              >
                <p
                  className={`text-xs font-semibold ${feePaid ? 'text-emerald-700' : 'text-amber-700'}`}
                >
                  Pago de implementación
                </p>
                <p className={`text-xs mt-0.5 ${feePaid ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {feePaid ? 'Registrado ✓' : 'Pendiente'}
                </p>
              </div>
            </div>

            <p className="text-sm text-slate-600 leading-relaxed mb-2">
              Nuestro equipo técnico se comunicará contigo para revisar los detalles de tu negocio.
              Durante esta etapa configuraremos WhatsApp, agentes IA, catálogo o servicios, citas y
              reglas de atención.
            </p>
            <p className="text-sm text-slate-500 mb-8">
              <Clock className="inline h-4 w-4 -mt-0.5 mr-1 text-primary-500" />
              Tiempo estimado de implementación: <strong>aproximadamente 2 semanas</strong>.
            </p>

            {/* Timeline */}
            <div className="mb-8">
              {steps.map((s, i) => (
                <TimelineStep key={s.title} {...s} isLast={i === steps.length - 1} />
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <a href={`mailto:${SUPPORT_EMAIL}`} className="flex-1">
                <Button variant="secondary" className="w-full" icon={<Headset className="h-4 w-4" />}>
                  Contactar soporte
                </Button>
              </a>
              <Button
                variant="ghost"
                className="flex-1"
                icon={<LogOut className="h-4 w-4" />}
                onClick={logout}
              >
                Cerrar sesión
              </Button>
            </div>
          </div>
        </div>

        {user?.email && (
          <p className="mt-6 text-center text-xs text-slate-400">
            Sesión iniciada como {user.email}
          </p>
        )}
      </div>
    </div>
  )
}
