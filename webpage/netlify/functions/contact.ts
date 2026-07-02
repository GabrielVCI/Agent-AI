import type { Handler } from '@netlify/functions'
import { Resend } from 'resend'

/* -------------------------------------------------------------------------- */
/*  Tipos y utilidades                                                         */
/* -------------------------------------------------------------------------- */

interface ContactPayload {
  nombre?: string
  email?: string
  telefono?: string
  negocio?: string
  tipoNegocio?: string
  motivo?: string
  plan?: string
  volumen?: string
  sistemaActual?: string
  sitioWeb?: string
  mensaje?: string
  consentimiento?: boolean
  origen?: string
  /** Honeypot anti-bots: si viene con contenido, es spam. */
  companyWebsite?: string
}

const MAX = { short: 200, medium: 500, long: 2000 }

/** Recorta, normaliza y limita la longitud de un texto. */
function clean(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

const json = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

/* -------------------------------------------------------------------------- */
/*  Handler                                                                    */
/* -------------------------------------------------------------------------- */

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Método no permitido.' })
  }

  let payload: ContactPayload
  try {
    payload = JSON.parse(event.body || '{}')
  } catch {
    return json(400, { ok: false, error: 'Solicitud inválida.' })
  }

  // Honeypot: éxito silencioso sin enviar (no revelamos la trampa al bot).
  if (clean(payload.companyWebsite, MAX.short)) {
    return json(200, { ok: true })
  }

  // Normalización + límites de longitud.
  const data = {
    nombre: clean(payload.nombre, MAX.short),
    email: clean(payload.email, MAX.short),
    telefono: clean(payload.telefono, MAX.short),
    negocio: clean(payload.negocio, MAX.short),
    tipoNegocio: clean(payload.tipoNegocio, MAX.short),
    motivo: clean(payload.motivo, MAX.short),
    plan: clean(payload.plan, MAX.short),
    volumen: clean(payload.volumen, MAX.short),
    sistemaActual: clean(payload.sistemaActual, MAX.medium),
    sitioWeb: clean(payload.sitioWeb, MAX.short),
    mensaje: clean(payload.mensaje, MAX.long),
    origen: clean(payload.origen, MAX.medium),
  }

  // Validación en servidor (no confiar solo en el frontend).
  const errores: string[] = []
  if (!data.nombre) errores.push('nombre')
  if (!data.email || !isEmail(data.email)) errores.push('email')
  if (!data.telefono) errores.push('telefono')
  if (!data.negocio) errores.push('negocio')
  if (!data.tipoNegocio) errores.push('tipoNegocio')
  if (!data.motivo) errores.push('motivo')
  if (data.mensaje.length < 10) errores.push('mensaje')
  if (payload.consentimiento !== true) errores.push('consentimiento')

  if (errores.length > 0) {
    return json(422, { ok: false, error: 'Revisa los campos del formulario.', campos: errores })
  }

  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.CONTACT_FROM_EMAIL
  const toEmail = process.env.CONTACT_TO_EMAIL
  const replyTo = process.env.CONTACT_REPLY_TO_EMAIL || data.email
  const siteName = process.env.CONTACT_SITE_NAME || 'La plataforma'

  if (!apiKey || !fromEmail || !toEmail) {
    // No exponemos detalles internos al cliente.
    console.error('[contact] Faltan variables de entorno de correo.')
    return json(500, { ok: false, error: 'Servicio de correo no configurado.' })
  }

  const fecha = new Date().toISOString()
  const row = (label: string, value: string) =>
    value
      ? `<tr><td style="padding:6px 12px;color:#6b7280;font-weight:600">${label}</td><td style="padding:6px 12px;color:#111827">${escapeHtml(value)}</td></tr>`
      : ''

  const html = `
    <div style="font-family:Inter,system-ui,sans-serif;max-width:640px">
      <h2 style="color:#6d28d9">Nueva solicitud desde la web</h2>
      <table style="border-collapse:collapse;width:100%">
        ${row('Nombre', data.nombre)}
        ${row('Email', data.email)}
        ${row('Teléfono / WhatsApp', data.telefono)}
        ${row('Negocio', data.negocio)}
        ${row('Tipo de negocio', data.tipoNegocio)}
        ${row('Motivo', data.motivo)}
        ${row('Plan de interés', data.plan)}
        ${row('Volumen de mensajes', data.volumen)}
        ${row('Sistema actual', data.sistemaActual)}
        ${row('Sitio web / redes', data.sitioWeb)}
        ${row('Origen', data.origen)}
        ${row('Fecha', fecha)}
      </table>
      <h3 style="color:#111827;margin-top:20px">Mensaje</h3>
      <p style="color:#374151;white-space:pre-wrap">${escapeHtml(data.mensaje)}</p>
    </div>`

  const resend = new Resend(apiKey)

  try {
    // Correo interno al negocio.
    const { error } = await resend.emails.send({
      from: `${siteName} <${fromEmail}>`,
      to: [toEmail],
      replyTo,
      subject: `Nueva solicitud desde la web - ${data.motivo}`,
      html,
    })

    if (error) {
      console.error('[contact] Error de Resend:', error.message)
      return json(502, { ok: false, error: 'No se pudo enviar la solicitud.' })
    }

    // Confirmación opcional al visitante (no bloquea la respuesta si falla).
    resend.emails
      .send({
        from: `${siteName} <${fromEmail}>`,
        to: [data.email],
        subject: 'Hemos recibido tu solicitud',
        html: `<div style="font-family:Inter,system-ui,sans-serif">
          <p>Hola ${escapeHtml(data.nombre)},</p>
          <p>Gracias por contactarnos. Revisaremos tu caso y te responderemos con una recomendación
          según tu negocio, volumen de mensajes y necesidades.</p>
          <p style="color:#6b7280">— Equipo de ${escapeHtml(siteName)}</p>
        </div>`,
      })
      .catch((e: unknown) => console.error('[contact] Confirmación falló:', e))

    return json(200, { ok: true })
  } catch (e) {
    console.error('[contact] Error inesperado:', e)
    return json(500, { ok: false, error: 'No se pudo enviar la solicitud.' })
  }
}

/*
 * RATE LIMIT (pendiente de infraestructura):
 * Netlify no ofrece almacenamiento de estado en funciones básicas. Para limitar
 * por IP, aplicar aquí una verificación contra un store externo (Upstash Redis,
 * Netlify Blobs o similar) usando `event.headers['x-nf-client-connection-ip']`
 * antes de enviar el correo. No se implementa aún para no añadir dependencias.
 */
