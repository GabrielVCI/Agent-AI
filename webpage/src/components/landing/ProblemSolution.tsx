import * as React from 'react'
import {
  MessageCircle,
  FileText,
  Mic,
  UserCheck,
  X,
  Check,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* -------------------------------------------------------------------------- */
/*  Datos de la sección (fáciles de editar / reutilizar).                      */
/* -------------------------------------------------------------------------- */

interface Benefit {
  icon: LucideIcon
  title: string
  description: string
}

const BENEFITS: Benefit[] = [
  {
    icon: MessageCircle,
    title: 'Atención automática',
    description:
      'El agente IA responde preguntas frecuentes, horarios, servicios, disponibilidad y solicitudes iniciales desde WhatsApp.',
  },
  {
    icon: FileText,
    title: 'Cotizaciones y solicitudes',
    description:
      'Captura datos del cliente y ayuda a preparar cotizaciones o solicitudes para que tu equipo pueda dar seguimiento más rápido.',
  },
  {
    icon: Mic,
    title: 'Audios y conversaciones',
    description:
      'Facilita la atención de clientes que escriben o envían audios, manteniendo el historial organizado en el panel.',
  },
  {
    icon: UserCheck,
    title: 'Control humano',
    description:
      'Tu equipo puede tomar una conversación cuando haga falta. Mientras el humano responde, la IA se detiene.',
  },
]

const BEFORE = [
  'Mensajes sin responder',
  'Clientes esperando',
  'Conversaciones desordenadas',
  'Poca visibilidad del seguimiento',
]

const AFTER = [
  'Respuestas automáticas',
  'Panel centralizado',
  'Intervención humana',
  'Solicitudes organizadas',
]

/* -------------------------------------------------------------------------- */
/*  Subcomponentes                                                             */
/* -------------------------------------------------------------------------- */

function BenefitCard({ icon: Icon, title, description }: Benefit) {
  return (
    <div
      className={cn(
        'group relative flex flex-col rounded-2xl border border-neutral-200/80 bg-white p-6 text-left shadow-sm transition-all',
        'hover:-translate-y-1 hover:border-brand-300 hover:shadow-lg hover:shadow-brand-500/10',
        'dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-brand-400/40',
      )}
    >
      {/* Halo sutil al pasar el cursor */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-brand-500/[0.04] to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

      <div className="relative mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-brand-500/20 bg-brand-500/10 text-brand-600 dark:border-brand-400/20 dark:bg-brand-400/10 dark:text-brand-300">
        <Icon className="h-6 w-6" strokeWidth={1.75} />
      </div>

      <h3 className="relative mb-2 text-lg font-semibold text-neutral-900 dark:text-white">
        {title}
      </h3>
      <p className="relative text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
        {description}
      </p>
    </div>
  )
}

function ComparisonList({
  variant,
  title,
  items,
}: {
  variant: 'before' | 'after'
  title: string
  items: string[]
}) {
  const isAfter = variant === 'after'
  const Icon = isAfter ? Check : X

  return (
    <div
      className={cn(
        'rounded-2xl border p-6 sm:p-7',
        isAfter
          ? 'border-brand-500/30 bg-brand-500/[0.06] dark:border-brand-400/30 dark:bg-brand-400/[0.06]'
          : 'border-neutral-200 bg-neutral-50 dark:border-white/10 dark:bg-white/[0.02]',
      )}
    >
      <span
        className={cn(
          'mb-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider',
          isAfter
            ? 'text-brand-600 dark:text-brand-300'
            : 'text-neutral-400 dark:text-neutral-500',
        )}
      >
        {isAfter ? 'Con la plataforma' : 'Sin la plataforma'}
      </span>
      <p className="mb-5 text-base font-semibold text-neutral-900 dark:text-white">{title}</p>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item} className="flex items-center gap-3">
            <span
              className={cn(
                'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                isAfter
                  ? 'bg-brand-500/15 text-brand-600 dark:text-brand-300'
                  : 'bg-neutral-200 text-neutral-400 dark:bg-white/10 dark:text-neutral-500',
              )}
            >
              <Icon className="h-3 w-3" strokeWidth={3} />
            </span>
            <span
              className={cn(
                'text-sm',
                isAfter
                  ? 'text-neutral-700 dark:text-neutral-200'
                  : 'text-neutral-500 line-through decoration-neutral-300 dark:decoration-white/20',
              )}
            >
              {item}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Sección principal                                                          */
/* -------------------------------------------------------------------------- */

export const ProblemSolution = React.forwardRef<HTMLElement>((_, ref) => {
  return (
    <section
      ref={ref}
      id="por-que"
      className="relative overflow-hidden border-t border-neutral-200/70 bg-neutral-50/60 py-20 sm:py-28 dark:border-white/5 dark:bg-neutral-950"
    >
      {/* Acento morado sutil de fondo */}
      <div className="pointer-events-none absolute right-1/2 top-0 h-[30rem] w-[30rem] translate-x-1/2 rounded-full bg-brand-500/[0.07] blur-[130px] dark:bg-brand-600/10" />

      <div className="relative mx-auto max-w-screen-xl px-5 sm:px-6">
        {/* Encabezado */}
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-4 py-1.5 text-xs font-medium text-brand-700 backdrop-blur-sm dark:border-brand-400/20 dark:bg-brand-400/10 dark:text-brand-200">
            El problema no es WhatsApp
          </span>

          <h2 className="mt-6 text-3xl font-extrabold leading-[1.15] tracking-tight text-neutral-900 sm:text-4xl md:text-[2.75rem] dark:text-white">
            Tu negocio puede perder clientes{' '}
            <span className="bg-gradient-to-r from-brand-500 via-fuchsia-500 to-pink-500 bg-clip-text text-transparent">
              por no responder a tiempo
            </span>
          </h2>

          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg dark:text-neutral-300">
            Cuando los mensajes se acumulan, las oportunidades se enfrían. Nuestra plataforma ayuda a
            responder automáticamente, organizar conversaciones y permitir que tu equipo intervenga
            justo cuando hace falta.
          </p>
        </div>

        {/* Cards de beneficios */}
        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {BENEFITS.map((benefit) => (
            <BenefitCard key={benefit.title} {...benefit} />
          ))}
        </div>

        {/* Bloque comparativo antes / después */}
        <div className="mt-16 grid grid-cols-1 gap-5 md:grid-cols-2">
          <ComparisonList
            variant="before"
            title="Antes: oportunidades que se enfrían"
            items={BEFORE}
          />
          <ComparisonList
            variant="after"
            title="Después: cada conversación bajo control"
            items={AFTER}
          />
        </div>
      </div>
    </section>
  )
})

ProblemSolution.displayName = 'ProblemSolution'
