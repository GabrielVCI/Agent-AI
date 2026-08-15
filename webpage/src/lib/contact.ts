/**
 * Opciones, tipos y validación del formulario de contacto.
 * Reutilizado por ContactForm y como contrato con Web3Forms.
 */

export interface ContactFormData {
  nombre: string
  email: string
  telefono: string
  negocio: string
  tipoNegocio: string
  motivo: string
  plan: string
  volumen: string
  sistemaActual: string
  sitioWeb: string
  mensaje: string
  consentimiento: boolean
  /** Honeypot anti-bots (debe quedar vacío). */
  companyWebsite: string
}

export const TIPOS_NEGOCIO = [
  'Salón de belleza / peluquería',
  'Clínica / consultorio',
  'Spa / centro estético',
  'Ferretería',
  'Repuestos',
  'Taller',
  'Restaurante',
  'Tienda',
  'Servicios profesionales',
  'Otro',
] as const

export const MOTIVOS = [
  'Solicitar demo',
  'Consultar precios',
  'Evaluar integración',
  'Elegir plan recomendado',
  'Soporte comercial',
  'Otro',
] as const

export const PLANES = ['No estoy seguro', 'Básico', 'Pro', 'Enterprise'] as const

export const VOLUMENES = [
  'Menos de 1,500 al mes',
  '1,500 a 3,000 al mes',
  '3,000 a 6,000 al mes',
  '6,000 a 10,000 al mes',
  'Más de 10,000 al mes',
  'No estoy seguro',
] as const

/** Mapa de query params (?plan=, ?tipo=, ?motivo=) a valores del formulario. */
export const PLAN_PARAM_MAP: Record<string, string> = {
  basico: 'Básico',
  pro: 'Pro',
  enterprise: 'Enterprise',
}

export const MOTIVO_PARAM_MAP: Record<string, string> = {
  demo: 'Solicitar demo',
  recomendacion: 'Elegir plan recomendado',
  precios: 'Consultar precios',
  integracion: 'Evaluar integración',
}

export const initialContactData: ContactFormData = {
  nombre: '',
  email: '',
  telefono: '',
  negocio: '',
  tipoNegocio: '',
  motivo: '',
  plan: '',
  volumen: '',
  sistemaActual: '',
  sitioWeb: '',
  mensaje: '',
  consentimiento: false,
  companyWebsite: '',
}

export type ContactErrors = Partial<Record<keyof ContactFormData, string>>

/** Longitudes máximas permitidas por campo. */
export const CONTACT_MAX = {
  nombre: 120,
  telefono: 40,
  email: 160,
  negocio: 120,
  sistemaActual: 120,
  mensaje: 1500,
} as const

/** Validación en frontend. Devuelve un mapa de errores por campo (vacío = válido). */
export function validateContact(data: ContactFormData): ContactErrors {
  const errors: ContactErrors = {}

  if (!data.nombre.trim()) errors.nombre = 'Ingresa tu nombre completo.'
  else if (data.nombre.trim().length > CONTACT_MAX.nombre)
    errors.nombre = `Máximo ${CONTACT_MAX.nombre} caracteres.`

  if (!data.email.trim()) errors.email = 'Ingresa tu correo electrónico.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim()))
    errors.email = 'Ingresa un correo válido.'
  else if (data.email.trim().length > CONTACT_MAX.email)
    errors.email = `Máximo ${CONTACT_MAX.email} caracteres.`

  if (!data.telefono.trim()) errors.telefono = 'Ingresa un teléfono o WhatsApp.'
  else if (data.telefono.trim().length > CONTACT_MAX.telefono)
    errors.telefono = `Máximo ${CONTACT_MAX.telefono} caracteres.`

  if (!data.negocio.trim()) errors.negocio = 'Ingresa el nombre de tu negocio.'
  else if (data.negocio.trim().length > CONTACT_MAX.negocio)
    errors.negocio = `Máximo ${CONTACT_MAX.negocio} caracteres.`

  if (!data.tipoNegocio) errors.tipoNegocio = 'Selecciona el tipo de negocio.'
  if (!data.motivo) errors.motivo = 'Selecciona un motivo de contacto.'

  if (data.sistemaActual.trim().length > CONTACT_MAX.sistemaActual)
    errors.sistemaActual = `Máximo ${CONTACT_MAX.sistemaActual} caracteres.`

  if (data.mensaje.trim().length < 10)
    errors.mensaje = 'Cuéntanos un poco más (mínimo 10 caracteres).'
  else if (data.mensaje.trim().length > CONTACT_MAX.mensaje)
    errors.mensaje = `Máximo ${CONTACT_MAX.mensaje} caracteres.`

  if (!data.consentimiento) errors.consentimiento = 'Debes aceptar para poder continuar.'

  return errors
}
