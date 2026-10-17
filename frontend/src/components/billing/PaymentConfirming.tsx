import { ShieldCheck } from 'lucide-react'
import Button from '../ui/Button'
import LoadingSpinner from '../ui/LoadingSpinner'
import { SendwaryWordmark } from '../BrandLogo'
import type { ConfirmationPhase } from '../../hooks/useBillingConfirmation'

/**
 * Pantalla de "estamos confirmando tu pago".
 *
 * Se usa en los dos momentos en que el cliente puede quedarse esperando al
 * webhook, para que la experiencia sea la misma en ambos:
 *   · `inline`: sobre las tarjetas de planes, justo después de pagar.
 *   · `screen` : al volver al panel antes de que el webhook haya terminado.
 *
 * El copy evita deliberadamente el vocabulario técnico (webhook, suscripción
 * pendiente, polling): el cliente solo necesita saber que su pago llegó y que
 * no tiene que hacer nada más. Y en ningún estado hay un botón de "pagar otra
 * vez": esa es justo la acción que produciría un cobro doble.
 */

export interface PaymentConfirmingProps {
  phase: ConfirmationPhase
  onRetry: () => void
  /** `screen` cubre el viewport completo (vuelta al panel); `inline` es un panel en la pagina. */
  variant?: 'inline' | 'screen'
  /** Copy de vuelta al panel, distinto del de justo después de pagar. */
  context?: 'checkout' | 'return'
}

const COPY = {
  checkout: {
    title: 'Estamos confirmando tu pago',
    description:
      'Tu pago fue procesado. Estamos validando tu suscripción con Lemon Squeezy y preparando tu acceso a Sendwary. En unos segundos podrás continuar a la plataforma.',
    hint: 'No necesitas realizar ninguna acción adicional.',
  },
  return: {
    title: 'Estamos activando tu suscripción',
    description:
      'Tu pago ya está en proceso de confirmación. Estamos terminando de preparar tu acceso a Sendwary.',
    hint: 'No cierres esta ventana ni inicies otro pago.',
  },
} as const

const TIMEOUT_COPY = {
  title: 'No pudimos confirmar tu suscripción todavía',
  description:
    'Si tu pago fue completado, no realices otro pago. Espera unos momentos y verifica de nuevo; si el problema continúa, escríbenos y lo revisamos contigo.',
} as const

function Body({
  phase,
  onRetry,
  context,
}: {
  phase: ConfirmationPhase
  onRetry: () => void
  context: 'checkout' | 'return'
}) {
  const timedOut = phase === 'timeout'
  const copy = COPY[context]

  return (
    <div
      className="flex flex-col items-center text-center"
      // Lectores de pantalla: esto es una espera en curso, no contenido estático.
      aria-live="polite"
      aria-busy={phase === 'confirming'}
    >
      {timedOut ? (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <ShieldCheck className="h-6 w-6" />
        </div>
      ) : (
        <div className="relative flex h-12 w-12 items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-primary-100 animate-ping opacity-60" />
          <span className="absolute inset-0 rounded-full bg-primary-50" />
          <LoadingSpinner size="md" className="relative" />
        </div>
      )}

      <h2 className="mt-5 text-lg font-bold text-slate-900 sm:text-xl">
        {timedOut ? TIMEOUT_COPY.title : copy.title}
      </h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-600">
        {timedOut ? TIMEOUT_COPY.description : copy.description}
      </p>

      {timedOut ? (
        <Button className="mt-5" variant="primary" onClick={onRetry}>
          Reintentar verificación
        </Button>
      ) : (
        <p className="mt-4 text-xs text-slate-400">{copy.hint}</p>
      )}
    </div>
  )
}

export default function PaymentConfirming({
  phase,
  onRetry,
  variant = 'inline',
  context = 'checkout',
}: PaymentConfirmingProps) {
  if (phase !== 'confirming' && phase !== 'timeout') return null

  if (variant === 'screen') {
    return (
      // `fixed inset-0` y no `min-h-screen`: esta pantalla se renderiza DENTRO
      // del Layout (sidebar + topbar), asi que un bloque en el flujo normal
      // solo tapaba el area de contenido y dejaba el panel asomando alrededor.
      // Fija al viewport cubre TODA la pantalla, que es justo lo que hace falta
      // mientras la cuenta esta a medio activar: nada del panel debe verse ni
      // poder tocarse. `overflow-y-auto` + `min-h-full` para que en pantallas
      // bajas la tarjeta siga siendo alcanzable con scroll.
      <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-50">
        <div className="flex min-h-full flex-col items-center justify-center px-4 py-10">
          <SendwaryWordmark markClassName="h-11 w-11" textClassName="text-2xl" />
          <div className="mt-8 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <Body phase={phase} onRetry={onRetry} context={context} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mb-6 w-full max-w-2xl rounded-2xl border border-primary-200 bg-white p-6 shadow-sm ring-1 ring-primary-100">
      <Body phase={phase} onRetry={onRetry} context={context} />
    </div>
  )
}
