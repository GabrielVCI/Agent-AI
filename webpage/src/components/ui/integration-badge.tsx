import * as React from 'react'
import { cn } from '@/lib/utils'
import { BrandIcon, type BrandName } from '@/components/ui/brand-icon'

interface IntegrationBadgeProps {
  label: string
  /** Marca reconocible → muestra su logo real (con color oficial). */
  brand?: BrandName
  /** Icono genérico (lucide) para sistemas sin marca específica. */
  icon?: React.ReactNode
  className?: string
}

/**
 * Chip de integración. Usa logo de marca cuando `brand` está presente;
 * si no, un icono genérico opcional. El nombre siempre aparece en texto.
 */
export function IntegrationBadge({ label, brand, icon, className }: IntegrationBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium',
        'border-neutral-200 bg-neutral-50 text-neutral-700 transition-colors',
        'dark:border-white/10 dark:bg-white/5 dark:text-neutral-300',
        className,
      )}
    >
      {brand ? (
        <BrandIcon name={brand} colored className="h-4 w-4 shrink-0" />
      ) : icon ? (
        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-brand-500 dark:text-brand-300">
          {icon}
        </span>
      ) : null}
      {label}
    </span>
  )
}
