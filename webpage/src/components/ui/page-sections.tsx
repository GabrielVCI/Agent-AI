import * as React from 'react'
import { ArrowRight, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Primitivas visuales compartidas entre páginas internas
 * (homepage, /como-funciona, /integraciones…) para mantener coherencia.
 */

/* -------------------------------------------------------------------------- */
/*  Badge de sección (variante clara).                                         */
/* -------------------------------------------------------------------------- */

export function SectionBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-4 py-1.5 text-xs font-medium text-brand-700 backdrop-blur-sm dark:border-brand-400/20 dark:bg-brand-400/10 dark:text-brand-200">
      {children}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/*  Contenedor de icono con acento morado.                                     */
/* -------------------------------------------------------------------------- */

export function IconBadge({
  icon: Icon,
  tone = 'light',
}: {
  icon: LucideIcon
  /** `light` para fondos claros, `dark` para bandas oscuras. */
  tone?: 'light' | 'dark'
}) {
  return (
    <div
      className={cn(
        'inline-flex h-12 w-12 items-center justify-center rounded-xl border',
        tone === 'dark'
          ? 'border-brand-400/20 bg-brand-400/10 text-brand-300'
          : 'border-brand-500/20 bg-brand-500/10 text-brand-600 dark:border-brand-400/20 dark:bg-brand-400/10 dark:text-brand-300',
      )}
    >
      <Icon className="h-6 w-6" strokeWidth={1.75} />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Par de botones de conversión reutilizable.                                 */
/* -------------------------------------------------------------------------- */

interface CtaButtonsProps {
  primaryLabel: string
  primaryHref?: string
  secondaryLabel?: string
  secondaryHref?: string
  align?: 'center' | 'start'
}

export function CtaButtons({
  primaryLabel,
  primaryHref = '/contacto',
  secondaryLabel = 'Ver costos y precios',
  secondaryHref = '/precios',
  align = 'center',
}: CtaButtonsProps) {
  return (
    <div
      className={cn(
        'flex w-full flex-col gap-3 sm:w-auto sm:flex-row',
        align === 'center' ? 'items-center justify-center' : 'items-stretch sm:items-center',
      )}
    >
      <a
        href={primaryHref}
        className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/25 transition-all hover:bg-brand-500 hover:shadow-brand-500/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white sm:w-auto dark:focus-visible:ring-offset-neutral-950"
      >
        {primaryLabel}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </a>
      <a
        href={secondaryHref}
        className="inline-flex w-full items-center justify-center rounded-xl border border-neutral-300 bg-white/60 px-7 py-3.5 text-sm font-semibold text-neutral-800 backdrop-blur-sm transition-colors hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white sm:w-auto dark:border-white/10 dark:bg-white/5 dark:text-neutral-100 dark:hover:bg-white/10 dark:focus-visible:ring-offset-neutral-950"
      >
        {secondaryLabel}
      </a>
    </div>
  )
}
