import * as React from 'react'
import {
  MessageCircle,
  Mic,
  Sparkles,
  ClipboardList,
  LayoutDashboard,
  UserCheck,
  Repeat2,
  Bot,
  Building2,
  PhoneCall,
  Users,
  FileText,
  SlidersHorizontal,
  CalendarCheck,
  UserRound,
  Handshake,
  ShieldCheck,
  HelpCircle,
  BookOpen,
  Scissors,
  Stethoscope,
  Wrench,
  UtensilsCrossed,
  Store,
  Briefcase,
  ArrowRight,
  ArrowDown,
  type LucideIcon,
} from 'lucide-react'
import { Navbar } from '@/components/landing/Navbar'
import { Footer } from '@/components/layout/Footer'
import { SectionBadge, IconBadge, CtaButtons } from '@/components/ui/page-sections'
import { BrandIcon, type BrandName } from '@/components/ui/brand-icon'

/* ========================================================================== */
/*  Datos                                                                      */
/* ========================================================================== */

interface Item {
  icon: LucideIcon
  title: string
  description: string
}

const STEPS: Item[] = [
  {
    icon: Mic,
    title: 'El cliente escribe o envía un audio por WhatsApp',
    description:
      'El cliente puede preguntar por servicios, productos, horarios, precios, disponibilidad, citas o cotizaciones.',
  },
  {
    icon: Sparkles,
    title: 'El agente IA interpreta la solicitud',
    description:
      'La IA utiliza la información configurada del negocio, como servicios, catálogo, documentos o reglas de atención.',
  },
  {
    icon: ClipboardList,
    title: 'La IA responde o solicita datos',
    description:
      'El agente puede responder preguntas frecuentes, pedir información necesaria, tomar datos para cotización o iniciar una solicitud de cita.',
  },
  {
    icon: LayoutDashboard,
    title: 'La conversación queda organizada',
    description:
      'Todo queda guardado en el panel para revisar mensajes, dar seguimiento y medir la actividad del negocio.',
  },
  {
    icon: UserCheck,
    title: 'El equipo puede intervenir',
    description:
      'Si la conversación necesita atención personalizada, un empleado toma el control y la IA deja de responder.',
  },
  {
    icon: Repeat2,
    title: 'El flujo puede continuar',
    description:
      'Cuando el equipo lo decida, la conversación puede volver al agente IA o pasar a seguimiento interno.',
  },
]

const CAPABILITIES: Item[] = [
  {
    icon: HelpCircle,
    title: 'Responder preguntas frecuentes',
    description:
      'Horarios, ubicación, servicios, condiciones, instrucciones y datos básicos del negocio.',
  },
  {
    icon: ClipboardList,
    title: 'Tomar solicitudes',
    description:
      'Captura nombre, teléfono, necesidad del cliente y detalles importantes para seguimiento.',
  },
  {
    icon: FileText,
    title: 'Preparar cotizaciones',
    description:
      'Recopila la información necesaria para que el negocio pueda generar o completar una cotización.',
  },
  {
    icon: CalendarCheck,
    title: 'Gestionar citas o consultas',
    description:
      'Ayuda a recibir solicitudes de agenda para clínicas, spas, consultorios, centros de belleza o servicios profesionales.',
  },
  {
    icon: BookOpen,
    title: 'Usar catálogo o documentos',
    description:
      'Puede responder con base en productos, servicios o documentos cargados como información para la IA.',
  },
  {
    icon: Users,
    title: 'Escalar al equipo humano',
    description:
      'Cuando el caso requiere criterio humano, el equipo puede tomar el control desde el panel.',
  },
]

const CONFIG_CARDS: Item[] = [
  {
    icon: Building2,
    title: 'Información del negocio',
    description:
      'Nombre, descripción, horarios, ubicación, teléfonos, servicios y reglas básicas de atención.',
  },
  {
    icon: PhoneCall,
    title: 'Agentes IA y números de WhatsApp',
    description:
      'Configura agentes asociados a números reales para separar áreas, servicios o unidades del negocio.',
  },
  {
    icon: Users,
    title: 'Usuarios del equipo',
    description:
      'Adapta el acceso a equipos pequeños o negocios con varios usuarios que atienden conversaciones.',
  },
  {
    icon: FileText,
    title: 'Catálogo manual y documentos',
    description:
      'Registra productos o servicios y carga documentos para alimentar la información de la IA.',
  },
  {
    icon: SlidersHorizontal,
    title: 'Reglas de atención y escalado',
    description:
      'Define el tono, cuándo pedir datos y los criterios para escalar una conversación a una persona del equipo.',
  },
  {
    icon: CalendarCheck,
    title: 'Citas, cotizaciones e integraciones',
    description:
      'Habilita flujos de citas y cotizaciones, con integraciones futuras según el plan y el alcance.',
  },
]

const IA_ITEMS = [
  'Atiende preguntas frecuentes.',
  'Captura datos iniciales.',
  'Organiza solicitudes.',
  'Reduce tiempos de espera.',
]

const HUMAN_ITEMS = [
  'La IA deja de responder.',
  'El empleado continúa la conversación desde el panel.',
  'Se mantiene el historial completo.',
  'Se puede devolver el control al agente.',
  'Evita respuestas duplicadas o conflictos.',
]

const BUSINESS_FLOWS: Item[] = [
  {
    icon: Scissors,
    title: 'Salones y peluquerías',
    description: 'Servicios, horarios, consultas frecuentes y solicitudes de cita.',
  },
  {
    icon: Stethoscope,
    title: 'Clínicas y spas',
    description: 'Consultas, citas, datos iniciales y seguimiento.',
  },
  {
    icon: Wrench,
    title: 'Ferreterías y repuestos',
    description: 'Productos, disponibilidad, cotizaciones y solicitudes comerciales.',
  },
  {
    icon: UtensilsCrossed,
    title: 'Restaurantes',
    description: 'Consultas, pedidos, horarios, menús o solicitudes frecuentes.',
  },
  {
    icon: Store,
    title: 'Tiendas',
    description: 'Productos, precios, preguntas frecuentes y seguimiento de clientes.',
  },
  {
    icon: Briefcase,
    title: 'Servicios profesionales',
    description: 'Captura de datos, solicitudes y coordinación con el equipo.',
  },
]

const FLOW: { icon: LucideIcon; label: string; brand?: BrandName }[] = [
  { icon: MessageCircle, label: 'Cliente en WhatsApp', brand: 'whatsapp' },
  { icon: Bot, label: 'Agente IA' },
  { icon: LayoutDashboard, label: 'Panel del negocio' },
  { icon: UserCheck, label: 'Humano interviene si hace falta' },
]

/* ========================================================================== */
/*  Card reutilizable                                                          */
/* ========================================================================== */

function NodeIcon({ icon, brand }: { icon: LucideIcon; brand?: BrandName }) {
  if (brand) {
    return (
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-brand-500/20 bg-white shadow-sm dark:border-brand-400/20 dark:bg-white/90">
        <BrandIcon name={brand} colored className="h-6 w-6" />
      </span>
    )
  }
  return <IconBadge icon={icon} />
}

function FeatureCard({ icon, title, description }: Item) {
  return (
    <div className="group relative flex flex-col rounded-2xl border border-neutral-200/80 bg-white p-6 text-left shadow-sm transition-all hover:-translate-y-1 hover:border-brand-300 hover:shadow-lg hover:shadow-brand-500/10 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-brand-400/40">
      <div className="mb-5">
        <IconBadge icon={icon} />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-neutral-900 dark:text-white">{title}</h3>
      <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">{description}</p>
    </div>
  )
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
          <SectionBadge>Cómo funciona</SectionBadge>
          <h1 className="mt-6 text-4xl font-extrabold leading-[1.1] tracking-tight text-neutral-900 sm:text-5xl md:text-6xl dark:text-white">
            Así funciona la atención por WhatsApp{' '}
            <span className="bg-gradient-to-r from-brand-500 via-fuchsia-500 to-pink-500 bg-clip-text text-transparent">
              con agentes IA
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-neutral-600 sm:text-lg dark:text-neutral-300">
            Desde el primer mensaje hasta la cotización, cita o intervención humana, la plataforma
            organiza el flujo de atención para que tu negocio responda más rápido y dé mejor
            seguimiento.
          </p>
          <div className="mt-9 flex justify-center">
            <CtaButtons primaryLabel="Solicitar demo" primaryHref="/contacto?motivo=demo" />
          </div>
        </div>

        {/* Diagrama de flujo */}
        <div className="mx-auto mt-16 max-w-4xl">
          <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-stretch">
            {FLOW.map((node, i) => (
              <React.Fragment key={node.label}>
                <div className="flex flex-1 flex-col items-center gap-3 rounded-2xl border border-neutral-200/80 bg-white p-5 text-center shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
                  <NodeIcon icon={node.icon} brand={node.brand} />
                  <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                    {node.label}
                  </span>
                </div>
                {i < FLOW.length - 1 && (
                  <div className="flex items-center justify-center text-brand-400">
                    <ArrowRight className="hidden h-5 w-5 shrink-0 md:block" />
                    <ArrowDown className="h-5 w-5 shrink-0 md:hidden" />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function StepsSection() {
  return (
    <section className="relative border-t border-neutral-200/70 bg-neutral-50/60 py-20 sm:py-28 dark:border-white/5 dark:bg-neutral-950">
      <div className="mx-auto max-w-screen-xl px-5 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl dark:text-white">
            Del mensaje del cliente al{' '}
            <span className="bg-gradient-to-r from-brand-500 via-fuchsia-500 to-pink-500 bg-clip-text text-transparent">
              seguimiento organizado
            </span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg dark:text-neutral-300">
            Cada conversación sigue un flujo claro para que el negocio pueda responder rápido,
            mantener control y dar seguimiento desde un solo lugar.
          </p>
        </div>

        <ol className="mx-auto mt-14 max-w-3xl space-y-5">
          {STEPS.map((step, i) => (
            <li
              key={step.title}
              className="relative flex gap-5 rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-sm transition-all hover:border-brand-300 hover:shadow-lg hover:shadow-brand-500/10 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-brand-400/40"
            >
              <div className="flex flex-col items-center">
                <IconBadge icon={step.icon} />
                {i < STEPS.length - 1 && (
                  <span className="mt-3 hidden w-px flex-1 bg-gradient-to-b from-brand-300/60 to-transparent sm:block" />
                )}
              </div>
              <div className="pt-0.5">
                <span className="text-xs font-bold uppercase tracking-wider text-brand-500">
                  Paso {i + 1}
                </span>
                <h3 className="mt-1.5 text-lg font-semibold text-neutral-900 dark:text-white">
                  {step.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                  {step.description}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function AgentCapabilitiesSection() {
  return (
    <section className="relative bg-white py-20 sm:py-28 dark:bg-neutral-950">
      <div className="mx-auto max-w-screen-xl px-5 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <SectionBadge>Capacidades del agente</SectionBadge>
          <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl dark:text-white">
            Tu agente puede hacer más que{' '}
            <span className="bg-gradient-to-r from-brand-500 via-fuchsia-500 to-pink-500 bg-clip-text text-transparent">
              responder preguntas frecuentes
            </span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg dark:text-neutral-300">
            El agente IA trabaja con la información configurada del negocio para atender, clasificar y
            preparar solicitudes de manera más ordenada.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((cap) => (
            <FeatureCard key={cap.title} {...cap} />
          ))}
        </div>
      </div>
    </section>
  )
}

function ConfigSection() {
  return (
    <section className="relative border-t border-neutral-200/70 bg-neutral-50/60 py-20 sm:py-28 dark:border-white/5 dark:bg-neutral-950">
      <div className="mx-auto max-w-screen-xl px-5 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <SectionBadge>Configuración</SectionBadge>
          <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl dark:text-white">
            Tu agente responde según la{' '}
            <span className="bg-gradient-to-r from-brand-500 via-fuchsia-500 to-pink-500 bg-clip-text text-transparent">
              información de tu empresa
            </span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg dark:text-neutral-300">
            Configura datos clave para que las respuestas sean útiles, consistentes y adaptadas a tu
            operación.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {CONFIG_CARDS.map((card) => (
            <FeatureCard key={card.title} {...card} />
          ))}
        </div>

        {/* Aclaración catálogo / documento */}
        <p className="mx-auto mt-8 max-w-3xl rounded-2xl border border-brand-500/20 bg-brand-500/[0.04] px-6 py-4 text-center text-sm leading-relaxed text-neutral-600 dark:border-brand-400/20 dark:bg-brand-400/[0.05] dark:text-neutral-300">
          En configuraciones básicas, el catálogo o documento sirve como fuente de información para la
          IA. Para manejo más estructurado o masivo de productos y servicios, se puede usar una
          sección de catálogo dedicada según el plan.
        </p>
      </div>
    </section>
  )
}

function HumanControlSection() {
  return (
    <section className="relative overflow-hidden bg-neutral-950 py-20 text-neutral-100 sm:py-28">
      <div className="pointer-events-none absolute -left-20 top-0 h-[26rem] w-[26rem] rounded-full bg-brand-600/20 blur-[140px]" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-[24rem] w-[24rem] rounded-full bg-fuchsia-600/10 blur-[150px]" />

      <div className="relative mx-auto max-w-screen-xl px-5 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-400/25 bg-brand-400/10 px-4 py-1.5 text-xs font-medium text-brand-200 backdrop-blur-sm">
            <ShieldCheck className="h-3.5 w-3.5" />
            Control humano
          </span>
          <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            La IA atiende, pero tu equipo{' '}
            <span className="bg-gradient-to-r from-brand-400 via-fuchsia-400 to-pink-400 bg-clip-text text-transparent">
              mantiene el control
            </span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-neutral-300 sm:text-lg">
            La plataforma está diseñada para automatizar sin quitarle al negocio la posibilidad de
            intervenir cuando una conversación requiere criterio humano.
          </p>
        </div>

        <div className="mx-auto mt-14 grid max-w-4xl grid-cols-1 gap-5 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-7 backdrop-blur-sm">
            <div className="mb-5 flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-brand-400/20 bg-brand-400/10 text-brand-300">
                <Bot className="h-5 w-5" />
              </span>
              <h3 className="text-lg font-semibold text-white">Cuando responde la IA</h3>
            </div>
            <ul className="space-y-3">
              {IA_ITEMS.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-neutral-300">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand-300" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-brand-400/30 bg-brand-400/[0.06] p-7 backdrop-blur-sm">
            <div className="mb-5 flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-brand-400/30 bg-brand-400/15 text-brand-200">
                <UserRound className="h-5 w-5" />
              </span>
              <h3 className="text-lg font-semibold text-white">Cuando interviene el equipo</h3>
            </div>
            <ul className="space-y-3">
              {HUMAN_ITEMS.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-neutral-200">
                  <Handshake className="mt-0.5 h-4 w-4 shrink-0 text-brand-200" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

function BusinessFlowsSection() {
  return (
    <section className="relative bg-white py-20 sm:py-28 dark:bg-neutral-950">
      <div className="mx-auto max-w-screen-xl px-5 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl dark:text-white">
            Flujos adaptados al{' '}
            <span className="bg-gradient-to-r from-brand-500 via-fuchsia-500 to-pink-500 bg-clip-text text-transparent">
              tipo de negocio
            </span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg dark:text-neutral-300">
            No todos los negocios atienden igual. La plataforma puede adaptarse a diferentes formas de
            vender, coordinar o responder por WhatsApp.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {BUSINESS_FLOWS.map((flow) => (
            <FeatureCard key={flow.title} {...flow} />
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
              ¿Quieres ver este flujo{' '}
              <span className="bg-gradient-to-r from-brand-400 via-fuchsia-400 to-pink-400 bg-clip-text text-transparent">
                aplicado a tu negocio?
              </span>
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-neutral-300 sm:text-lg">
              Podemos mostrarte cómo un agente IA puede responder clientes, escuchar audios, tomar
              solicitudes, preparar cotizaciones, manejar citas y permitir intervención humana según
              tu operación.
            </p>
            <div className="mt-9 flex justify-center">
              <CtaButtons primaryLabel="Solicitar demo" primaryHref="/contacto?motivo=demo" />
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

export default function ComoFuncionaPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <Navbar />
      <main>
        <PageHero />
        <StepsSection />
        <AgentCapabilitiesSection />
        <ConfigSection />
        <HumanControlSection />
        <BusinessFlowsSection />
        <PageCTA />
      </main>
      <Footer />
    </div>
  )
}
