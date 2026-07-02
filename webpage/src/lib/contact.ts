/**
 * Opciones, tipos y validación del formulario de contacto.
 * Reutilizado por ContactForm y como contrato con la Netlify Function.
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

/** Validación en frontend. Devuelve un mapa de errores por campo (vacío = válido). */
export function validateContact(data: ContactFormData): ContactErrors {
  const errors: ContactErrors = {}

  if (!data.nombre.trim()) errors.nombre = 'Ingresa tu nombre completo.'
  if (!data.email.trim()) errors.email = 'Ingresa tu correo electrónico.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim()))
    errors.email = 'Ingresa un correo válido.'
  if (!data.telefono.trim()) errors.telefono = 'Ingresa un teléfono o WhatsApp.'
  if (!data.negocio.trim()) errors.negocio = 'Ingresa el nombre de tu negocio.'
  if (!data.tipoNegocio) errors.tipoNegocio = 'Selecciona el tipo de negocio.'
  if (!data.motivo) errors.motivo = 'Selecciona un motivo de contacto.'
  if (data.mensaje.trim().length < 10)
    errors.mensaje = 'Cuéntanos un poco más (mínimo 10 caracteres).'
  if (!data.consentimiento) errors.consentimiento = 'Debes aceptar para poder continuar.'

  return errors
}
