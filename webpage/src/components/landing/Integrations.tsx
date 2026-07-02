import * as React from 'react'
import {
  PackageSearch,
  CalendarCheck,
  UsersRound,
  DatabaseZap,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { type BrandName } from '@/components/ui/brand-icon'
import { IntegrationBadge } from '@/components/ui/integration-badge'

/* -------------------------------------------------------------------------- */
/*  Datos de la sección                                                        */
/* -------------------------------------------------------------------------- */

interface IntegrationCategory {
  icon: LucideIcon
  title: string
  description: string
}

const CATEGORIES: IntegrationCategory[] = [
  {
    icon: PackageSearch,
    title: 'Inventario y productos',
    description:
      'Posibilidad de conectar catálogos, disponibilidad y precios para responder consultas con información más precisa.',
  },
  {
    icon: CalendarCheck,
    title: 'Citas y agenda',
    description:
      'Preparada para flujos donde el cliente solicita una cita, confirma horarios o deja datos para coordinación.',
  },
  {
    icon: UsersRound,
    title: 'CRM y seguimiento',
    description:
      'Ayuda a capturar información de clientes, clasificar solicitudes y facilitar el seguimiento comercial.',
  },
  {
    icon: DatabaseZap,
    title: 'Sistemas internos',
    description:
      'Pensada para futuras conexiones con bases de datos, ERPs, hojas de cálculo, ecommerce o soluciones hechas a la medida.',
  },
]

const CHIPS: { label: string; brand?: BrandName }[] = [
  { label: 'Odoo', brand: 'odoo' },
  { label: 'SAP', brand: 'sap' },
  { label: 'QuickBooks', brand: 'quickbooks' },
  { label: 'CRM' },
  { label: 'Inventario' },
  { label: 'Ecommerce' },
  { label: 'Google Sheets', brand: 'google-sheets' },
  { label: 'Calendario' },
  { label: 'APIs externas' },
  { label: 'Sistemas internos' },
]

/* -------------------------------------------------------------------------- */
/*  Subcomponentes                                                             */
/* -------------------------------------------------------------------------- */

function CategoryCard({ icon: Icon, title, description }: IntegrationCategory) {
  return (
    <div
      className={cn(
        'group relative flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-left backdrop-blur-sm transition-all',
        'hover:-translate-y-1 hover:border-brand-400/40 hover:bg-white/[0.05]',
      )}
    >
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-brand-500/[0.06] to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

      <div className="relative mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-brand-400/20 bg-brand-400/10 text-brand-300">
        <Icon className="h-6 w-6" strokeWidth={1.75} />
      </div>

      <h3 className="relative mb-2 text-lg font-semibold text-white">{title}</h3>
      <p className="relative text-sm leading-relaxed text-neutral-400">{description}</p>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Sección principal (banda oscura premium)                                   */
/* -------------------------------------------------------------------------- */

export const Integrations = React.forwardRef<HTMLElement>((_, ref) => {
  return (
    <section
      ref={ref}
      id="integraciones"
      className="relative overflow-hidden bg-neutral-950 py-20 text-neutral-100 sm:py-28"
    >
      {/* Acentos morados de fondo */}
      <div className="pointer-events-none absolute -left-20 top-0 h-[28rem] w-[28rem] rounded-full bg-brand-600/20 blur-[140px]" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-[26rem] w-[26rem] rounded-full bg-fuchsia-600/10 blur-[150px]" />
      {/* Malla sutil de puntos */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.15] [background-image:radial-gradient(circle,rgba(150,110,255,0.4)_1px,transparent_1px)] [background-size:32px_32px]" />

      <div className="relative mx-auto max-w-screen-xl px-5 sm:px-6">
        {/* Encabezado */}
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-400/25 bg-brand-400/10 px-4 py-1.5 text-xs font-medium text-brand-200 backdrop-blur-sm">
            Integraciones bajo requerimiento
          </span>

          <h2 className="mt-6 text-3xl font-extrabold leading-[1.15] tracking-tight text-white sm:text-4xl md:text-[2.75rem]">
            Conecta la atención por WhatsApp con{' '}
            <span className="bg-gradient-to-r from-brand-400 via-fuchsia-400 to-pink-400 bg-clip-text text-transparent">
              el resto de tu operación
            </span>
          </h2>

          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-neutral-300 sm:text-lg">
            Tu agente IA puede empezar respondiendo mensajes y organizando conversaciones. Luego,
            según el crecimiento de tu negocio, la plataforma puede prepararse para conectar
            inventarios, calendarios, CRM, sistemas contables, ecommerce o herramientas internas.
          </p>
        </div>

        {/* Cards de categorías */}
        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {CATEGORIES.map((category) => (
            <CategoryCard key={category.title} {...category} />
          ))}
        </div>

        {/* Chips de integraciones posibles */}
        <div className="mt-14">
          <div className="flex flex-wrap justify-center gap-2.5">
            {CHIPS.map((chip) => (
              <IntegrationBadge
                key={chip.label}
                label={chip.label}
                brand={chip.brand}
                className="border-white/10 bg-white/5 text-neutral-300 backdrop-blur-sm hover:border-brand-400/40 hover:text-white"
              />
            ))}
          </div>
          <p className="mx-auto mt-5 max-w-lg text-center text-xs leading-relaxed text-neutral-500">
            Las integraciones se evalúan según disponibilidad técnica, APIs, permisos y alcance del
            proyecto.
          </p>
        </div>

        {/* CTA final de la sección */}
        <div className="mt-16 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-brand-600/15 via-white/[0.03] to-transparent p-8 sm:p-10">
          <div className="flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl">
              <h3 className="text-xl font-bold text-white sm:text-2xl">
                ¿Tu negocio ya trabaja con un sistema específico?
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-neutral-300 sm:text-base">
                Podemos evaluar cómo conectar tu operación con el agente IA para reducir tareas
                manuales y mejorar el seguimiento.
              </p>
            </div>

            <div className="flex w-full shrink-0 flex-col gap-3 sm:flex-row md:w-auto">
              <a
                href="/contacto?tipo=integracion"
                className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-600/25 transition-all hover:bg-brand-500 hover:shadow-brand-500/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 sm:w-auto"
              >
                Solicitar integración
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </a>
              <a
                href="/integraciones"
                className="inline-flex w-full items-center justify-center rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-neutral-100 backdrop-blur-sm transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 sm:w-auto"
              >
                Ver posibilidades
              </a>
            </div>
          </div>
        </div>

        {/* Referencia ligera a precios */}
        <p className="mt-6 text-center text-sm text-neutral-400">
          ¿Quieres conocer la inversión?{' '}
          <a
            href="/precios"
            className="font-medium text-brand-300 underline-offset-4 transition-colors hover:text-brand-200 hover:underline"
          >
            Ver costos y precios
          </a>
        </p>
      </div>
    </section>
  )
})

Integrations.displayName = 'Integrations'
