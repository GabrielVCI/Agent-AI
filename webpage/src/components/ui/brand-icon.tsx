import type { IconType } from 'react-icons'
import {
  SiWhatsapp,
  SiOdoo,
  SiSap,
  SiQuickbooks,
  SiGooglesheets,
  SiMeta,
} from 'react-icons/si'
import { Boxes } from 'lucide-react'

/**
 * Logos de marca reales (Simple Icons vía react-icons).
 * Los glifos son monocromos y heredan `currentColor` por defecto; con
 * `colored` se aplica el color oficial de la marca. Siempre decorativos
 * (`aria-hidden`): el nombre de la marca acompaña en texto.
 */

export type BrandName =
  | 'whatsapp'
  | 'odoo'
  | 'sap'
  | 'quickbooks'
  | 'google-sheets'
  | 'openai'
  | 'meta'

interface BrandDef {
  Icon: IconType
  color: string
  label: string
}

// OpenAI no está disponible en react-icons/si → usa el fallback seguro.
const REGISTRY: Partial<Record<BrandName, BrandDef>> = {
  whatsapp: { Icon: SiWhatsapp, color: '#25D366', label: 'WhatsApp' },
  odoo: { Icon: SiOdoo, color: '#714B67', label: 'Odoo' },
  sap: { Icon: SiSap, color: '#0FAAFF', label: 'SAP' },
  quickbooks: { Icon: SiQuickbooks, color: '#2CA01C', label: 'QuickBooks' },
  'google-sheets': { Icon: SiGooglesheets, color: '#0F9D58', label: 'Google Sheets' },
  meta: { Icon: SiMeta, color: '#0081FB', label: 'Meta' },
}

interface BrandIconProps {
  name: BrandName
  className?: string
  /** Aplica el color oficial de la marca (por defecto hereda currentColor). */
  colored?: boolean
  /** Si el logo no existe, muestra un icono genérico en lugar de nada. */
  showFallback?: boolean
}

export function BrandIcon({ name, className, colored = false, showFallback = true }: BrandIconProps) {
  const brand = REGISTRY[name]

  if (!brand) {
    return showFallback ? <Boxes className={className} aria-hidden="true" /> : null
  }

  const { Icon, color, label } = brand
  return (
    <Icon
      className={className}
      style={colored ? { color } : undefined}
      aria-hidden="true"
      title={label}
    />
  )
}
