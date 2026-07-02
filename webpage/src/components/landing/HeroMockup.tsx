import {
  Bot,
  Check,
  CheckCheck,
  LayoutDashboard,
  MessagesSquare,
  Settings2,
  Sparkles,
  Users,
} from 'lucide-react'

/**
 * Mockup del panel de control (HTML/Tailwind, sin imágenes externas).
 * Representa una conversación tipo WhatsApp atendida por un agente IA,
 * con métricas y control de intervención humana.
 */
export function HeroMockup() {
  return (
    <div className="relative rounded-2xl border border-neutral-200 bg-white/80 p-2 shadow-2xl shadow-brand-900/10 backdrop-blur-sm dark:border-white/10 dark:bg-neutral-900/70 dark:shadow-black/40">
      <div className="overflow-hidden rounded-xl border border-neutral-200/70 dark:border-white/5">
        {/* Barra superior tipo ventana */}
        <div className="flex items-center gap-2 border-b border-neutral-200/70 bg-neutral-50 px-4 py-2.5 dark:border-white/5 dark:bg-neutral-900">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
          <span className="ml-3 text-xs font-medium text-neutral-400">
            panel.tuempresa.com
          </span>
        </div>

        <div className="grid grid-cols-12">
          {/* Sidebar */}
          <aside className="col-span-2 hidden flex-col gap-1 border-r border-neutral-200/70 bg-neutral-50/70 p-3 md:flex dark:border-white/5 dark:bg-neutral-900/60">
            <div className="mb-2 flex items-center gap-2 px-1">
              <div className="grid h-7 w-7 place-items-center rounded-lg bg-brand-600 text-white">
                <Sparkles className="h-4 w-4" />
              </div>
              <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                Sendwary
              </span>
            </div>
            <NavItem icon={<LayoutDashboard className="h-4 w-4" />} label="Dashboard" />
            <NavItem icon={<MessagesSquare className="h-4 w-4" />} label="Conversaciones" active />
            <NavItem icon={<Bot className="h-4 w-4" />} label="Agentes IA" />
            <NavItem icon={<Users className="h-4 w-4" />} label="Empresa" />
            <NavItem icon={<Settings2 className="h-4 w-4" />} label="Cuenta" />
          </aside>

          {/* Contenido */}
          <div className="col-span-12 md:col-span-10">
            {/* Métricas */}
            <div className="grid grid-cols-3 gap-3 border-b border-neutral-200/70 p-4 dark:border-white/5">
              <Metric value="1.248" label="Mensajes atendidos" trend="+18%" />
              <Metric value="42 s" label="Tiempo de respuesta" trend="-63%" />
              <Metric value="97%" label="Resueltos por IA" trend="+9%" />
            </div>

            {/* Conversación */}
            <div className="grid grid-cols-12">
              {/* Lista de chats */}
              <div className="col-span-4 hidden border-r border-neutral-200/70 p-2 lg:block dark:border-white/5">
                <ChatItem name="María · Salón Bella" preview="¿Tienen cita el sábado?" active unread={2} />
                <ChatItem name="Taller RuedaFix" preview="Necesito presupuesto…" />
                <ChatItem name="Ferretería El Tornillo" preview="¿Precio del taladro?" />
                <ChatItem name="Clínica Vida" preview="Confirmo mi cita ✅" />
              </div>

              {/* Hilo */}
              <div className="col-span-12 lg:col-span-8">
                <div className="flex items-center justify-between border-b border-neutral-200/70 px-4 py-3 dark:border-white/5">
                  <div className="flex items-center gap-2.5">
                    <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-fuchsia-500 text-xs font-semibold text-white">
                      MS
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                        María · Salón Bella
                      </p>
                      <p className="text-[11px] text-emerald-500">en línea</p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/10 px-2.5 py-1 text-[11px] font-medium text-brand-600 dark:text-brand-300">
                    <Bot className="h-3.5 w-3.5" />
                    IA activa
                  </span>
                </div>

                {/* Mensajes */}
                <div className="space-y-3 bg-neutral-50/60 px-4 py-5 dark:bg-neutral-950/40">
                  <Bubble side="in">Hola, ¿tienen cita disponible para corte el sábado?</Bubble>
                  <Bubble side="out" ai>
                    ¡Hola María! 👋 Sí, tenemos disponibilidad el sábado a las 10:00, 12:30 y 16:00.
                    ¿Cuál te viene mejor?
                  </Bubble>
                  <Bubble side="in">A las 12:30 perfecto.</Bubble>
                  <Bubble side="out" ai>
                    Listo ✨ Te reservé el sábado a las 12:30 con corte y peinado. Te enviaré un
                    recordatorio un día antes. ¿Algo más en lo que te ayude?
                  </Bubble>
                </div>

                {/* Barra de control humano */}
                <div className="flex items-center justify-between gap-3 border-t border-neutral-200/70 bg-white px-4 py-3 dark:border-white/5 dark:bg-neutral-900">
                  <div className="flex flex-1 items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-xs text-neutral-400 dark:border-white/10">
                    Escribe para intervenir…
                  </div>
                  <button className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-2 text-xs font-semibold text-white dark:bg-white dark:text-neutral-900">
                    Tomar conversación
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function NavItem({
  icon,
  label,
  active = false,
}: {
  icon: React.ReactNode
  label: string
  active?: boolean
}) {
  return (
    <div
      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium ${
        active
          ? 'bg-brand-500/10 text-brand-700 dark:text-brand-200'
          : 'text-neutral-500 dark:text-neutral-400'
      }`}
    >
      {icon}
      {label}
    </div>
  )
}

function Metric({ value, label, trend }: { value: string; label: string; trend: string }) {
  return (
    <div className="rounded-xl border border-neutral-200/70 bg-white p-3 dark:border-white/5 dark:bg-neutral-900/60">
      <div className="flex items-baseline justify-between">
        <span className="text-lg font-bold text-neutral-900 dark:text-white">{value}</span>
        <span className="text-[11px] font-semibold text-emerald-500">{trend}</span>
      </div>
      <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">{label}</p>
    </div>
  )
}

function ChatItem({
  name,
  preview,
  active = false,
  unread,
}: {
  name: string
  preview: string
  active?: boolean
  unread?: number
}) {
  return (
    <div
      className={`mb-1 flex items-center gap-2.5 rounded-lg px-2.5 py-2 ${
        active ? 'bg-brand-500/10' : ''
      }`}
    >
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-neutral-200 text-[11px] font-semibold text-neutral-600 dark:bg-neutral-700 dark:text-neutral-200">
        {name.slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-neutral-800 dark:text-neutral-100">
          {name}
        </p>
        <p className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">{preview}</p>
      </div>
      {unread ? (
        <span className="grid h-4 min-w-4 place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
          {unread}
        </span>
      ) : null}
    </div>
  )
}

function Bubble({
  side,
  ai = false,
  children,
}: {
  side: 'in' | 'out'
  ai?: boolean
  children: React.ReactNode
}) {
  const isOut = side === 'out'
  return (
    <div className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed shadow-sm ${
          isOut
            ? 'rounded-br-sm bg-brand-600 text-white'
            : 'rounded-bl-sm bg-white text-neutral-700 dark:bg-neutral-800 dark:text-neutral-100'
        }`}
      >
        {ai && (
          <span className="mb-1 flex items-center gap-1 text-[10px] font-semibold text-white/80">
            <Bot className="h-3 w-3" /> Agente IA
          </span>
        )}
        {children}
        {isOut && (
          <span className="mt-1 flex items-center justify-end gap-0.5 text-[10px] text-white/70">
            12:31 <CheckCheck className="h-3 w-3" />
          </span>
        )}
        {!isOut && (
          <span className="mt-1 flex items-center justify-end gap-0.5 text-[10px] text-neutral-400">
            12:30 <Check className="h-3 w-3" />
          </span>
        )}
      </div>
    </div>
  )
}
