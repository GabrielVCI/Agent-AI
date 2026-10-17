import { Sparkles, X } from 'lucide-react'
import Badge from '../ui/Badge'
import {
  managedByLabel,
  type CustomerCategoryColor,
  type CustomerCategoryType,
} from '../../services/customerCategoriesApi'

/**
 * Insignia de categoría de cliente (Módulo 2).
 *
 * El color viene del backend dentro de una paleta CERRADA, así que se mapea a
 * la variante del design system en vez de interpolarlo en una clase de
 * Tailwind (una clase generada al vuelo ni siquiera existiría en el CSS, y un
 * valor libre del servidor no debe llegar a `className`).
 *
 * Las automáticas llevan la chispa: se reconocen de un vistazo y el tooltip
 * explica quién las mantiene, en vez de dejar al usuario preguntándose por qué
 * no puede quitarlas.
 */
type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple'

const VARIANTS: Record<string, BadgeVariant> = {
  purple: 'purple',
  info: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  default: 'default',
}

export function badgeVariantFor(color: string): BadgeVariant {
  return VARIANTS[color] ?? 'purple'
}

interface Props {
  category: {
    id: string
    name: string
    color: string
    type: CustomerCategoryType
    managedBy?: string | null
  }
  /** Muestra la X para quitarla. Solo tiene sentido en categorías manuales. */
  onRemove?: () => void
  removing?: boolean
}

export default function CategoryBadge({ category, onRemove, removing = false }: Props) {
  const automatic = category.type === 'AUTOMATIC'
  const hint = managedByLabel(category)

  return (
    <Badge variant={badgeVariantFor(category.color)} className="gap-1">
      {automatic && (
        <Sparkles
          className="h-3 w-3 flex-shrink-0"
          aria-label="Categoría automática"
        />
      )}
      <span title={hint ?? undefined}>{category.name}</span>
      {onRemove && !automatic && (
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          title={`Quitar ${category.name}`}
          aria-label={`Quitar ${category.name}`}
          className="ml-0.5 -mr-1 rounded-full p-0.5 opacity-60 hover:opacity-100 hover:bg-black/10 transition disabled:opacity-30"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </Badge>
  )
}

/** Etiqueta de tipo para tablas y formularios. */
export function CategoryTypeBadge({ type }: { type: CustomerCategoryType }) {
  if (type === 'AUTOMATIC') {
    return (
      <Badge variant="info" className="gap-1">
        <Sparkles className="h-3 w-3" />
        Automática
      </Badge>
    )
  }
  return <Badge variant="default">Manual</Badge>
}

/** Punto de color para el selector del formulario. */
export function ColorDot({ color }: { color: CustomerCategoryColor | string }) {
  const dots: Record<string, string> = {
    purple: 'bg-purple-500',
    info: 'bg-blue-500',
    success: 'bg-green-500',
    warning: 'bg-amber-500',
    danger: 'bg-red-500',
    default: 'bg-slate-400',
  }
  return <span className={`h-3 w-3 rounded-full ${dots[color] ?? dots.purple}`} />
}
