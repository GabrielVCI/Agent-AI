/**
 * Carga del Facebook JavaScript SDK para WhatsApp Embedded Signup.
 *
 * - Se carga UNA sola vez (promesa memoizada): montar el componente varias
 *   veces no duplica el script ni reinicializa el SDK.
 * - Toda la configuración pública (appId, configId, versión de Graph) viene
 *   del backend (`/api/integrations/whatsapp` → capabilities.embeddedSignup),
 *   con las VITE_* como respaldo. El frontend NUNCA maneja el app secret ni
 *   ningún access token.
 */

export interface FacebookSdkConfig {
  appId: string
  graphApiVersion: string
}

interface FbAuthResponse {
  code?: string
  accessToken?: string
}

interface FbLoginResponse {
  authResponse?: FbAuthResponse | null
  status?: string
}

interface FacebookSdk {
  init(options: {
    appId: string
    autoLogAppEvents?: boolean
    xfbml?: boolean
    version: string
  }): void
  login(
    callback: (response: FbLoginResponse) => void,
    options: {
      config_id: string
      response_type: string
      override_default_response_type: boolean
      extras?: Record<string, unknown>
    }
  ): void
}

declare global {
  interface Window {
    FB?: FacebookSdk
    fbAsyncInit?: () => void
  }
}

const SDK_SRC = 'https://connect.facebook.net/en_US/sdk.js'
const SCRIPT_ID = 'facebook-jssdk'

let sdkPromise: Promise<FacebookSdk> | null = null

/** Config pública desde variables VITE (respaldo si el backend no la envía). */
export function getViteFacebookConfig(): {
  enabled: boolean
  appId: string | null
  configId: string | null
  graphApiVersion: string
} {
  const env = import.meta.env
  return {
    enabled: String(env.VITE_META_EMBEDDED_SIGNUP_ENABLED ?? '') === 'true',
    appId: (env.VITE_META_APP_ID as string) || null,
    configId: (env.VITE_META_EMBEDDED_SIGNUP_CONFIG_ID as string) || null,
    graphApiVersion: (env.VITE_META_GRAPH_API_VERSION as string) || 'v21.0',
  }
}

/**
 * Carga e inicializa el SDK. Rechaza con un mensaje amigable si el script no
 * llega a cargar (bloqueadores de anuncios, red corporativa, offline…).
 */
export function loadFacebookSdk(config: FacebookSdkConfig): Promise<FacebookSdk> {
  if (sdkPromise) return sdkPromise

  sdkPromise = new Promise<FacebookSdk>((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('SDK_NO_WINDOW'))
      return
    }

    // Ya cargado por otra parte de la app
    if (window.FB) {
      window.FB.init({
        appId: config.appId,
        autoLogAppEvents: true,
        xfbml: true,
        version: config.graphApiVersion,
      })
      resolve(window.FB)
      return
    }

    window.fbAsyncInit = () => {
      if (!window.FB) {
        reject(new Error('SDK_INIT_FAILED'))
        return
      }
      window.FB.init({
        appId: config.appId,
        autoLogAppEvents: true,
        xfbml: true,
        version: config.graphApiVersion,
      })
      resolve(window.FB)
    }

    // El script puede existir aunque FB aún no esté listo (carga en curso)
    if (document.getElementById(SCRIPT_ID)) return

    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.src = SDK_SRC
    script.async = true
    script.defer = true
    script.crossOrigin = 'anonymous'
    script.onerror = () => {
      sdkPromise = null // permitir reintento
      reject(new Error('SDK_LOAD_FAILED'))
    }
    document.body.appendChild(script)

    // Red muy lenta o script bloqueado silenciosamente
    window.setTimeout(() => {
      if (!window.FB) {
        sdkPromise = null
        reject(new Error('SDK_TIMEOUT'))
      }
    }, 15000)
  })

  return sdkPromise
}

/** Datos que Meta devuelve por postMessage al terminar el flujo. */
export interface EmbeddedSignupMessage {
  event: string
  wabaId: string | null
  phoneNumberId: string | null
  businessId: string | null
}

/**
 * Escucha el postMessage `WA_EMBEDDED_SIGNUP` de Meta. Devuelve la función
 * para desuscribirse. Solo acepta mensajes con origen de Facebook.
 */
export function listenEmbeddedSignup(
  onMessage: (msg: EmbeddedSignupMessage) => void
): () => void {
  const handler = (event: MessageEvent) => {
    if (
      event.origin !== 'https://www.facebook.com' &&
      event.origin !== 'https://web.facebook.com'
    ) {
      return
    }
    try {
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
      if (data?.type !== 'WA_EMBEDDED_SIGNUP') return
      onMessage({
        event: String(data.event ?? ''),
        wabaId: data.data?.waba_id ?? null,
        phoneNumberId: data.data?.phone_number_id ?? null,
        businessId: data.data?.business_id ?? null,
      })
    } catch {
      // Mensaje no JSON de otro origen: ignorar en silencio
    }
  }

  window.addEventListener('message', handler)
  return () => window.removeEventListener('message', handler)
}
