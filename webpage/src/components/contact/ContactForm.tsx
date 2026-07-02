import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import { Send, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  type ContactFormData,
  type ContactErrors,
  initialContactData,
  validateContact,
  TIPOS_NEGOCIO,
  MOTIVOS,
  PLANES,
  VOLUMENES,
  PLAN_PARAM_MAP,
  MOTIVO_PARAM_MAP,
} from '@/lib/contact'

type Status = 'idle' | 'submitting' | 'success' | 'error'

const ENDPOINT = import.meta.env.VITE_CONTACT_ENDPOINT || '/.netlify/functions/contact'

/* -------------------------------------------------------------------------- */
/*  Estilos base                                                               */
/* -------------------------------------------------------------------------- */

const controlBase =
  'w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-neutral-900 shadow-sm transition-colors placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400 dark:bg-white/5 dark:text-white dark:placeholder:text-neutral-500'

function controlCls(hasError?: boolean) {
  return cn(
    controlBase,
    hasError
      ? 'border-red-400 focus:ring-red-400 focus:border-red-400 dark:border-red-500/60'
      : 'border-neutral-300 dark:border-white/10',
  )
}

/* -------------------------------------------------------------------------- */
/*  Campo con label + error                                                    */
/* -------------------------------------------------------------------------- */

function Field({
  id,
  label,
  required,
  error,
  hint,
  children,
}: {
  id: string
  label: string
  required?: boolean
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-neutral-800 dark:text-neutral-200">
        {label} {required && <span className="text-brand-600 dark:text-brand-300">*</span>}
      </label>
      {children}
      {hint && !error && (
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{hint}</p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Formulario                                                                 */
/* -------------------------------------------------------------------------- */

export function ContactForm() {
  const [searchParams] = useSearchParams()
  const [data, setData] = React.useState<ContactFormData>(initialContactData)
  const [errors, setErrors] = React.useState<ContactErrors>({})
  const [status, setStatus] = React.useState<Status>('idle')
  const [serverError, setServerError] = React.useState<string>('')

  // Preselección según query params (?plan=, ?motivo=, ?tipo=).
  React.useEffect(() => {
    const planParam = searchParams.get('plan')
    const motivoParam = searchParams.get('motivo')
    const tipoParam = searchParams.get('tipo')

    setData((prev) => {
      const next = { ...prev }
      if (planParam && PLAN_PARAM_MAP[planParam]) next.plan = PLAN_PARAM_MAP[planParam]
      if (motivoParam && MOTIVO_PARAM_MAP[motivoParam]) next.motivo = MOTIVO_PARAM_MAP[motivoParam]
      if (tipoParam === 'integracion') next.motivo = 'Evaluar integración'
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isIntegracion = data.motivo === 'Evaluar integración'

  function update<K extends keyof ContactFormData>(key: K, value: ContactFormData[K]) {
    setData((prev) => ({ ...prev, [key]: value }))
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const validation = validateContact(data)
    if (Object.keys(validation).length > 0) {
      setErrors(validation)
      // Enfocar el primer campo con error.
      const first = Object.keys(validation)[0]
      document.getElementById(first)?.focus()
      return
    }

    setStatus('submitting')
    setServerError('')
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, origen: window.location.href }),
      })
      if (!res.ok) throw new Error('bad status')
      setStatus('success')
    } catch {
      setStatus('error')
      setServerError(
        'No pudimos enviar la solicitud en este momento. Inténtalo nuevamente o contáctanos por WhatsApp.',
      )
    }
  }

  function reset() {
    setData(initialContactData)
    setErrors({})
    setStatus('idle')
  }

  /* --- Estado de éxito --------------------------------------------------- */
  if (status === 'success') {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-brand-500/25 bg-white p-10 text-center shadow-sm dark:border-brand-400/25 dark:bg-white/[0.03]">
        <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-500/15 text-brand-600 dark:text-brand-300">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h3 className="text-xl font-bold text-neutral-900 dark:text-white">
          Solicitud enviada correctamente
        </h3>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          Revisaremos tu caso y te contactaremos pronto con una recomendación según tu negocio.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 rounded-xl border border-neutral-300 bg-white px-5 py-2.5 text-sm font-semibold text-neutral-800 transition-colors hover:bg-neutral-100 dark:border-white/10 dark:bg-white/5 dark:text-neutral-100 dark:hover:bg-white/10"
        >
          Enviar otra solicitud
        </button>
      </div>
    )
  }

  /* --- Formulario -------------------------------------------------------- */
  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-sm sm:p-8 dark:border-white/10 dark:bg-white/[0.03]"
    >
      <h2 className="text-xl font-bold text-neutral-900 dark:text-white">Cuéntanos sobre tu negocio</h2>
      <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
        Mientras más contexto nos compartas, mejor podremos recomendarte un plan o una implementación
        por fases.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field id="nombre" label="Nombre completo" required error={errors.nombre}>
          <input
            id="nombre"
            type="text"
            autoComplete="name"
            value={data.nombre}
            onChange={(e) => update('nombre', e.target.value)}
            aria-invalid={!!errors.nombre}
            aria-describedby={errors.nombre ? 'nombre-error' : undefined}
            className={controlCls(!!errors.nombre)}
            placeholder="Tu nombre"
          />
        </Field>

        <Field id="email" label="Correo electrónico" required error={errors.email}>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={data.email}
            onChange={(e) => update('email', e.target.value)}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'email-error' : undefined}
            className={controlCls(!!errors.email)}
            placeholder="tucorreo@ejemplo.com"
          />
        </Field>

        <Field id="telefono" label="Teléfono / WhatsApp" required error={errors.telefono}>
          <input
            id="telefono"
            type="tel"
            autoComplete="tel"
            value={data.telefono}
            onChange={(e) => update('telefono', e.target.value)}
            aria-invalid={!!errors.telefono}
            aria-describedby={errors.telefono ? 'telefono-error' : undefined}
            className={controlCls(!!errors.telefono)}
            placeholder="+000 0000 0000"
          />
        </Field>

        <Field id="negocio" label="Nombre del negocio" required error={errors.negocio}>
          <input
            id="negocio"
            type="text"
            autoComplete="organization"
            value={data.negocio}
            onChange={(e) => update('negocio', e.target.value)}
            aria-invalid={!!errors.negocio}
            aria-describedby={errors.negocio ? 'negocio-error' : undefined}
            className={controlCls(!!errors.negocio)}
            placeholder="Tu negocio"
          />
        </Field>

        <Field id="tipoNegocio" label="Tipo de negocio" required error={errors.tipoNegocio}>
          <select
            id="tipoNegocio"
            value={data.tipoNegocio}
            onChange={(e) => update('tipoNegocio', e.target.value)}
            aria-invalid={!!errors.tipoNegocio}
            aria-describedby={errors.tipoNegocio ? 'tipoNegocio-error' : undefined}
            className={controlCls(!!errors.tipoNegocio)}
          >
            <option value="">Selecciona una opción</option>
            {TIPOS_NEGOCIO.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>

        <Field id="motivo" label="Motivo de contacto" required error={errors.motivo}>
          <select
            id="motivo"
            value={data.motivo}
            onChange={(e) => update('motivo', e.target.value)}
            aria-invalid={!!errors.motivo}
            aria-describedby={errors.motivo ? 'motivo-error' : undefined}
            className={controlCls(!!errors.motivo)}
          >
            <option value="">Selecciona una opción</option>
            {MOTIVOS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>

        <Field id="plan" label="Plan de interés">
          <select
            id="plan"
            value={data.plan}
            onChange={(e) => update('plan', e.target.value)}
            className={controlCls()}
          >
            <option value="">Selecciona (opcional)</option>
            {PLANES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>

        <Field id="volumen" label="Mensajes por WhatsApp al mes">
          <select
            id="volumen"
            value={data.volumen}
            onChange={(e) => update('volumen', e.target.value)}
            className={controlCls()}
          >
            <option value="">Selecciona (opcional)</option>
            {VOLUMENES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>

        <Field
          id="sistemaActual"
          label={isIntegracion ? 'Sistema actual (recomendado)' : 'Sistema actual'}
          hint={isIntegracion ? 'Cuéntanos qué sistema usas para evaluar la integración.' : undefined}
        >
          <input
            id="sistemaActual"
            type="text"
            value={data.sistemaActual}
            onChange={(e) => update('sistemaActual', e.target.value)}
            className={cn(controlCls(), isIntegracion && 'ring-2 ring-brand-400/40')}
            placeholder="Odoo, SAP, QuickBooks, Excel, CRM, sistema propio, ninguno…"
          />
        </Field>

        <Field id="sitioWeb" label="Sitio web o redes sociales">
          <input
            id="sitioWeb"
            type="text"
            value={data.sitioWeb}
            onChange={(e) => update('sitioWeb', e.target.value)}
            className={controlCls()}
            placeholder="https:// o @usuario (opcional)"
          />
        </Field>
      </div>

      <div className="mt-5">
        <Field id="mensaje" label="Mensaje" required error={errors.mensaje}>
          <textarea
            id="mensaje"
            rows={4}
            value={data.mensaje}
            onChange={(e) => update('mensaje', e.target.value)}
            aria-invalid={!!errors.mensaje}
            aria-describedby={errors.mensaje ? 'mensaje-error' : undefined}
            className={cn(controlCls(!!errors.mensaje), 'resize-y')}
            placeholder="Cuéntanos qué necesitas automatizar, cuántas personas atienden WhatsApp y si deseas integrar algún sistema."
          />
        </Field>
      </div>

      {/* Honeypot anti-bots (oculto para usuarios) */}
      <div className="absolute -left-[9999px]" aria-hidden="true">
        <label htmlFor="companyWebsite">No completar</label>
        <input
          id="companyWebsite"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={data.companyWebsite}
          onChange={(e) => update('companyWebsite', e.target.value)}
        />
      </div>

      {/* Consentimiento */}
      <div className="mt-5">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            id="consentimiento"
            type="checkbox"
            checked={data.consentimiento}
            onChange={(e) => update('consentimiento', e.target.checked)}
            aria-invalid={!!errors.consentimiento}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 text-brand-600 focus:ring-brand-400 dark:border-white/20 dark:bg-white/5"
          />
          <span className="text-sm text-neutral-600 dark:text-neutral-300">
            Acepto ser contactado para recibir información sobre la plataforma.
          </span>
        </label>
        {errors.consentimiento && (
          <p className="mt-1 flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {errors.consentimiento}
          </p>
        )}
      </div>

      {/* Error de servidor */}
      {status === 'error' && (
        <div className="mt-5 flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {serverError}
        </div>
      )}

      {/* Botón enviar */}
      <button
        type="submit"
        disabled={status === 'submitting'}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/25 transition-all hover:bg-brand-500 hover:shadow-brand-500/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-70 dark:focus-visible:ring-offset-neutral-950"
      >
        {status === 'submitting' ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Enviando solicitud…
          </>
        ) : (
          <>
            <Send className="h-4 w-4" />
            Enviar solicitud
          </>
        )}
      </button>

      <p className="mt-4 text-center text-xs leading-relaxed text-neutral-500">
        Responderemos con una recomendación según tu tipo de negocio, volumen de mensajes y
        necesidades de integración.
      </p>
    </form>
  )
}
