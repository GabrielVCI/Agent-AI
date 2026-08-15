/**
 * Carga perezosa de reCAPTCHA v3 y obtención de token por acción.
 * Si el site key no está configurado o el script falla (bloqueadores de
 * anuncios, red, etc.), devuelve `null` en vez de bloquear el envío del
 * formulario: reCAPTCHA es una capa adicional, no la única defensa.
 */

declare global {
  interface Window {
    grecaptcha?: {
      ready: (callback: () => void) => void
      execute: (siteKey: string, options: { action: string }) => Promise<string>
    }
  }
}

let scriptPromise: Promise<void> | null = null

function loadRecaptchaScript(siteKey: string): Promise<void> {
  if (window.grecaptcha) return Promise.resolve()
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-recaptcha-v3]')
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('No se pudo cargar reCAPTCHA.')))
      return
    }

    const script = document.createElement('script')
    script.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`
    script.async = true
    script.defer = true
    script.dataset.recaptchaV3 = 'true'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('No se pudo cargar reCAPTCHA.'))
    document.head.appendChild(script)
  })

  return scriptPromise
}

/** Obtiene un token de reCAPTCHA v3 para `action`, o `null` si no está disponible. */
export async function getRecaptchaToken(action: string): Promise<string | null> {
  const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY
  if (!siteKey) return null

  try {
    await loadRecaptchaScript(siteKey)
    return await new Promise<string>((resolve, reject) => {
      window.grecaptcha?.ready(() => {
        window
          .grecaptcha!.execute(siteKey, { action })
          .then(resolve)
          .catch(reject)
      })
    })
  } catch {
    return null
  }
}
