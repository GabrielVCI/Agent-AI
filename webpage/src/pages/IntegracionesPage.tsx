import * as React from 'react'
import {
  MessageCircle,
  Bot,
  LayoutDashboard,
  Boxes,
  Workflow,
  ServerCog,
  ReceiptText,
  PackageSearch,
  UsersRound,
  PlugZap,
  ClipboardList,
  FileText,
  Copy,
  Route,
  TrendingUp,
  SearchCheck,
  ShieldCheck,
  ListChecks,
  Rocket,
  ShieldAlert,
  ArrowRight,
  ArrowDown,
  type LucideIcon,
} from 'lucide-react'
import { Navbar } from '@/components/landing/Navbar'
import { Footer } from '@/components/layout/Footer'
import { SectionBadge, IconBadge, CtaButtons } from '@/components/ui/page-sections'
import { BrandIcon, type BrandName } from '@/components/ui/brand-icon'
import { IntegrationBadge } from '@/components/ui/integration-badge'
import { cn } from '@/lib/utils'
import { SEOHead } from '@/components/seo/SEOHead'

/* ========================================================================== */
/*  Datos                                                                      */
/* ========================================================================== */

interface Card {
  icon: LucideIcon
  title: string
  description: string
  /** Si es una marca reconocible, muestra su logo real. */
  brand?: BrandName
}

const FLOW_EXTERNAL: { label: string; brand?: BrandName }[] = [
  { label: 'Odoo', brand: 'odoo' },
  { label: 'SAP', brand: 'sap' },
  { label: 'QuickBooks', brand: 'quickbooks' },
  { label: 'Inventario' },
  { label: 'CRM' },
  { label: 'Ecommerce' },
  { label: 'Google Sheets', brand: 'google-sheets' },
  { label: 'Calendario' },
  { label: 'API externa' },
  { label: 'Base de datos' },
]

const SYSTEMS: Card[] = [
  {
    icon: Workflow,
    brand: 'odoo',
    title: 'Odoo',
    description:
      'Posibilidad de conectar con módulos de ventas, inventario, clientes o cotizaciones cuando el negocio ya trabaja sus procesos dentro de Odoo.',
  },
  {
    icon: ServerCog,
    brand: 'sap',
    title: 'SAP',
    description:
      'Para empresas con operaciones más estructuradas, se puede evaluar una integración con SAP según disponibilidad de API, permisos, alcance y procesos internos.',
  },
  {
    icon: ReceiptText,
    brand: 'quickbooks',
    title: 'QuickBooks',
    description:
      'En negocios que manejan facturación, clientes o datos financieros en QuickBooks, se puede analizar una conexión para reducir tareas manuales y mejorar trazabilidad.',
  },
  {
    icon: PackageSearch,
    title: 'Inventario y catálogo',
    description:
      'Permite evaluar conexiones con sistemas de inventario para consultar productos, disponibilidad, precios, categorías o detalles útiles durante la conversación.',
  },
  {
    icon: UsersRound,
    title: 'CRM y seguimiento comercial',
    description:
      'La información capturada desde WhatsApp puede alimentar procesos de seguimiento comercial, clasificación de clientes y gestión de oportunidades.',
  },
  {
    icon: PlugZap,
    title: 'Sistemas personalizados',
    description:
      'Si el negocio usa una base de datos, API interna, ecommerce, hoja de cálculo o software propio, se puede evaluar una integración a la medida.',
  },
]

const BENEFITS: Card[] = [
  {
    icon: PackageSearch,
    title: 'Consultar disponibilidad',
    description:
      'El agente puede apoyarse en datos de productos, servicios o inventario para orientar mejor al cliente.',
  },
  {
    icon: ClipboardList,
    title: 'Capturar solicitudes',
    description:
      'Las conversaciones pueden convertirse en solicitudes, oportunidades, citas o registros para seguimiento.',
  },
  {
    icon: FileText,
    title: 'Preparar cotizaciones',
    description:
      'Según el alcance de integración, se puede facilitar la creación o preparación de cotizaciones con datos del negocio.',
  },
  {
    icon: Copy,
    title: 'Reducir doble digitación',
    description:
      'Evita copiar manualmente información entre WhatsApp, hojas de cálculo, CRM o sistemas administrativos.',
  },
  {
    icon: Route,
    title: 'Mejorar trazabilidad',
    description:
      'El negocio puede saber qué solicitó el cliente, cuándo escribió, quién atendió y qué seguimiento necesita.',
  },
  {
    icon: TrendingUp,
    title: 'Escalar procesos',
    description:
      'La plataforma puede empezar simple y crecer hacia flujos más avanzados según el volumen de mensajes y operaciones.',
  },
]

interface EnterpriseColumn {
  name: string
  brand: BrandName
  items: string[]
}

const ENTERPRISE: EnterpriseColumn[] = [
  {
    name: 'Odoo',
    brand: 'odoo',
    items: ['Clientes', 'Productos', 'Inventario', 'Cotizaciones', 'Ventas'],
  },
  {
    name: 'SAP',
    brand: 'sap',
    items: [
      'Procesos empresariales',
      'Datos operativos',
      'Flujos internos',
      'Validaciones',
      'Integración bajo alcance',
    ],
  },
  {
    name: 'QuickBooks',
    brand: 'quickbooks',
    items: [
      'Clientes',
      'Facturación',
      'Información comercial',
      'Registros administrativos',
      'Seguimiento financiero',
    ],
  },
]

const PROCESS: Card[] = [
  {
    icon: SearchCheck,
    title: 'Entendemos tu operación',
    description:
      'Revisamos cómo atiendes clientes, qué sistema usas y qué información necesitas conectar.',
  },
  {
    icon: ShieldCheck,
    title: 'Validamos disponibilidad técnica',
    description:
      'Analizamos si el sistema cuenta con API, base de datos, exportaciones, permisos o métodos seguros de conexión.',
  },
  {
    icon: ListChecks,
    title: 'Definimos el alcance',
    description:
      'Se determina qué datos deben consultarse, guardarse o sincronizarse para evitar desarrollos innecesarios.',
  },
  {
    icon: Rocket,
    title: 'Implementamos por fases',
    description:
      'Primero se automatiza lo esencial y luego se agregan conexiones más avanzadas según prioridad.',
  },
]

const FLOW_NODES: { icon: LucideIcon; label: string; brand?: BrandName }[] = [
  { icon: MessageCircle, label: 'WhatsApp', brand: 'whatsapp' },
  { icon: Bot, label: 'Agente IA' },
  { icon: LayoutDashboard, label: 'Panel SaaS' },
  { icon: Boxes, label: 'Sistemas externos' },
]

/* ========================================================================== */
/*  Contenedor de icono: logo de marca real o icono genérico                   */
/* ========================================================================== */

function NodeIcon({ icon, brand }: { icon: LucideIcon; brand?: BrandName }) {
  if (brand) {
    return (
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-brand-500/20 bg-white text-brand-600 shadow-sm dark:border-brand-400/20 dark:bg-white/90">
        <BrandIcon name={brand} colored className="h-6 w-6" />
      </span>
    )
  }
  return <IconBadge icon={icon} />
}

/* ========================================================================== */
/*  Secciones                                                                  */
/* ========================================================================== */

function PageHero() {
  return (
    <section className="relative overflow-hidden bg-white pt-16 dark:bg-neutral-950">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/3 rounded-full bg-brand-600/15 blur-[140px] dark:bg-brand-600/20" />

      <div className="relative mx-auto max-w-screen-xl px-5 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <SectionBadge>Integraciones bajo requerimiento</SectionBadge>
          <h1 className="mt-6 text-4xl font-extrabold leading-[1.1] tracking-tight text-neutral-900 sm:text-5xl md:text-6xl dark:text-white">
            Conecta tu agente IA con{' '}
            <span className="bg-gradient-to-r from-brand-500 via-fuchsia-500 to-pink-500 bg-clip-text text-transparent">
              los sistemas que ya usa tu negocio
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-neutral-600 sm:text-lg dark:text-neutral-300">
            Empieza automatizando la atención por WhatsApp y, cuando tu operación lo requiera, evalúa
            integraciones con inventarios, CRM, calendarios, Odoo, SAP, QuickBooks, ecommerce, bases
            de datos o sistemas internos.
          </p>
          <div className="mt-9 flex justify-center">
            <CtaButtons primaryLabel="Solicitar evaluación" primaryHref="/contacto?tipo=integracion" />
          </div>
          <p className="mx-auto mt-6 max-w-lg text-xs leading-relaxed text-neutral-500">
            Las integraciones dependen del alcance del proyecto, disponibilidad técnica del sistema y
            fase comercial de implementación.
          </p>
        </div>

        {/* Diagrama de flujo */}
        <div className="mx-auto mt-16 max-w-5xl">
          <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-center">
            {FLOW_NODES.map((node, i) => (
              <React.Fragment key={node.label}>
                <div className="flex flex-1 flex-col items-center gap-3 rounded-2xl border border-neutral-200/80 bg-white p-5 text-center shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
                  <NodeIcon icon={node.icon} brand={node.brand} />
                  <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                    {node.label}
                  </span>
                </div>
                {i < FLOW_NODES.length - 1 && (
                  <div className="flex items-center justify-center text-brand-400">
                    <ArrowRight className="hidden h-5 w-5 shrink-0 md:block" />
                    <ArrowDown className="h-5 w-5 shrink-0 md:hidden" />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Chips de sistemas externos */}
          <div className="mt-6 flex flex-wrap justify-center gap-2.5">
            {FLOW_EXTERNAL.map((chip) => (
              <IntegrationBadge
                key={chip.label}
                label={chip.label}
                brand={chip.brand}
                className="px-3.5 text-xs"
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function CardGrid({
  badge,
  title,
  gradient,
  description,
  cards,
  note,
  tone = 'light',
}: {
  badge?: string
  title: string
  gradient: string
  description: string
  cards: Card[]
  note?: string
  tone?: 'light' | 'alt'
}) {
  return (
    <section
      className={cn(
        'relative border-t py-20 sm:py-28',
        tone === 'alt'
          ? 'border-neutral-200/70 bg-neutral-50/60 dark:border-white/5 dark:bg-neutral-950'
          : 'border-transparent bg-white dark:bg-neutral-950',
      )}
    >
      <div className="mx-auto max-w-screen-xl px-5 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          {badge && <SectionBadge>{badge}</SectionBadge>}
          <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl dark:text-white">
            {title}{' '}
            <span className="bg-gradient-to-r from-brand-500 via-fuchsia-500 to-pink-500 bg-clip-text text-transparent">
              {gradient}
            </span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg dark:text-neutral-300">
            {description}
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <div
              key={card.title}
              className="group relative flex flex-col rounded-2xl border border-neutral-200/80 bg-white p-6 text-left shadow-sm transition-all hover:-translate-y-1 hover:border-brand-300 hover:shadow-lg hover:shadow-brand-500/10 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-brand-400/40"
            >
              <div className="mb-5">
                <NodeIcon icon={card.icon} brand={card.brand} />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-neutral-900 dark:text-white">
                {card.title}
              </h3>
              <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                {card.description}
              </p>
            </div>
          ))}
        </div>

        {note && (
          <p className="mx-auto mt-8 max-w-3xl text-center text-xs leading-relaxed text-neutral-500">
            {note}
          </p>
        )}
      </div>
    </section>
  )
}

function EnterpriseSection() {
  return (
    <section className="relative overflow-hidden bg-neutral-950 py-20 text-neutral-100 sm:py-28">
      <div className="pointer-events-none absolute -left-20 top-0 h-[26rem] w-[26rem] rounded-full bg-brand-600/20 blur-[140px]" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-[24rem] w-[24rem] rounded-full bg-fuchsia-600/10 blur-[150px]" />

      <div className="relative mx-auto max-w-screen-xl px-5 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-400/25 bg-brand-400/10 px-4 py-1.5 text-xs font-medium text-brand-200 backdrop-blur-sm">
            <ServerCog className="h-3.5 w-3.5" />
            Integraciones empresariales
          </span>
          <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            De WhatsApp a{' '}
            <span className="bg-gradient-to-r from-brand-400 via-fuchsia-400 to-pink-400 bg-clip-text text-transparent">
              tu sistema de gestión
            </span>
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-neutral-300 sm:text-lg">
            Cuando el negocio ya trabaja con herramientas como Odoo, SAP o QuickBooks, la atención
            por WhatsApp puede convertirse en una entrada organizada de información para ventas,
            servicio, seguimiento o administración.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-3">
          {ENTERPRISE.map((col) => (
            <div
              key={col.name}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-7 backdrop-blur-sm transition-colors hover:border-brand-400/40"
            >
              <h3 className="mb-5 flex items-center gap-2.5 text-lg font-bold text-white">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white shadow-sm">
                  <BrandIcon name={col.brand} colored className="h-5 w-5" />
                </span>
                {col.name}
              </h3>
              <ul className="space-y-3">
                {col.items.map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm text-neutral-300">
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-brand-300">
                      <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-relaxed text-neutral-500">
          La disponibilidad de cada conexión depende del plan, permisos, API, estructura del sistema
          y alcance de implementación definido con el cliente.
        </p>
      </div>
    </section>
  )
}

function ProcessSection() {
  return (
    <section className="relative bg-white py-20 sm:py-28 dark:bg-neutral-950">
      <div className="mx-auto max-w-screen-xl px-5 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <SectionBadge>Proceso de evaluación</SectionBadge>
          <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl dark:text-white">
            Cada integración se{' '}
            <span className="bg-gradient-to-r from-brand-500 via-fuchsia-500 to-pink-500 bg-clip-text text-transparent">
              evalúa antes de implementarse
            </span>
          </h2>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PROCESS.map((step, i) => (
            <div
              key={step.title}
              className="relative flex flex-col rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.03]"
            >
              <div className="mb-5 flex items-center justify-between">
                <IconBadge icon={step.icon} />
                <span className="text-3xl font-extrabold text-neutral-200 dark:text-white/10">
                  {i + 1}
                </span>
              </div>
              <h3 className="mb-2 text-base font-semibold text-neutral-900 dark:text-white">
                {step.title}
              </h3>
              <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function TransparencySection() {
  return (
    <section className="relative bg-neutral-50/60 py-16 dark:bg-neutral-950">
      <div className="mx-auto max-w-screen-xl px-5 sm:px-6">
        <div className="relative mx-auto max-w-3xl overflow-hidden rounded-3xl border border-brand-500/25 bg-brand-500/[0.04] p-8 text-center sm:p-10 dark:border-brand-400/25 dark:bg-brand-400/[0.05]">
          <div className="mx-auto mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-brand-500/20 bg-brand-500/10 text-brand-600 dark:border-brand-400/20 dark:bg-brand-400/10 dark:text-brand-300">
            <ShieldAlert className="h-6 w-6" strokeWidth={1.75} />
          </div>
          <h2 className="text-2xl font-bold text-neutral-900 sm:text-3xl dark:text-white">
            Transparencia desde el inicio
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-neutral-600 dark:text-neutral-300">
            Las integraciones no son universales ni automáticas. Cada sistema puede tener reglas,
            permisos, costos, API o limitaciones distintas. Por eso evaluamos el alcance antes de
            prometer una conexión.
          </p>
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
              ¿Quieres conectar WhatsApp con{' '}
              <span className="bg-gradient-to-r from-brand-400 via-fuchsia-400 to-pink-400 bg-clip-text text-transparent">
                tu sistema actual?
              </span>
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-neutral-300 sm:text-lg">
              Cuéntanos qué sistema usa tu negocio y evaluamos si es posible integrarlo con el agente
              IA para reducir tareas manuales, mejorar respuestas y organizar mejor las solicitudes.
            </p>
            <div className="mt-9 flex justify-center">
              <CtaButtons primaryLabel="Solicitar evaluación" primaryHref="/contacto?tipo=integracion" />
            </div>
            <p className="mx-auto mt-6 max-w-md text-xs leading-relaxed text-neutral-500">
              Integraciones disponibles según alcance, permisos técnicos, APIs y fase de
              implementación.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ========================================================================== */
/*  Página                                                                     */
/* ========================================================================== */

export default function IntegracionesPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <SEOHead
        title="Integraciones Sendwary | Odoo, SAP, QuickBooks, CRM y sistemas internos"
        description="Sendwary puede evaluarse para integraciones con CRM, Odoo, SAP, QuickBooks, inventarios, ecommerce, APIs y sistemas internos bajo requerimiento técnico."
        path="/integraciones"
      />
      <Navbar />
      <main>
        <PageHero />
        <CardGrid
          badge="Sistemas que pueden conectarse"
          title="Preparada para integrarse con"
          gradient="herramientas clave de tu operación"
          description="No todos los negocios necesitan las mismas conexiones. Por eso, la plataforma está pensada para evaluar integraciones según el flujo real de atención, ventas y seguimiento."
          cards={SYSTEMS}
          note="Los nombres y marcas mencionados pertenecen a sus respectivos propietarios. Las integraciones están sujetas a evaluación técnica, disponibilidad de API, permisos y alcance del proyecto."
          tone="alt"
        />
        <CardGrid
          badge="Qué puede lograr una integración"
          title="Menos tareas manuales, más"
          gradient="información útil en cada conversación"
          description="Una integración bien planificada permite que el agente IA trabaje con datos reales del negocio y que el equipo tenga mejor seguimiento."
          cards={BENEFITS}
        />
        <EnterpriseSection />
        <ProcessSection />
        <TransparencySection />
        <PageCTA />
      </main>
      <Footer />
    </div>
  )
}
