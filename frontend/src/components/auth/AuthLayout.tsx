import { ReactNode } from 'react'
import { MessageSquare, Bot, CalendarDays, FileText } from 'lucide-react'
import { SendwaryWordmark, SendwaryLogo } from '../BrandLogo'
import { AuthHeroBackground } from '../ui/background-snippets'

const heroFeatures = [
  { icon: <MessageSquare className="h-4 w-4" />, text: 'Responde a tus clientes 24/7 por WhatsApp' },
  { icon: <Bot className="h-4 w-4" />, text: 'Agentes IA entrenados con tu negocio' },
  { icon: <CalendarDays className="h-4 w-4" />, text: 'Agenda citas y da seguimiento automático' },
  { icon: <FileText className="h-4 w-4" />, text: 'Genera cotizaciones en segundos' },
]

/**
 * Layout compartido de login/registro: formulario a la izquierda y hero de
 * marca a la derecha (solo desktop). En mobile es una sola columna sin
 * scroll horizontal.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex bg-white">
      {/* Columna del formulario */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 flex items-center justify-center px-4 sm:px-8 py-10">
          <div className="w-full max-w-sm">
            <div className="mb-8">
              <SendwaryWordmark />
            </div>
            {children}
          </div>
        </div>
        <p className="text-center text-xs text-slate-400 pb-6 px-4">
          © {new Date().getFullYear()} Sendwary · Agentes IA para WhatsApp Business
        </p>
      </div>

      {/* Hero de marca (solo desktop) */}
      <div className="hidden lg:flex w-[45%] xl:w-1/2 relative overflow-hidden isolate">
        <AuthHeroBackground />

        <div className="relative z-10 flex flex-col justify-center px-12 xl:px-16 py-12 w-full">
          <SendwaryLogo className="h-14 xl:h-16 self-start" />
          <h2 className="mt-10 text-3xl xl:text-4xl font-bold text-white leading-tight max-w-md">
            Tu negocio atendiendo por WhatsApp, sin detenerse.
          </h2>
          <p className="mt-4 text-white/75 text-sm xl:text-base max-w-md">
            Automatiza la atención, ventas y citas de tu negocio con agentes IA que trabajan por ti.
          </p>
          <ul className="mt-8 space-y-3">
            {heroFeatures.map(f => (
              <li key={f.text} className="flex items-center gap-3 text-sm text-white/80">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 border border-white/10 text-white flex-shrink-0">
                  {f.icon}
                </span>
                {f.text}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
