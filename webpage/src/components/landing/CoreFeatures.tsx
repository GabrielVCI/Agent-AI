import { PhoneCall, PackageSearch, FileText, CalendarCheck, Mic, BarChart3, type LucideIcon } from 'lucide-react'
import { SectionBadge, IconBadge } from '@/components/ui/page-sections'

interface Feature {
  icon: LucideIcon
  title: string
  description: string
}

const FEATURES: Feature[] = [
  {
    icon: PhoneCall,
    title: 'Agentes por número',
    description:
      'Configura agentes IA asociados a números reales de WhatsApp para separar áreas, servicios o unidades del negocio.',
  },
  {
    icon: PackageSearch,
    title: 'Catálogo de productos o servicios',
    description:
      'Registra información manualmente o carga documentos para que la IA responda con datos útiles del negocio.',
  },
  {
    icon: FileText,
    title: 'Cotizaciones',
    description:
      'El agente puede tomar datos iniciales y ayudar a preparar solicitudes de cotización para seguimiento comercial.',
  },
  {
    icon: CalendarCheck,
    title: 'Citas y consultas',
    description:
      'Ideal para clínicas, spas, centros de belleza o servicios que coordinan horarios y solicitudes por WhatsApp.',
  },
  {
    icon: Mic,
    title: 'Audios de WhatsApp',
    description:
      'Permite manejar mejor clientes que envían notas de voz dentro del flujo de atención.',
  },
  {
    icon: BarChart3,
    title: 'Dashboard y reportes',
    description:
      'Visualiza actividad, conversaciones, solicitudes y métricas para entender mejor la atención del negocio.',
  },
]

export function CoreFeatures() {
  return (
    <section className="relative bg-white py-20 sm:py-28 dark:bg-neutral-950">
      <div className="mx-auto max-w-screen-xl px-5 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <SectionBadge>Más que respuestas automáticas</SectionBadge>
          <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl dark:text-white">
            Funciones pensadas para negocios que{' '}
            <span className="bg-gradient-to-r from-brand-500 via-fuchsia-500 to-pink-500 bg-clip-text text-transparent">
              atienden, venden y coordinan por WhatsApp
            </span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg dark:text-neutral-300">
            Configura agentes, organiza conversaciones, registra información comercial y permite que
            la IA ayude en tareas reales del día a día.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="group relative flex flex-col rounded-2xl border border-neutral-200/80 bg-white p-6 text-left shadow-sm transition-all hover:-translate-y-1 hover:border-brand-300 hover:shadow-lg hover:shadow-brand-500/10 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-brand-400/40"
            >
              <div className="mb-5">
                <IconBadge icon={feature.icon} />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-neutral-900 dark:text-white">
                {feature.title}
              </h3>
              <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
