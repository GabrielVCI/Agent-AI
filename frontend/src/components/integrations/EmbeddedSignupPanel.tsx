import { useEffect, useRef, useState } from 'react'
import { MessageSquare, ShieldCheck, CheckCircle2, AlertTriangle, Headset, Wrench } from 'lucide-react'
import api from '../../lib/api'
import {
  loadFacebookSdk,
  listenEmbeddedSignup,
  getViteFacebookConfig,
  type EmbeddedSignupMessage,
} from '../../lib/facebookSdk'
import Button from '../ui/Button'
import Alert from '../ui/Alert'
import Badge from '../ui/Badge'
import type {
  EmbeddedSignupResult,
  WhatsAppCapabilities,
  WhatsAppIntegration,
} from './whatsapp.types'

/**
 * Conexión recomendada: WhatsApp Embedded Signup oficial de Meta.
 *
 * El navegador solo abre el flujo de Meta y recoge el `code` (TTL 30s) + los
 * ids que Meta devuelve por postMessage. TODO lo demás (intercambio del code
 * por el token del cliente, suscripción de webhooks) ocurre en el backend: el
 * frontend nunca ve tokens ni el app secret.
 */

type PanelState =
  | 'IDLE'
  | 'LOADING_SDK'
  | 'CONNECTING' // popup de Meta abierto
  | 'COMPLETING' // backend procesando (validando datos con Meta)
  | 'SELECT_NUMBER' // la WABA tiene varios números: el cliente elige
  | 'CONNECTED'
  | 'REQUIRES_ACTION'
  | 'ERROR'

const STATE_BADGE: Record<PanelState, { label: string; variant: 'default' | 'info' | 'success' | 'warning' | 'danger' }> = {
  IDLE: { label: 'No configurado', variant: 'default' },
  LOADING_SDK: { label: 'Preparando', variant: 'info' },
  CONNECTING: { label: 'Conectando', variant: 'info' },
  COMPLETING: { label: 'Validando datos con Meta', variant: 'info' },
  SELECT_NUMBER: { label: 'Selecciona un número', variant: 'warning' },
  CONNECTED: { label: 'Número conectado', variant: 'success' },
  REQUIRES_ACTION: { label: 'Requiere acción', variant: 'warning' },
  ERROR: { label: 'Error', variant: 'danger' },
}

const SDK_ERRORS: Record<string, string> = {
  SDK_LOAD_FAILED:
    'No pudimos cargar el conector de Meta. Si usas un bloqueador de anuncios o una red corporativa, desactívalo e intenta de nuevo.',
  SDK_TIMEOUT: 'El conector de Meta tardó demasiado en cargar. Revisa tu conexión e intenta de nuevo.',
  SDK_INIT_FAILED: 'No pudimos iniciar el conector de Meta. Intenta de nuevo o solicita asistencia.',
  SDK_NO_WINDOW: 'El conector de Meta no está disponible en este navegador.',
}

export default function EmbeddedSignupPanel({
  capabilities,
  integration,
  onRequestAssistance,
  onAdvancedSetup,
  onConnected,
}: {
  capabilities: WhatsAppCapabilities | null
  integration: WhatsAppIntegration | null
  onRequestAssistance: () => void
  onAdvancedSetup: () => void
  onConnected: () => void
}) {
  // El backend manda la config pública; VITE_* queda como respaldo.
  const backendConfig = capabilities?.embeddedSignup
  const viteConfig = getViteFacebookConfig()
  const config = {
    enabled: backendConfig?.enabled ?? viteConfig.enabled,
    appId: backendConfig?.appId ?? viteConfig.appId,
    configId: backendConfig?.configId ?? viteConfig.configId,
    graphApiVersion: backendConfig?.graphApiVersion ?? viteConfig.graphApiVersion,
  }

  const [state, setState] = useState<PanelState>(
    integration?.status === 'CONNECTED' ? 'CONNECTED' : 'IDLE'
  )
  const [error, setError] = useState('')
  const [result, setResult] = useState<EmbeddedSignupResult | null>(null)
  // Número que el cliente marcó en la lista antes de confirmar
  const [chosenNumber, setChosenNumber] = useState<string | null>(null)
  const [selecting, setSelecting] = useState(false)
  // Datos que llegan por postMessage antes que el callback de FB.login
  const signupData = useRef<EmbeddedSignupMessage | null>(null)
  const unlisten = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => {
      unlisten.current?.()
    }
  }, [])

  /** Aplica el resultado del backend al estado del panel. */
  const applyResult = (data: EmbeddedSignupResult) => {
    setResult(data)
    if (data.availablePhoneNumbers.length > 0) {
      // La WABA tiene varios números: el backend NO eligió por el cliente.
      setChosenNumber(data.availablePhoneNumbers[0]?.id ?? null)
      setState('SELECT_NUMBER')
      return
    }
    setState(data.status === 'CONNECTED' ? 'CONNECTED' : 'REQUIRES_ACTION')
    onConnected()
  }

  const complete = async (code: string | null) => {
    setState('COMPLETING')
    setError('')
    try {
      const data = await api.post<EmbeddedSignupResult>(
        '/api/integrations/whatsapp/embedded-signup/complete',
        {
          code,
          wabaId: signupData.current?.wabaId ?? null,
          phoneNumberId: signupData.current?.phoneNumberId ?? null,
          businessId: signupData.current?.businessId ?? null,
          event: signupData.current?.event ?? null,
        }
      )
      applyResult(data)
    } catch (err: unknown) {
      setState('ERROR')
      setError(
        (err as { message?: string })?.message ||
          'No pudimos completar la conexión con Meta. Puedes intentar nuevamente o solicitar asistencia.'
      )
    }
  }

  /** Confirma cuál de los números de la WABA usará Sendwary. */
  const confirmPhoneNumber = async () => {
    if (!chosenNumber) return
    setSelecting(true)
    setError('')
    try {
      const data = await api.post<EmbeddedSignupResult>(
        '/api/integrations/whatsapp/embedded-signup/select-phone-number',
        { phoneNumberId: chosenNumber }
      )
      applyResult(data)
    } catch (err: unknown) {
      setError(
        (err as { message?: string })?.message ||
          'No pudimos guardar el número seleccionado. Intenta nuevamente o solicita asistencia.'
      )
    } finally {
      setSelecting(false)
    }
  }

  const startEmbeddedSignup = async () => {
    if (!config.enabled || !config.appId || !config.configId) {
      setState('ERROR')
      setError('La conexión automática no está disponible en este momento.')
      return
    }

    setState('LOADING_SDK')
    setError('')
    setResult(null)
    signupData.current = null

    let fb
    try {
      fb = await loadFacebookSdk({
        appId: config.appId,
        graphApiVersion: config.graphApiVersion,
      })
    } catch (err) {
      setState('ERROR')
      setError(SDK_ERRORS[(err as Error).message] ?? SDK_ERRORS.SDK_LOAD_FAILED)
      return
    }

    // Meta manda los ids (waba_id, phone_number_id, business_id) por
    // postMessage; el code llega aparte en el callback de FB.login.
    unlisten.current?.()
    unlisten.current = listenEmbeddedSignup(msg => {
      signupData.current = msg
    })

    setState('CONNECTING')
    fb.login(
      response => {
        const code = response?.authResponse?.code ?? null
        if (!code && !signupData.current?.wabaId) {
          // El usuario cerró el popup o canceló los permisos
          setState('ERROR')
          setError(
            'Cancelaste la conexión con Meta. Puedes intentarlo de nuevo cuando quieras o solicitar asistencia.'
          )
          return
        }
        void complete(code)
      },
      {
        config_id: config.configId!,
        response_type: 'code',
        override_default_response_type: true,
        extras: { setup: {} },
      }
    )
  }

  // ── Fallback: Embedded Signup no habilitado en este entorno ──
  if (!config.enabled) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center flex-shrink-0">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-slate-900">Conecta tu WhatsApp Business</p>
            <p className="text-sm text-slate-500 mt-1">
              La conexión automática está en preparación. Puedes solicitar asistencia o usar
              configuración avanzada.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 mt-3">
              <Button size="sm" onClick={onRequestAssistance} icon={<Headset className="h-3.5 w-3.5" />}>
                Solicitar asistencia
              </Button>
              <Button size="sm" variant="secondary" onClick={onAdvancedSetup} icon={<Wrench className="h-3.5 w-3.5" />}>
                Ya tengo WhatsApp Cloud API
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const badge = STATE_BADGE[state]
  const busy =
    state === 'LOADING_SDK' || state === 'CONNECTING' || state === 'COMPLETING' || selecting

  return (
    <div className="rounded-xl border border-primary-200 bg-primary-50/40 p-4">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary-100 text-primary-600 flex items-center justify-center flex-shrink-0">
          <MessageSquare className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-slate-900">Conecta tu WhatsApp Business</p>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            Conecta tu número usando el flujo oficial de Meta. No necesitas crear una app
            manualmente.
          </p>

          {error && (
            <Alert variant="danger" className="mt-3">
              {error}
            </Alert>
          )}

          {/* Varios números en la WABA: el cliente elige cuál usa Sendwary.
              Nunca se elige por él: conectaría el número equivocado. */}
          {state === 'SELECT_NUMBER' && result && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
              <p className="text-sm font-medium text-slate-900">
                Selecciona el número que usará Sendwary
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Tu cuenta de WhatsApp Business tiene varios números disponibles.
              </p>
              <div className="space-y-1.5 mt-2.5">
                {result.availablePhoneNumbers.map(n => (
                  <label
                    key={n.id}
                    className={`flex items-start gap-2.5 rounded-lg border p-2.5 cursor-pointer transition-colors ${
                      chosenNumber === n.id
                        ? 'border-primary-400 bg-white'
                        : 'border-slate-200 bg-white/60 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="waba-phone-number"
                      className="mt-1 flex-shrink-0"
                      checked={chosenNumber === n.id}
                      onChange={() => setChosenNumber(n.id)}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-900">
                        {n.displayPhoneNumber ?? 'Número sin formato disponible'}
                      </span>
                      <span className="block text-xs text-slate-500 truncate">
                        {[n.verifiedName, n.status, n.qualityRating && `calidad ${n.qualityRating}`]
                          .filter(Boolean)
                          .join(' · ') || 'Sin datos adicionales'}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <Button
                className="mt-2.5"
                size="sm"
                onClick={confirmPhoneNumber}
                loading={selecting}
                disabled={selecting || !chosenNumber}
              >
                Usar este número
              </Button>
            </div>
          )}

          {result && state === 'CONNECTED' && (
            <>
              <Alert variant="success" className="mt-3">
                <span className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>
                    {result.message} {result.nextStep}
                    {result.warning ? ` ${result.warning}` : ''}
                  </span>
                </span>
              </Alert>

              {/* Datos que Meta confirmó. Nunca se muestra ningún token. */}
              <dl className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-xs space-y-1.5">
                {[
                  ['Número conectado', result.displayPhoneNumber],
                  ['Phone Number ID', result.phoneNumberId],
                  ['WABA ID', result.wabaId],
                  ['Business ID', result.businessId],
                  ['Recepción de mensajes', result.webhookSubscribed ? 'Activada' : 'Pendiente'],
                ].map(([label, value]) =>
                  value ? (
                    <div key={label} className="flex justify-between gap-3">
                      <dt className="text-slate-500 flex-shrink-0">{label}</dt>
                      <dd className="font-mono text-slate-700 truncate">{value}</dd>
                    </div>
                  ) : null
                )}
              </dl>

              <div className="flex flex-col sm:flex-row gap-2 mt-2.5">
                <Button size="sm" onClick={onConnected}>
                  Asignar a un agente
                </Button>
              </div>
            </>
          )}

          {result && state === 'REQUIRES_ACTION' && (
            <Alert variant="warning" className="mt-3">
              <span className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{result.nextStep}</span>
              </span>
            </Alert>
          )}

          <div className="flex flex-col sm:flex-row gap-2 mt-3">
            <Button onClick={startEmbeddedSignup} loading={busy} disabled={busy}>
              {state === 'CONNECTED' ? 'Conectar otro número' : 'Conectar con Meta'}
            </Button>
            <Button size="md" variant="secondary" onClick={onRequestAssistance}>
              Solicitar asistencia
            </Button>
            <Button size="md" variant="ghost" onClick={onAdvancedSetup}>
              Ya tengo WhatsApp Cloud API
            </Button>
          </div>

          <p className="text-[11px] text-slate-400 mt-3 flex items-start gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            Iniciarás sesión directamente con Meta. Sendwary nunca ve tu contraseña ni tus
            credenciales: se guardan cifradas del lado del servidor.
          </p>
        </div>
      </div>
    </div>
  )
}
