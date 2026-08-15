/**
 * Opciones, tipos y validación del formulario de lista de espera (/precios).
 * Reutilizado por WaitlistModal y como contrato con Web3Forms.
 */

export type PlanLevel = 'basico' | 'pro' | 'enterprise'

export const PLAN_LABELS: Record<PlanLevel, string> = {
  basico: 'Básico',
  pro: 'Pro',
  enterprise: 'Enterprise',
}

export interface WaitlistFormData {
  nombreEmpresa: string
  telefono: string
  email: string
  consentimiento: boolean
  /** Honeypot anti-bots (debe quedar vacío). */
  companyWebsite: string
}

export const initialWaitlistData: WaitlistFormData = {
  nombreEmpresa: '',
  telefono: '',
  email: '',
  consentimiento: false,
  companyWebsite: '',
}

export type WaitlistErrors = Partial<Record<keyof WaitlistFormData, string>>

/** Longitudes máximas permitidas por campo. */
export const WAITLIST_MAX = {
  nombreEmpresa: 120,
  telefono: 40,
  email: 160,
} as const

/** Validación en frontend. Devuelve un mapa de errores por campo (vacío = válido). */
export function validateWaitlist(data: WaitlistFormData): WaitlistErrors {
  const errors: WaitlistErrors = {}

  if (!data.nombreEmpresa.trim())
    errors.nombreEmpresa = 'Ingresa el nombre de tu empresa o el tuyo.'
  else if (data.nombreEmpresa.trim().length > WAITLIST_MAX.nombreEmpresa)
    errors.nombreEmpresa = `Máximo ${WAITLIST_MAX.nombreEmpresa} caracteres.`

  if (!data.telefono.trim()) errors.telefono = 'Ingresa un teléfono o WhatsApp de contacto.'
  else if (data.telefono.trim().length > WAITLIST_MAX.telefono)
    errors.telefono = `Máximo ${WAITLIST_MAX.telefono} caracteres.`

  if (data.email.trim()) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) errors.email = 'Ingresa un correo válido.'
    else if (data.email.trim().length > WAITLIST_MAX.email)
      errors.email = `Máximo ${WAITLIST_MAX.email} caracteres.`
  }

  if (!data.consentimiento) errors.consentimiento = 'Debes aceptar para poder continuar.'

  return errors
}
