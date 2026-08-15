import * as React from 'react'
import { Check, Sparkles, Percent } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type PlanLevel } from '@/lib/waitlist'
import { WaitlistModal } from '@/components/waitlist/WaitlistModal'

/* -------------------------------------------------------------------------- */
/*  Datos de planes (fuente única, reutilizada en cards y comparación).        */
/* -------------------------------------------------------------------------- */

export interface Plan {
  id: PlanLevel
  name: string
  monthly: number
  annual: number
  /** Pago único de implementación (setup inicial). */
  setup: number
  /** Si el setup es un precio "desde" (p. ej. Enterprise). */
  setupFrom?: boolean
  description: string
  features: string[]
  messages: string
  cta: string
  popular?: boolean
}

export const PLANS: Plan[] = [
  {
    id: 'basico',
    name: 'Básico',
    monthly: 40,
    annual: 408,
    setup: 250,
    description:
      'Para salones, peluquerías y pequeños negocios que quieren empezar a automatizar la atención por WhatsApp.',
    features: [
      'Hasta 2 agentes IA',
      'Hasta 2 números de WhatsApp',
      '1 usuario',
      'Panel de conversaciones',
      'Dashboard y reportes básicos',
      'Generación de cotizaciones',
      'Procesamiento de audios de WhatsApp',
      'Catálogo manual y documento para alimentar la IA',
      'Intervención humana',
      'Soporte básico',
    ],
    messages: 'Rango estimado: 1,500 a 3,000 mensajes mensuales.',
    cta: 'Empieza Gratis',
  },
  {
    id: 'pro',
    name: 'Pro',
    monthly: 60,
    annual: 612,
    setup: 450,
    description:
      'Para clínicas, spas, consultorios, talleres con agenda y negocios en crecimiento con más volumen de atención.',
    features: [
      'Todo lo del plan Básico',
      'Hasta 4 usuarios',
      'Catálogo dedicado de productos/servicios',
      'Carga masiva de catálogo',
      'Citas y consultas gestionadas por IA',
      'Flujos para coordinar espacios por WhatsApp',
      'Reportes más completos',
      'Mayor capacidad de mensajes',
      'Soporte prioritario',
    ],
    messages: 'Rango estimado: 3,000 a 6,000 mensajes mensuales.',
    cta: 'Empieza Gratis',
    popular: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    monthly: 90,
    annual: 918,
    setup: 600,
    setupFrom: true,
    description:
      'Para negocios con operaciones más complejas, mayor volumen o necesidad de integraciones. Todo desde un solo lugar.',
    features: [
      'Todo lo del plan Pro',
      'Hasta 10 usuarios',
      'Integraciones avanzadas bajo requerimiento',
      'Posibilidad de integración con CRM',
      'Odoo, SAP, QuickBooks bajo evaluación',
      'APIs externas o sistemas internos',
      'Automatizaciones y flujos personalizados',
      'Reportes avanzados',
      'Acompañamiento para evaluación técnica',
      'Soporte preferencial',
    ],
    messages: 'Rango estimado: 6,000 a 10,000 mensajes mensuales.',
    cta: 'Solicitar Enterprise',
  },
]

/* -------------------------------------------------------------------------- */
/*  Toggle mensual / anual                                                     */
/* -------------------------------------------------------------------------- */

type Billing = 'mensual' | 'anual'

function BillingToggle({
  billing,
  onChange,
}: {
  billing: Billing
  onChange: (b: Billing) => void
}) {
  return (
    <div className="inline-flex items-center rounded-full border border-neutral-200 bg-white p-1 shadow-sm dark:border-white/10 dark:bg-white/5">
      {(['mensual', 'anual'] as Billing[]).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={cn(
            'relative rounded-full px-5 py-2 text-sm font-semibold capitalize transition-colors',
            billing === option
              ? 'bg-brand-600 text-white shadow-sm'
              : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white',
          )}
        >
          {option}
          {option === 'anual' && billing !== 'anual' && (
            <span className="ml-1.5 rounded-full bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-bold text-brand-600 dark:text-brand-300">
              -15%
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Card de plan                                                               */
/* -------------------------------------------------------------------------- */

function PlanCard({
  plan,
  billing,
  onJoinWaitlist,
}: {
  plan: Plan
  billing: Billing
  onJoinWaitlist: (plan: PlanLevel) => void
}) {
  const price = billing === 'mensual' ? plan.monthly : plan.annual
  const period = billing === 'mensual' ? '/mes' : '/año'
  const perMonth = (plan.annual / 12).toFixed(plan.annual / 12 % 1 === 0 ? 0 : 1)

  return (
    <div
      className={cn(
        'relative flex flex-col rounded-2xl border p-7 transition-all',
        plan.popular
          ? 'border-brand-500/50 bg-white shadow-xl shadow-brand-500/10 dark:border-brand-400/50 dark:bg-white/[0.04]'
          : 'border-neutral-200/80 bg-white shadow-sm hover:border-brand-300 hover:shadow-lg hover:shadow-brand-500/10 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-brand-400/40',
      )}
    >
      {plan.popular && (
        <span className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-600 to-fuchsia-600 px-3.5 py-1 text-xs font-semibold text-white shadow-md shadow-brand-600/30">
          <Sparkles className="h-3.5 w-3.5" />
          Más popular
        </span>
      )}

      <h3 className="text-lg font-bold text-neutral-900 dark:text-white">{plan.name}</h3>

      <div className="mt-4 flex items-end gap-1.5">
        <span className="text-4xl font-extrabold tracking-tight text-neutral-900 dark:text-white">
          ${price}
        </span>
        <span className="mb-1 text-sm font-medium text-neutral-500 dark:text-neutral-400">
          USD {period}
        </span>
      </div>
      <p className="mt-1 h-4 text-xs text-brand-600 dark:text-brand-300">
        {billing === 'anual' ? `≈ $${perMonth}/mes · Pago anual con descuento` : ' '}
      </p>

      <p className="mt-3 inline-flex flex-wrap items-center gap-1.5 rounded-lg bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-600 dark:bg-white/5 dark:text-neutral-300">
        + {plan.setupFrom ? 'desde ' : ''}USD {plan.setup} de implementación
        <span className="text-neutral-400 dark:text-neutral-500">(pago único)</span>
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-brand-600 to-fuchsia-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm shadow-brand-600/25">
          <Percent className="h-3 w-3" strokeWidth={3} />
          20% OFF implementación
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
        Disponible para clientes registrados en la lista de espera.
      </p>

      <p className="mt-4 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
        {plan.description}
      </p>

      <button
        type="button"
        onClick={() => onJoinWaitlist(plan.id)}
        className={cn(
          'mt-6 inline-flex w-full items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-950',
          plan.popular
            ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/25 hover:bg-brand-500 hover:shadow-brand-500/40'
            : 'border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-100 dark:border-white/10 dark:bg-white/5 dark:text-neutral-100 dark:hover:bg-white/10',
        )}
      >
        Unirme a la lista - {plan.name}
      </button>

      <div className="mt-7 border-t border-neutral-200/70 pt-6 dark:border-white/10">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
          Características
        </p>
        <ul className="space-y-3">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2.5 text-sm text-neutral-700 dark:text-neutral-300">
              <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-brand-600 dark:text-brand-300">
                <Check className="h-2.5 w-2.5" strokeWidth={3} />
              </span>
              {feature}
            </li>
          ))}
        </ul>
        <p className="mt-5 rounded-lg bg-neutral-50 px-3 py-2 text-xs leading-relaxed text-neutral-500 dark:bg-white/5 dark:text-neutral-400">
          {plan.messages} Sujeto al tamaño de las conversaciones y consumo de IA.
        </p>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Tabla de precios (toggle + 3 cards)                                        */
/* -------------------------------------------------------------------------- */

export function PricingTable() {
  const [billing, setBilling] = React.useState<Billing>('mensual')
  const [selectedPlan, setSelectedPlan] = React.useState<PlanLevel | null>(null)
  const [waitlistOpen, setWaitlistOpen] = React.useState(false)

  function handleJoinWaitlist(plan: PlanLevel) {
    setSelectedPlan(plan)
    setWaitlistOpen(true)
  }

  return (
    <div>
      <div className="flex justify-center">
        <BillingToggle billing={billing} onChange={setBilling} />
      </div>

      <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {PLANS.map((plan) => (
          <PlanCard key={plan.id} plan={plan} billing={billing} onJoinWaitlist={handleJoinWaitlist} />
        ))}
      </div>

      <WaitlistModal open={waitlistOpen} onOpenChange={setWaitlistOpen} selectedPlan={selectedPlan} />
    </div>
  )
}
