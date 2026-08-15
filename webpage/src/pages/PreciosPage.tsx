import {
  Check,
  Minus,
  MessageSquareText,
  Rocket,
  CalendarClock,
  Cable,
  ChevronDown,
  Sparkles,
} from 'lucide-react'
import { Navbar } from '@/components/landing/Navbar'
import { Footer } from '@/components/layout/Footer'
import { SectionBadge, CtaButtons } from '@/components/ui/page-sections'
import { PricingTable } from '@/components/ui/pricing-table'
import { cn } from '@/lib/utils'
import { SEOHead } from '@/components/seo/SEOHead'
import { PRICING_JSON_LD } from '@/lib/seo'

/* ========================================================================== */
/*  Datos de la comparación                                                    */
/* ========================================================================== */

type Cell = string | boolean

interface CompareRow {
  label: string
  basico: Cell
  pro: Cell
  enterprise: Cell
}

const COMPARE_ROWS: CompareRow[] = [
  { label: 'Precio mensual', basico: 'USD 40', pro: 'USD 60', enterprise: 'USD 90' },
  { label: 'Precio anual', basico: 'USD 408', pro: 'USD 612', enterprise: 'USD 918' },
  {
    label: 'Implementación (pago único)',
    basico: 'USD 250',
    pro: 'USD 450',
    enterprise: 'Desde USD 600',
  },
  { label: 'Usuarios incluidos', basico: '1', pro: 'Hasta 4', enterprise: 'Hasta 10' },
  { label: 'Agentes IA', basico: '2', pro: '2', enterprise: '2' },
  { label: 'Números de WhatsApp', basico: '2', pro: '2', enterprise: '2' },
  { label: 'Panel de conversaciones', basico: true, pro: true, enterprise: true },
  { label: 'Intervención humana', basico: true, pro: true, enterprise: true },
  {
    label: 'Dashboard y reportes',
    basico: 'Básicos',
    pro: 'Más completos',
    enterprise: 'Avanzados',
  },
  { label: 'Cotizaciones', basico: true, pro: true, enterprise: true },
  { label: 'Audios de WhatsApp', basico: true, pro: true, enterprise: true },
  { label: 'Catálogo manual', basico: true, pro: true, enterprise: true },
  { label: 'Entrenamiento con documento', basico: true, pro: true, enterprise: true },
  { label: 'Catálogo dedicado de productos/servicios', basico: false, pro: true, enterprise: true },
  { label: 'Carga masiva de catálogo', basico: false, pro: true, enterprise: true },
  { label: 'Citas y consultas por IA', basico: false, pro: true, enterprise: true },
  { label: 'Reportes avanzados', basico: false, pro: false, enterprise: true },
  { label: 'Integraciones con CRM', basico: false, pro: false, enterprise: 'Bajo requerimiento' },
  {
    label: 'Odoo, SAP o QuickBooks',
    basico: false,
    pro: false,
    enterprise: 'Bajo evaluación',
  },
  { label: 'Sistemas personalizados / API', basico: false, pro: false, enterprise: 'Bajo evaluación' },
  { label: 'Soporte', basico: 'Básico', pro: 'Prioritario', enterprise: 'Preferencial' },
  {
    label: 'Ideal para',
    basico: 'Salones, peluquerías y pequeños negocios de servicios',
    pro: 'Clínicas, spas, consultorios y negocios en crecimiento',
    enterprise: 'Operaciones más complejas o mayor volumen',
  },
]

const CHOOSE = [
  {
    icon: Rocket,
    name: 'Básico',
    tagline: 'Para negocios que quieren empezar',
    text: 'Perfecto para salones, peluquerías y pequeños negocios que necesitan responder rápido y organizar solicitudes sin una operación compleja.',
  },
  {
    icon: CalendarClock,
    name: 'Pro',
    tagline: 'Para negocios con agenda o catálogo',
    text: 'Ideal si necesitas manejar más usuarios, cargar productos o servicios de forma masiva y permitir que la IA ayude con citas o consultas.',
    popular: true,
  },
  {
    icon: Cable,
    name: 'Enterprise',
    tagline: 'Para negocios que necesitan integración',
    text: 'Pensado para empresas que quieren conectar WhatsApp con CRM, Odoo, SAP, QuickBooks, inventarios o sistemas internos.',
  },
]

const FAQ = [
  {
    q: '¿Los precios incluyen el uso de IA?',
    a: 'Sí, cada plan contempla una capacidad mensual estimada de uso de IA. El consumo real depende del volumen y tipo de conversaciones.',
  },
  {
    q: '¿Qué pasa si supero el rango de mensajes?',
    a: 'Se puede evaluar una ampliación, ajuste de plan o condiciones adicionales según el consumo real del negocio.',
  },
  {
    q: '¿Las integraciones están incluidas en Enterprise?',
    a: 'El plan Enterprise permite evaluar integraciones avanzadas, pero cada conexión depende de la disponibilidad de API, permisos, complejidad y alcance técnico.',
  },
  {
    q: '¿Puedo cambiar de plan?',
    a: 'Sí, el negocio puede iniciar con un plan y escalar según usuarios, mensajes, agentes, citas o integraciones necesarias.',
  },
  {
    q: '¿El catálogo del plan Básico funciona como inventario?',
    a: 'No. En el plan Básico el catálogo o documento se usa para alimentar la información de la IA, pero no funciona como inventario formal. El manejo avanzado de catálogo está disponible desde el plan Pro.',
  },
]

/* ========================================================================== */
/*  Secciones                                                                  */
/* ========================================================================== */

function WaitlistBanner() {
  return (
    <section className="relative bg-white pt-8 dark:bg-neutral-950">
      <div className="mx-auto max-w-screen-xl px-5 sm:px-6">
        <div className="flex flex-col items-center justify-between gap-5 rounded-2xl border border-brand-500/30 bg-gradient-to-r from-brand-600/10 via-fuchsia-500/10 to-brand-600/10 px-6 py-6 text-center shadow-sm sm:flex-row sm:text-left dark:border-brand-400/25 dark:from-brand-500/10 dark:via-fuchsia-500/10 dark:to-brand-500/10">
          <div>
            <p className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-700 dark:text-brand-300">
              <Sparkles className="h-4 w-4" />
              Lista de espera abierta
            </p>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
              Regístrate antes del lanzamiento comercial y recibe un 20% de descuento en la
              implementación de Sendwary.
            </p>
          </div>
          <a
            href="#planes"
            className="inline-flex w-full shrink-0 items-center justify-center rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-600/25 transition-all hover:bg-brand-500 hover:shadow-brand-500/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white sm:w-auto dark:focus-visible:ring-offset-neutral-950"
          >
            Ver planes disponibles
          </a>
        </div>
      </div>
    </section>
  )
}

function PricingHero() {
  return (
    <section className="relative overflow-hidden bg-white pt-10 dark:bg-neutral-950">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/3 rounded-full bg-brand-600/15 blur-[140px] dark:bg-brand-600/20" />

      <div className="relative mx-auto max-w-screen-xl px-5 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <SectionBadge>Planes simples y escalables</SectionBadge>
          <h1 className="mt-6 text-4xl font-extrabold leading-[1.1] tracking-tight text-neutral-900 sm:text-5xl md:text-6xl dark:text-white">
            Precios pensados para negocios que{' '}
            <span className="bg-gradient-to-r from-brand-500 via-fuchsia-500 to-pink-500 bg-clip-text text-transparent">
              atienden por WhatsApp
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-neutral-600 sm:text-lg dark:text-neutral-300">
            Elige el plan según la cantidad de agentes, usuarios, mensajes, citas, catálogos e
            integraciones que necesita tu operación.
          </p>
          <div className="mt-9 flex justify-center">
            <CtaButtons primaryLabel="Solicitar demo" primaryHref="/contacto?motivo=demo" secondaryLabel="Comparar planes" secondaryHref="#comparacion" />
          </div>
          <p className="mx-auto mt-6 max-w-lg text-xs leading-relaxed text-neutral-500">
            Los rangos de mensajes son estimados y pueden variar según el consumo real de IA, audios,
            contexto y longitud de las conversaciones. Cada plan incluye un pago único de
            implementación para la configuración inicial del agente.
          </p>
        </div>

        <div id="planes" className="mt-16 scroll-mt-24">
          <PricingTable />
        </div>
      </div>
    </section>
  )
}

function CompareCell({ value, highlight }: { value: Cell; highlight?: boolean }) {
  if (typeof value === 'boolean') {
    return value ? (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-500/15 text-brand-600 dark:text-brand-300">
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </span>
    ) : (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-neutral-100 text-neutral-300 dark:bg-white/5 dark:text-neutral-600">
        <Minus className="h-3.5 w-3.5" />
      </span>
    )
  }
  return (
    <span
      className={cn(
        'text-sm',
        highlight
          ? 'font-semibold text-neutral-900 dark:text-white'
          : 'text-neutral-700 dark:text-neutral-300',
      )}
    >
      {value}
    </span>
  )
}

function ComparisonSection() {
  return (
    <section
      id="comparacion"
      className="relative scroll-mt-20 border-t border-neutral-200/70 bg-neutral-50/60 py-20 sm:py-28 dark:border-white/5 dark:bg-neutral-950"
    >
      <div className="mx-auto max-w-screen-xl px-5 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl dark:text-white">
            Compara los{' '}
            <span className="bg-gradient-to-r from-brand-500 via-fuchsia-500 to-pink-500 bg-clip-text text-transparent">
              planes en detalle
            </span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg dark:text-neutral-300">
            Todo lo que incluye cada plan, en una sola vista.
          </p>
        </div>

        {/* Scroll horizontal en móvil */}
        <div className="mt-12 overflow-x-auto rounded-2xl border border-neutral-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.02]">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-neutral-200/80 dark:border-white/10">
                <th className="sticky left-0 z-10 bg-white px-5 py-4 text-sm font-semibold text-neutral-900 dark:bg-neutral-950 dark:text-white">
                  Características
                </th>
                <th className="px-5 py-4 text-center text-sm font-semibold text-neutral-900 dark:text-white">
                  Básico
                </th>
                <th className="bg-brand-500/[0.06] px-5 py-4 text-center text-sm font-semibold text-brand-700 dark:text-brand-200">
                  Pro
                </th>
                <th className="px-5 py-4 text-center text-sm font-semibold text-neutral-900 dark:text-white">
                  Enterprise
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map((row, i) => (
                <tr
                  key={row.label}
                  className={cn(
                    'border-b border-neutral-200/60 last:border-0 dark:border-white/5',
                    i % 2 === 1 && 'bg-neutral-50/50 dark:bg-white/[0.015]',
                  )}
                >
                  <th className="sticky left-0 z-10 bg-inherit px-5 py-4 text-left text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    {row.label}
                  </th>
                  <td className="px-5 py-4 text-center">
                    <CompareCell value={row.basico} />
                  </td>
                  <td className="bg-brand-500/[0.05] px-5 py-4 text-center">
                    <CompareCell value={row.pro} highlight />
                  </td>
                  <td className="px-5 py-4 text-center">
                    <CompareCell value={row.enterprise} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function TokensSection() {
  const bullets = [
    'Mensajes cortos consumen menos.',
    'Audios o conversaciones largas pueden consumir más.',
    'La configuración del agente puede influir en el consumo.',
    'Si tu negocio supera el rango del plan, se puede evaluar ampliación o cambio de plan.',
  ]
  return (
    <section className="relative bg-white py-20 sm:py-28 dark:bg-neutral-950">
      <div className="mx-auto max-w-3xl px-5 sm:px-6">
        <div className="rounded-3xl border border-brand-500/25 bg-brand-500/[0.04] p-8 sm:p-10 dark:border-brand-400/25 dark:bg-brand-400/[0.05]">
          <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-brand-500/20 bg-brand-500/10 text-brand-600 dark:border-brand-400/20 dark:bg-brand-400/10 dark:text-brand-300">
            <MessageSquareText className="h-6 w-6" strokeWidth={1.75} />
          </div>
          <h2 className="text-2xl font-bold text-neutral-900 sm:text-3xl dark:text-white">
            Sobre los mensajes incluidos
          </h2>
          <p className="mt-4 text-base leading-relaxed text-neutral-600 dark:text-neutral-300">
            Los mensajes incluidos se presentan como rangos estimados porque el consumo depende de la
            longitud de las conversaciones, cantidad de contexto, uso de audios, instrucciones del
            agente y consumo real de IA. Cada plan contempla una capacidad mensual pensada para su
            tipo de negocio.
          </p>
          <ul className="mt-6 space-y-3">
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-3 text-sm text-neutral-700 dark:text-neutral-300">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-brand-600 dark:text-brand-300">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                {b}
              </li>
            ))}
          </ul>
   
        </div>
      </div>
    </section>
  )
}

function ChooseSection() {
  return (
    <section className="relative border-t border-neutral-200/70 bg-neutral-50/60 py-20 sm:py-28 dark:border-white/5 dark:bg-neutral-950">
      <div className="mx-auto max-w-screen-xl px-5 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl dark:text-white">
            ¿Qué plan{' '}
            <span className="bg-gradient-to-r from-brand-500 via-fuchsia-500 to-pink-500 bg-clip-text text-transparent">
              elegir?
            </span>
          </h2>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-3">
          {CHOOSE.map((c) => (
            <div
              key={c.name}
              className={cn(
                'flex flex-col rounded-2xl border bg-white p-7 shadow-sm dark:bg-white/[0.03]',
                c.popular
                  ? 'border-brand-500/50 dark:border-brand-400/50'
                  : 'border-neutral-200/80 dark:border-white/10',
              )}
            >
              <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-brand-500/20 bg-brand-500/10 text-brand-600 dark:border-brand-400/20 dark:bg-brand-400/10 dark:text-brand-300">
                <c.icon className="h-6 w-6" strokeWidth={1.75} />
              </div>
              <h3 className="text-lg font-bold text-neutral-900 dark:text-white">{c.name}</h3>
              <p className="mt-1 text-sm font-semibold text-brand-600 dark:text-brand-300">
                {c.tagline}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                {c.text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function FaqSection() {
  return (
    <section className="relative bg-white py-20 sm:py-28 dark:bg-neutral-950">
      <div className="mx-auto max-w-3xl px-5 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <SectionBadge>Preguntas frecuentes</SectionBadge>
          <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl dark:text-white">
            Dudas sobre{' '}
            <span className="bg-gradient-to-r from-brand-500 via-fuchsia-500 to-pink-500 bg-clip-text text-transparent">
              precios y planes
            </span>
          </h2>
        </div>

        <div className="mt-12 space-y-3">
          {FAQ.map((item) => (
            <details
              key={item.q}
              className="group rounded-2xl border border-neutral-200/80 bg-white px-5 py-4 shadow-sm transition-colors open:border-brand-300 dark:border-white/10 dark:bg-white/[0.03] dark:open:border-brand-400/40"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-sm font-semibold text-neutral-900 dark:text-white [&::-webkit-details-marker]:hidden">
                {item.q}
                <ChevronDown className="h-5 w-5 shrink-0 text-brand-500 transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

function PageCTA() {
  return (
    <section className="relative overflow-hidden bg-white py-20 sm:py-28 dark:bg-neutral-950">
      <div className="relative mx-auto max-w-screen-xl px-5 sm:px-6">
        <div className="relative mx-auto max-w-4xl overflow-hidden rounded-[2rem] border border-brand-500/20 bg-neutral-950 px-6 py-16 text-center shadow-2xl shadow-brand-900/30 sm:px-12 sm:py-20 dark:border-white/10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(124,58,237,0.28),transparent_60%)]" />
          <div className="pointer-events-none absolute -bottom-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-fuchsia-600/15 blur-[130px]" />

          <div className="relative mx-auto max-w-2xl">
            <h2 className="text-3xl font-extrabold leading-[1.15] tracking-tight text-white sm:text-4xl">
              ¿No sabes cuál{' '}
              <span className="bg-gradient-to-r from-brand-400 via-fuchsia-400 to-pink-400 bg-clip-text text-transparent">
                plan elegir?
              </span>
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-neutral-300 sm:text-lg">
              Cuéntanos cómo atiende tu negocio por WhatsApp y te ayudamos a identificar el plan más
              adecuado según usuarios, mensajes, agentes e integraciones.
            </p>
            <div className="mt-9 flex justify-center">
              <CtaButtons
                primaryLabel="Solicitar recomendación"
                primaryHref="/contacto?motivo=recomendacion"
                secondaryLabel="Ver cómo funciona"
                secondaryHref="/como-funciona"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ========================================================================== */
/*  Página                                                                     */
/* ========================================================================== */

export default function PreciosPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <SEOHead
        title="Precios Sendwary | Planes para agentes IA en negocios"
        description="Conoce los planes de Sendwary para automatizar atención, cotizaciones, citas, audios, catálogo, reportes e integraciones según las necesidades de tu negocio."
        path="/precios"
        jsonLd={PRICING_JSON_LD}
      />
      <Navbar />
      <main>
        <WaitlistBanner />
        <PricingHero />
        <ComparisonSection />
        <TokensSection />
        <ChooseSection />
        <FaqSection />
        <PageCTA />
      </main>
      <Footer />
    </div>
  )
}
