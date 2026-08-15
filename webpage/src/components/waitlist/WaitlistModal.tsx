import * as React from 'react'
import { X, Send, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  type WaitlistFormData,
  type WaitlistErrors,
  type PlanLevel,
  initialWaitlistData,
  validateWaitlist,
  WAITLIST_MAX,
  PLAN_LABELS,
} from '@/lib/waitlist'
import { submitToWeb3Forms } from '@/lib/web3forms'
import { getRecaptchaToken } from '@/lib/recaptcha'
import { STORAGE_KEYS, canSubmitForm, markFormSubmitted, isSubmittedTooFast } from '@/lib/spam-guard'

type Status = 'idle' | 'submitting' | 'success' | 'error'

const COOLDOWN_MESSAGE = 'Ya recibimos una solicitud recientemente. Intenta nuevamente en unos segundos.'
const ERROR_MESSAGE = 'No pudimos registrar tu solicitud en este momento. Inténtalo nuevamente.'

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

function FieldError({ children }: { children: string }) {
  return (
    <p className="mt-1 flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
      {children}
    </p>
  )
}

export interface WaitlistModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedPlan: PlanLevel | null
}

export function WaitlistModal({ open, onOpenChange, selectedPlan }: WaitlistModalProps) {
  const [data, setData] = React.useState<WaitlistFormData>(initialWaitlistData)
  const [errors, setErrors] = React.useState<WaitlistErrors>({})
  const [status, setStatus] = React.useState<Status>('idle')
  const [serverError, setServerError] = React.useState('')
  const firstFieldRef = React.useRef<HTMLInputElement>(null)
  // Marca de tiempo de apertura: un envío demasiado rápido sugiere un bot.
  const formStartedAtRef = React.useRef(Date.now())

  // Reinicia el formulario cada vez que se abre el modal.
  React.useEffect(() => {
    if (!open) return
    setData(initialWaitlistData)
    setErrors({})
    setStatus('idle')
    setServerError('')
    formStartedAtRef.current = Date.now()
  }, [open])

  // Cierre con Escape, foco inicial y bloqueo de scroll del body.
  React.useEffect(() => {
    if (!open) return

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false)
    }

    document.addEventListener('keydown', onKeyDown)
    const focusTimer = window.setTimeout(() => firstFieldRef.current?.focus(), 10)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      window.clearTimeout(focusTimer)
      document.body.style.overflow = previousOverflow
    }
  }, [open, onOpenChange])

  function update<K extends keyof WaitlistFormData>(key: K, value: WaitlistFormData[K]) {
    setData((prev) => ({ ...prev, [key]: value }))
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    // Honeypot: los bots suelen rellenar todos los campos, incluido este oculto.
    if (data.companyWebsite) {
      setStatus('success')
      return
    }

    const validation = validateWaitlist(data)
    if (Object.keys(validation).length > 0) {
      setErrors(validation)
      const first = Object.keys(validation)[0]
      document.getElementById(`waitlist-${first}`)?.focus()
      return
    }

    // Envío sospechosamente rápido: tratamos como bot, sin bloquear con un error confuso.
    if (isSubmittedTooFast(formStartedAtRef.current)) {
      setStatus('success')
      return
    }

    if (!canSubmitForm(STORAGE_KEYS.waitlist)) {
      setStatus('error')
      setServerError(COOLDOWN_MESSAGE)
      return
    }

    setStatus('submitting')
    setServerError('')
    try {
      // Se ejecuta para tener visibilidad de bots en el panel de Google, pero el
      // token NO se envía a Web3Forms: su plan gratuito rechaza el envío completo
      // si el campo "g-recaptcha-response" viene presente ("Pro feature").
      await getRecaptchaToken('waitlist_form')
      const selectedPlanLabel = selectedPlan ? PLAN_LABELS[selectedPlan] : ''

      await submitToWeb3Forms({
        subject: `Nueva inscripción a lista de espera - Sendwary - ${selectedPlanLabel}`,
        from_name: 'Lista de espera Sendwary',
        name: data.nombreEmpresa,
        phone: data.telefono,
        email: data.email || 'No proporcionado',
        replyto: data.email || undefined,
        selected_plan: selectedPlanLabel,
        discount: '20% de descuento en implementación',
        source: 'Página de precios',
        page_url: window.location.href,
      })

      markFormSubmitted(STORAGE_KEYS.waitlist)
      setStatus('success')
    } catch {
      setStatus('error')
      setServerError(ERROR_MESSAGE)
    }
  }

  if (!open) return null

  const planLabel = selectedPlan ? PLAN_LABELS[selectedPlan] : ''

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-neutral-950/70 px-4 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="waitlist-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false)
      }}
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-brand-500/30 bg-white p-6 shadow-2xl shadow-brand-900/20 sm:p-8 dark:border-brand-400/25 dark:bg-neutral-950">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Cerrar"
          className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        {status === 'success' ? (
          <div className="flex flex-col items-center py-6 text-center">
            <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-500/15 text-brand-600 dark:text-brand-300">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h3 className="text-lg font-bold text-neutral-900 dark:text-white">
              Te hemos agregado a la lista de espera. Te contactaremos pronto.
            </h3>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="mt-6 rounded-xl border border-neutral-300 bg-white px-5 py-2.5 text-sm font-semibold text-neutral-800 transition-colors hover:bg-neutral-100 dark:border-white/10 dark:bg-white/5 dark:text-neutral-100 dark:hover:bg-white/10"
            >
              Cerrar
            </button>
          </div>
        ) : (
          <>
            <h2
              id="waitlist-modal-title"
              className="pr-8 text-xl font-bold text-neutral-900 dark:text-white"
            >
              Únete a la lista de espera
            </h2>
            <p className="mt-1.5 text-sm font-semibold text-brand-600 dark:text-brand-300">
              Plan seleccionado: {planLabel}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
              Déjanos tus datos y te contactaremos para explicarte la implementación,
              disponibilidad y beneficios de registrarte temprano.
            </p>

            <form onSubmit={handleSubmit} noValidate className="relative mt-6 space-y-4">
              <div>
                <label
                  htmlFor="waitlist-nombreEmpresa"
                  className="mb-1.5 block text-sm font-medium text-neutral-800 dark:text-neutral-200"
                >
                  Nombre de empresa o persona{' '}
                  <span className="text-brand-600 dark:text-brand-300">*</span>
                </label>
                <input
                  ref={firstFieldRef}
                  id="waitlist-nombreEmpresa"
                  type="text"
                  autoComplete="organization"
                  maxLength={WAITLIST_MAX.nombreEmpresa}
                  value={data.nombreEmpresa}
                  onChange={(e) => update('nombreEmpresa', e.target.value)}
                  aria-invalid={!!errors.nombreEmpresa}
                  aria-describedby={errors.nombreEmpresa ? 'waitlist-nombreEmpresa-error' : undefined}
                  className={controlCls(!!errors.nombreEmpresa)}
                  placeholder="Ej. Salón Bella Vida / Juan Pérez"
                />
                {errors.nombreEmpresa && <FieldError>{errors.nombreEmpresa}</FieldError>}
              </div>

              <div>
                <label
                  htmlFor="waitlist-telefono"
                  className="mb-1.5 block text-sm font-medium text-neutral-800 dark:text-neutral-200"
                >
                  Teléfono o WhatsApp de contacto{' '}
                  <span className="text-brand-600 dark:text-brand-300">*</span>
                </label>
                <input
                  id="waitlist-telefono"
                  type="tel"
                  autoComplete="tel"
                  maxLength={WAITLIST_MAX.telefono}
                  value={data.telefono}
                  onChange={(e) => update('telefono', e.target.value)}
                  aria-invalid={!!errors.telefono}
                  aria-describedby={errors.telefono ? 'waitlist-telefono-error' : undefined}
                  className={controlCls(!!errors.telefono)}
                  placeholder="Ej. 809-000-0000"
                />
                {errors.telefono && <FieldError>{errors.telefono}</FieldError>}
              </div>

              <div>
                <label
                  htmlFor="waitlist-email"
                  className="mb-1.5 block text-sm font-medium text-neutral-800 dark:text-neutral-200"
                >
                  Correo electrónico
                </label>
                <input
                  id="waitlist-email"
                  type="email"
                  autoComplete="email"
                  maxLength={WAITLIST_MAX.email}
                  value={data.email}
                  onChange={(e) => update('email', e.target.value)}
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? 'waitlist-email-error' : undefined}
                  className={controlCls(!!errors.email)}
                  placeholder="correo@empresa.com"
                />
                {errors.email && <FieldError>{errors.email}</FieldError>}
              </div>

              <div className="rounded-lg bg-neutral-50 px-3 py-2.5 text-xs leading-relaxed text-neutral-600 dark:bg-white/5 dark:text-neutral-300">
                Plan seleccionado:{' '}
                <span className="font-semibold text-neutral-900 dark:text-white">{planLabel}</span>
                <br />
                Beneficio:{' '}
                <span className="font-semibold text-brand-600 dark:text-brand-300">
                  20% de descuento en la implementación
                </span>
              </div>

              {/* Honeypot anti-bots (oculto para usuarios) */}
              <div className="absolute -left-[9999px]" aria-hidden="true">
                <label htmlFor="waitlist-companyWebsite">No completar</label>
                <input
                  id="waitlist-companyWebsite"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={data.companyWebsite}
                  onChange={(e) => update('companyWebsite', e.target.value)}
                />
              </div>

              <div>
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    id="waitlist-consentimiento"
                    type="checkbox"
                    checked={data.consentimiento}
                    onChange={(e) => update('consentimiento', e.target.checked)}
                    aria-invalid={!!errors.consentimiento}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 text-brand-600 focus:ring-brand-400 dark:border-white/20 dark:bg-white/5"
                  />
                  <span className="text-sm text-neutral-600 dark:text-neutral-300">
                    Acepto ser contactado para recibir información sobre Sendwary y la lista de
                    espera.
                  </span>
                </label>
                {errors.consentimiento && <FieldError>{errors.consentimiento}</FieldError>}
              </div>

              {status === 'error' && (
                <div className="flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {serverError}
                </div>
              )}

              <button
                type="submit"
                disabled={status === 'submitting'}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/25 transition-all hover:bg-brand-500 hover:shadow-brand-500/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-70 dark:focus-visible:ring-offset-neutral-950"
              >
                {status === 'submitting' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Enviando…
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Registrarme en la lista de espera
                  </>
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
