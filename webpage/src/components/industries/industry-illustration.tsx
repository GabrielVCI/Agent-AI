import {
  Sparkles,
  Stethoscope,
  Hammer,
  Wrench,
  Utensils,
  ShoppingBag,
  BriefcaseBusiness,
  CalendarCheck,
  CalendarClock,
  FileText,
  Car,
  Clock,
  Package,
  FileCheck,
  CheckCheck,
  BadgeCheck,
  type LucideIcon,
} from 'lucide-react'
import type { ChatExample, IndustryVisualType } from '@/data/industries'

/**
 * Ilustración de industria construida 100% con HTML + Tailwind (sin imágenes
 * externas). Combina un mockup de conversación tipo WhatsApp, una mini tarjeta
 * de registro del panel de Sendwary y chips propios del negocio.
 *
 * Se adapta por `visual` (icono/encabezado y tipo de tarjeta), por `chat`
 * (conversación real de la industria) y por `tags` (servicios/productos).
 * Es puramente decorativa: el contenido importante vive como texto en la página.
 */

interface CardRow {
  label: string
  value: string
}

interface VisualConfig {
  /** Icono del avatar/encabezado del chat. */
  headerIcon: LucideIcon
  /** Icono de la mini tarjeta de registro. */
  cardIcon: LucideIcon
  cardTitle: string
  statusLabel: string
  rows: (tags: string[]) => CardRow[]
}

const tag = (tags: string[], i: number, fallback: string) => tags[i] ?? fallback

const VISUAL_CONFIG: Record<IndustryVisualType, VisualConfig> = {
  beauty: {
    headerIcon: Sparkles,
    cardIcon: CalendarCheck,
    cardTitle: 'Cita agendada',
    statusLabel: 'Confirmada',
    rows: (t) => [
      { label: 'Servicio', value: tag(t, 0, 'Servicio') },
      { label: 'Horario', value: 'Mañana · 10:30' },
    ],
  },
  health: {
    headerIcon: Stethoscope,
    cardIcon: CalendarClock,
    cardTitle: 'Solicitud de consulta',
    statusLabel: 'En revisión',
    rows: (t) => [
      { label: 'Motivo', value: tag(t, 0, 'Consulta') },
      { label: 'Horario', value: 'Esta semana' },
    ],
  },
  hardware: {
    headerIcon: Hammer,
    cardIcon: FileText,
    cardTitle: 'Solicitud de cotización',
    statusLabel: 'Pendiente',
    rows: (t) => [
      { label: 'Producto', value: tag(t, 0, 'Producto') },
      { label: 'Cantidad', value: 'Por confirmar' },
    ],
  },
  automotive: {
    headerIcon: Wrench,
    cardIcon: Car,
    cardTitle: 'Solicitud de servicio',
    statusLabel: 'En revisión',
    rows: (t) => [
      { label: 'Vehículo', value: 'Corolla 2014' },
      { label: 'Detalle', value: tag(t, 1, tag(t, 0, 'Servicio')) },
    ],
  },
  food: {
    headerIcon: Utensils,
    cardIcon: Clock,
    cardTitle: 'Pedido / reserva',
    statusLabel: 'Recibido',
    rows: (t) => [
      { label: 'Detalle', value: tag(t, 0, 'Pedido') },
      { label: 'Hora', value: 'Hoy · 1:00 pm' },
    ],
  },
  retail: {
    headerIcon: ShoppingBag,
    cardIcon: Package,
    cardTitle: 'Consulta de producto',
    statusLabel: 'Atendido',
    rows: (t) => [
      { label: 'Producto', value: tag(t, 0, 'Producto') },
      { label: 'Disponibilidad', value: 'Por confirmar' },
    ],
  },
  professional: {
    headerIcon: BriefcaseBusiness,
    cardIcon: FileCheck,
    cardTitle: 'Nueva solicitud',
    statusLabel: 'Nuevo lead',
    rows: (t) => [
      { label: 'Servicio', value: tag(t, 0, 'Servicio') },
      { label: 'Contacto', value: 'Capturado' },
    ],
  },
}

export function IndustryIllustration({
  visual,
  chat,
  tags,
}: {
  visual: IndustryVisualType
  chat: ChatExample
  tags: string[]
}) {
  const config = VISUAL_CONFIG[visual]
  const HeaderIcon = config.headerIcon
  const CardIcon = config.cardIcon
  const rows = config.rows(tags)

  return (
    <div className="relative mx-auto w-full max-w-md" aria-hidden="true">
      {/* Glow de fondo */}
      <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] bg-brand-600/20 blur-3xl" />

      {/* Tarjeta principal: mockup de conversación */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-neutral-900 shadow-2xl shadow-black/40 ring-1 ring-black/5">
        {/* Encabezado tipo WhatsApp */}
        <div className="flex items-center gap-3 border-b border-white/10 bg-white/[0.03] px-4 py-3">
          <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white">
            <HeaderIcon className="h-5 w-5" strokeWidth={1.75} />
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-neutral-900 bg-emerald-400" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">Agente IA · Sendwary</p>
            <p className="text-xs text-emerald-400">en línea</p>
          </div>
        </div>

        {/* Cuerpo de conversación */}
        <div className="space-y-3 px-4 py-5">
          {/* Mensaje del cliente */}
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-white/[0.06] px-3.5 py-2.5 text-sm text-neutral-200">
              {chat.client}
            </div>
          </div>
          {/* Respuesta del agente IA */}
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-brand-600 px-3.5 py-2.5 text-sm text-white">
              {chat.agent}
              <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-brand-100/80">
                10:24
                <CheckCheck className="h-3 w-3" />
              </span>
            </div>
          </div>

          {/* Mini tarjeta de registro (panel Sendwary) */}
          <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-brand-400/25 bg-brand-400/10 text-brand-200">
                <CardIcon className="h-4 w-4" strokeWidth={1.75} />
              </span>
              <span className="text-xs font-semibold text-white">{config.cardTitle}</span>
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {config.statusLabel}
              </span>
            </div>
            <dl className="mt-3 space-y-1.5">
              {rows.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-3 text-xs">
                  <dt className="text-neutral-400">{row.label}</dt>
                  <dd className="truncate font-medium text-neutral-200">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Chips del negocio */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {tags.map((t) => (
              <span
                key={t}
                className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-neutral-300"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Chip flotante: métrica del panel */}
      <div className="absolute -right-3 -top-4 hidden rotate-2 items-center gap-2 rounded-xl border border-white/10 bg-neutral-950/90 px-3 py-2 shadow-xl shadow-black/40 backdrop-blur-sm sm:flex">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500/15 text-brand-300">
          <BadgeCheck className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <div className="leading-tight">
          <p className="text-[10px] text-neutral-400">Sin responder</p>
          <p className="text-xs font-bold text-white">0 mensajes</p>
        </div>
      </div>
    </div>
  )
}
