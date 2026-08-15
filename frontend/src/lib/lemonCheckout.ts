import api from './api'

/**
 * Flujo de mejora de plan con LemonSqueezy:
 * 1) El backend crea el checkout (la API key nunca sale del servidor).
 * 2) Si lemon.js está cargado (window.LemonSqueezy), se abre como OVERLAY
 *    embebido sobre el panel.
 * 3) Fallback: navegación normal a la URL de checkout hosteada.
 *
 * Sin credenciales configuradas, el backend responde 503 con mensaje claro
 * y esta función lo devuelve como { ok: false, message }.
 */

declare global {
  interface Window {
    LemonSqueezy?: {
      Url: { Open: (url: string) => void }
    }
    createLemonSqueezy?: () => void
  }
}

const LEMON_JS_SRC = 'https://assets.lemonsqueezy.com/lemon.js'

/**
 * Carga lemon.js UNA SOLA VEZ (deduplicado por selector de script). El paywall
 * lo precarga al montar; el resto de la app lo carga bajo demanda al pagar.
 */
export async function ensureLemonJs(): Promise<boolean> {
  if (window.LemonSqueezy) return true
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
    return Boolean(window.LemonSqueezy)
  } catch {
    return false
  }
}

export interface CheckoutResult {
  ok: boolean
  message?: string
}

export async function openPlanCheckout(
  planCode: 'BASIC' | 'PRO' | 'ENTERPRISE'
): Promise<CheckoutResult> {
  let checkoutUrl: string | undefined
  try {
    const result = await api.post<{ checkoutUrl?: string }>('/api/billing/create-checkout', {
      planCode,
    })
    checkoutUrl = result?.checkoutUrl
  } catch (err: unknown) {
    // Incluye el caso "Billing provider not configured" (503 del backend)
    return {
      ok: false,
      message:
        (err as { message?: string })?.message ||
        'El proveedor de pagos no está disponible en este momento.',
    }
  }

  if (!checkoutUrl) {
    return { ok: false, message: 'No se recibió la URL de pago. Intenta de nuevo.' }
  }

  const overlayReady = await ensureLemonJs()
  if (overlayReady && window.LemonSqueezy) {
    window.LemonSqueezy.Url.Open(checkoutUrl)
  } else {
    // Fallback: checkout hosteado en pestaña actual
    window.location.href = checkoutUrl
  }
  return { ok: true }
}
