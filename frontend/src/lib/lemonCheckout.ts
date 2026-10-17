import api from './api'
import { getUserFriendlyErrorMessage } from './errors'

/**
 * Checkout de LemonSqueezy en el panel.
 *
 * Flujo:
 *   1) El backend crea el checkout (la API key NUNCA sale del servidor y el
 *      navegador jamás ve store id ni variante: solo manda un planId interno).
 *   2) lemon.js abre la URL como OVERLAY sobre Sendwary.
 *   3) Al pagar, `Checkout.Success` solo sirve para la UX ("confirmando…").
 *      Quien activa la suscripción de verdad es el WEBHOOK del backend.
 *   4) El overlay se queda abierto con la confirmación de LemonSqueezy hasta
 *      que el cliente pulsa "Continuar", y es LemonSqueezy quien redirige al
 *      `redirect_url` que el backend configuró (el dashboard).
 *
 * El frontend NO puede marcar una suscripción como activa: consulta
 * /api/billing/status hasta que el backend lo confirme.
 *
 * Tampoco navega por su cuenta al terminar el pago: si lo hiciera, el cliente
 * perdería la pantalla de confirmación de LemonSqueezy a media compra.
 */

interface LemonSqueezyEvent {
  event?: string
  data?: unknown
}

declare global {
  interface Window {
    LemonSqueezy?: {
      Url: { Open: (url: string) => void; Close?: () => void }
      Setup: (options: { eventHandler: (event: LemonSqueezyEvent) => void }) => void
      Refresh?: () => void
    }
    createLemonSqueezy?: () => void
  }
}

const LEMON_JS_SRC = 'https://assets.lemonsqueezy.com/lemon.js'

/**
 * Suscriptores al evento `Checkout.Success` de lemon.js.
 *
 * lemon.js admite UN solo `eventHandler`, así que se registra una vez y desde
 * ahí se reparte. Si cada pantalla llamara a `Setup()` por su cuenta, la última
 * pisaría a las anteriores.
 */
type SuccessListener = () => void
const successListeners = new Set<SuccessListener>()
let handlerRegistered = false

function registerEventHandler(): void {
  if (handlerRegistered || !window.LemonSqueezy?.Setup) return
  window.LemonSqueezy.Setup({
    eventHandler: (event: LemonSqueezyEvent) => {
      if (event?.event !== 'Checkout.Success') return
      // NO se cierra el overlay: cerrarlo aquí destruía la pantalla final de
      // LemonSqueezy —el resumen de la compra y su botón "Continuar"— justo en
      // el instante en que aparecía. El cliente decide cuándo termina; nosotros
      // solo nos enteramos de que pagó para poder mostrar "confirmando".
      successListeners.forEach(listener => {
        try {
          listener()
        } catch {
          // Un suscriptor roto no puede impedir que los demás se enteren.
        }
      })
    },
  })
  handlerRegistered = true
}

/**
 * Avisa cuando LemonSqueezy confirma un pago. Devuelve la función para darse
 * de baja (usarla en el cleanup del efecto de React).
 *
 * OJO: esto NO significa "suscripción activa". Significa "pago recibido, el
 * webhook está por llegar": la UI debe pasar a estado de confirmación y
 * preguntarle al backend.
 */
export function onCheckoutSuccess(listener: SuccessListener): () => void {
  successListeners.add(listener)
  void ensureLemonJs()
  return () => {
    successListeners.delete(listener)
  }
}

/**
 * Carga lemon.js UNA SOLA VEZ (deduplicado por selector de script) desde el
 * origen oficial. El paywall lo precarga al montar; el resto de la app lo carga
 * bajo demanda al pagar.
 */
export async function ensureLemonJs(): Promise<boolean> {
  if (window.LemonSqueezy) {
    registerEventHandler()
    return true
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector(`script[src="${LEMON_JS_SRC}"]`)
      if (existing) {
        existing.addEventListener('load', () => resolve())
        existing.addEventListener('error', () => reject(new Error('load error')))
        // Si ya cargó antes de registrar los listeners
        if (window.LemonSqueezy || window.createLemonSqueezy) resolve()
        return
      }
      const script = document.createElement('script')
      script.src = LEMON_JS_SRC
      script.defer = true
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('load error'))
      document.head.appendChild(script)
    })
    window.createLemonSqueezy?.()
    registerEventHandler()
    return Boolean(window.LemonSqueezy)
  } catch {
    return false
  }
}

export interface CheckoutResult {
  ok: boolean
  /** true si el pago se abrió como overlay; false si hubo que navegar fuera. */
  overlay?: boolean
  message?: string
}

interface CheckoutResponse {
  checkoutUrl?: string
  checkoutId?: string | null
  planId?: string
}

/**
 * Pide el checkout al backend y lo abre como overlay.
 *
 * Solo viaja el identificador interno del plan. Si se mandara un variantId o un
 * tenantId, el backend los rechazaría: es él quien resuelve qué se compra.
 */
export async function openPlanCheckout(plan: {
  planId?: string
  planCode?: 'BASIC' | 'PRO' | 'ENTERPRISE'
}): Promise<CheckoutResult> {
  let checkoutUrl: string | undefined
  try {
    const result = await api.post<CheckoutResponse>('/api/billing/create-checkout', {
      ...(plan.planId ? { planId: plan.planId } : {}),
      ...(plan.planId ? {} : plan.planCode ? { planCode: plan.planCode } : {}),
    })
    checkoutUrl = result?.checkoutUrl
  } catch (err: unknown) {
    // Incluye "los pagos aún no están disponibles" (LEMON_CONFIGURATION_ERROR)
    return { ok: false, message: getUserFriendlyErrorMessage(err) }
  }

  if (!checkoutUrl) {
    return { ok: false, message: 'No se recibió la URL de pago. Intenta de nuevo.' }
  }

  const overlayReady = await ensureLemonJs()
  if (overlayReady && window.LemonSqueezy) {
    window.LemonSqueezy.Url.Open(checkoutUrl)
    return { ok: true, overlay: true }
  }

  // Fallback solo si lemon.js no cargó: checkout hosteado a página completa.
  window.location.href = checkoutUrl
  return { ok: true, overlay: false }
}
