import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../lib/api'
import { onCheckoutSuccess } from '../lib/lemonCheckout'

/**
 * Espera a que el backend confirme un pago de LemonSqueezy.
 *
 * Reparto de responsabilidades, que es lo importante aquí:
 *   · `Checkout.Success` de lemon.js **solo** enciende la UX de "confirmando".
 *     No activa nada, no abre el panel, no toca el paywall.
 *   · La verdad viene SIEMPRE de `GET /api/billing/status`, que la resuelve el
 *     BillingService a partir de la Subscription que escribió el webhook.
 *
 * Por eso este hook no guarda nada en localStorage ni en la URL: si el estado
 * del pago viviera en el navegador, bastaría con escribirlo a mano para
 * saltarse el paywall. Al recargar, el estado se recupera del backend
 * (`accessState = PENDING_CONFIRMATION`), no del cliente.
 */

/** Cada cuánto se le pregunta al backend mientras se espera al webhook. */
const POLL_INTERVAL_MS = 2_000
/** Tope de espera antes de ofrecer reintentar. El webhook suele tardar segundos. */
const POLL_TIMEOUT_MS = 60_000

export type ConfirmationPhase = 'idle' | 'confirming' | 'active' | 'timeout'

export interface BillingStatusResponse {
  hasActivePlan?: boolean
  paymentConfirmationPending?: boolean
  accessState?: 'ALLOWED' | 'PENDING_CONFIRMATION' | 'PAYWALL_REQUIRED'
  reason?: string
}

export interface UseBillingConfirmation {
  /** Fase actual. `confirming` bloquea toda la compra en la pantalla. */
  phase: ConfirmationPhase
  /** true mientras no se deba poder iniciar otro checkout. */
  isConfirming: boolean
  /** Se llama cuando el backend confirma el plan activo. */
  onActivated?: () => void
  /** Reintento manual tras el timeout. */
  retry: () => void
  /** Enciende la espera sin pasar por `Checkout.Success` (p. ej. al volver). */
  startConfirmation: () => void
}

export function useBillingConfirmation(options: {
  /** Qué hacer cuando el backend confirma. Normalmente entrar al panel. */
  onActivated?: () => void
  /** Arranca ya en "confirmando" porque el backend dice que hay pago en vuelo. */
  initiallyConfirming?: boolean
} = {}): UseBillingConfirmation {
  const { onActivated, initiallyConfirming = false } = options
  const [phase, setPhase] = useState<ConfirmationPhase>(
    initiallyConfirming ? 'confirming' : 'idle'
  )
  // En refs para que el intervalo no se reinicie en cada render ni arrastre un
  // callback viejo.
  const startedAtRef = useRef<number | null>(initiallyConfirming ? Date.now() : null)
  const onActivatedRef = useRef(onActivated)
  onActivatedRef.current = onActivated

  const startConfirmation = useCallback(() => {
    startedAtRef.current = Date.now()
    setPhase(current => (current === 'active' ? current : 'confirming'))
  }, [])

  const retry = useCallback(() => {
    startedAtRef.current = Date.now()
    setPhase('confirming')
  }, [])

  // El backend puede decir "hay un pago en vuelo" después de montar (por
  // ejemplo al volver del checkout): eso también enciende la espera.
  useEffect(() => {
    if (initiallyConfirming) startConfirmation()
  }, [initiallyConfirming, startConfirmation])

  // Señal de UX de lemon.js. No concede acceso: solo dice "ya pagó, espera".
  useEffect(() => onCheckoutSuccess(() => startConfirmation()), [startConfirmation])

  useEffect(() => {
    if (phase !== 'confirming') return

    let cancelled = false

    const check = async () => {
      try {
        const status = await api.get<BillingStatusResponse>('/api/billing/status')
        if (cancelled) return
        if (status?.hasActivePlan || status?.accessState === 'ALLOWED') {
          setPhase('active')
          onActivatedRef.current?.()
          return
        }
      } catch {
        // Un fallo puntual de red no cancela la espera: decide el siguiente intento.
      }
      if (cancelled) return
      const startedAt = startedAtRef.current ?? Date.now()
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) setPhase('timeout')
    }

    void check()
    const id = window.setInterval(check, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [phase])

  return {
    phase,
    isConfirming: phase === 'confirming',
    retry,
    startConfirmation,
  }
}
