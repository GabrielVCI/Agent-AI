import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2, Circle, Copy, Check, AlertTriangle, ShieldAlert, Loader2,
  MessageSquare, ChevronLeft, ChevronRight, Send, RefreshCw,
} from 'lucide-react'
import api from '../../lib/api'
import { listAgents } from '../../services/agentsApi'
import type { Agent } from '../../types'
import Button from '../ui/Button'
import Badge from '../ui/Badge'
import Alert from '../ui/Alert'
import Modal from '../ui/Modal'

import WhatsAppConnectChoice from './WhatsAppConnectChoice'
import WhatsAppNumberWizard from './WhatsAppNumberWizard'
import {
  whatsappStatusMeta,
  whatsappModeMeta,
  type WhatsAppIntegration,
  type WhatsAppConfigResponse,
} from './whatsapp.types'

export { whatsappStatusMeta }
export type { WhatsAppIntegration, WhatsAppStatus } from './whatsapp.types'

// ─── Utilidades ──────────────────────────────────────────────────────────────

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard denegado: el usuario puede seleccionar el texto manualmente
    }
  }
  return (
    <div>
      <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 break-all select-all">
          {value}
        </code>
        <Button size="sm" variant="outline" onClick={copy} icon={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}>
          {copied ? 'Copiado' : 'Copiar'}
        </Button>
      </div>
    </div>
  )
}

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder:text-slate-400 transition'

const STEPS = ['Requisitos', 'Datos de Meta', 'Webhook', 'Validar', 'Asignar agente'] as const

// ─── Paso 1: requisitos y cumplimiento ───────────────────────────────────────

const REQUIREMENTS = [
  'Tener una cuenta de Meta Business (business.facebook.com).',
  'Tener WhatsApp Business Platform (Cloud API) habilitado en una app de Meta.',
  'Tener un número de teléfono disponible o ya aprobado por Meta.',
  'Tener acceso administrativo al Meta Business Manager.',
]

const COMPLIANCE_WARNINGS = [
  'No uses un número personal que ya esté vinculado a WhatsApp normal sin migrarlo correctamente.',
  'No envíes mensajes masivos sin consentimiento del cliente: Meta puede limitar o bloquear tu cuenta por abuso.',
  'Para iniciar conversaciones fuera de la ventana de 24 horas necesitas plantillas aprobadas por Meta.',
  'No compartas tu access token con nadie. Sendwary lo guarda cifrado y nunca lo vuelve a mostrar.',
  'Usa solo números verificados y aprobados en Meta.',
]

function StepRequirements({ onNext }: { onNext: () => void }) {
  const [checked, setChecked] = useState<boolean[]>(REQUIREMENTS.map(() => false))
  const allChecked = checked.every(Boolean)
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Antes de empezar, confirma que cumples estos requisitos. Si te falta alguno, complétalo
        primero en Meta — una configuración incorrecta puede causar rechazos o bloqueos.
      </p>
      <div className="space-y-2">
        {REQUIREMENTS.map((req, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setChecked(c => c.map((v, j) => (j === i ? !v : v)))}
            className="w-full flex items-start gap-2.5 text-left p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition"
          >
            {checked[i] ? (
              <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
            ) : (
              <Circle className="h-5 w-5 text-slate-300 flex-shrink-0" />
            )}
            <span className="text-sm text-slate-700">{req}</span>
          </button>
        ))}
      </div>
      <Alert variant="warning">
        <div className="flex items-start gap-2">
          <ShieldAlert className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <ul className="text-xs space-y-1 list-disc list-inside">
            {COMPLIANCE_WARNINGS.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      </Alert>
      <div className="flex justify-end">
        <Button onClick={onNext} disabled={!allChecked} icon={<ChevronRight className="h-4 w-4" />}>
          Cumplo los requisitos
        </Button>
      </div>
    </div>
  )
}

// ─── Wizard principal ────────────────────────────────────────────────────────

export default function WhatsAppWizard({
  open,
  onClose,
  onChanged,
}: {
  open: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [step, setStep] = useState(0)
  const [config, setConfig] = useState<WhatsAppConfigResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // 'prepare' = wizard "Preparar número" (entrada por defecto: primero se
  // evalúa si el número puede conectarse); 'choice' = selector de método
  // (guiada / avanzada / demo); 'manual' = wizard Cloud API de 5 pasos.
  const [view, setView] = useState<'prepare' | 'choice' | 'manual'>('prepare')
  // Entrar directo al formulario de asistencia tras la recomendación
  const [choiceView, setChoiceView] = useState<'choice' | 'assisted'>('choice')

  // La UI de esta fase gestiona UNA integración (la primera). El backend ya
  // soporta varias por tenant (lista) para cuando el plan lo habilite.
  const integration = config?.integrations[0] ?? null

  // Paso 2 (form)
  const [phoneNumberId, setPhoneNumberId] = useState('')
  const [businessAccountId, setBusinessAccountId] = useState('')
  const [displayPhoneNumber, setDisplayPhoneNumber] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [graphApiVersion, setGraphApiVersion] = useState('v20.0')
  const [saving, setSaving] = useState(false)

  // Paso 4/5
  const [validating, setValidating] = useState(false)
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [assignDone, setAssignDone] = useState('')
  // Activación explícita del agente al asignarle el número (Parte G)
  const [activateAgent, setActivateAgent] = useState(false)
  const [needsReassign, setNeedsReassign] = useState(false)
  const [testTo, setTestTo] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.get<WhatsAppConfigResponse>('/api/integrations/whatsapp')
      setConfig(data)
      const row = data.integrations[0]
      if (row) {
        // phoneNumberId es null mientras la conexión guiada no tiene número
        setPhoneNumberId(row.phoneNumberId ?? '')
        setBusinessAccountId(row.businessAccountId ?? '')
        setDisplayPhoneNumber(row.displayPhoneNumber ?? '')
        setGraphApiVersion(row.graphApiVersion)
      }
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e?.message || 'No se pudo cargar la configuración de WhatsApp')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      setStep(0)
      setView('prepare')
      setChoiceView('choice')
      setAccessToken('')
      setAssignDone('')
      setTestResult('')
      setNeedsReassign(false)
      load()
      listAgents().then(setAgents).catch(() => setAgents([]))
    }
  }, [open, load])

  // Retomar donde iba: una conexión manual ya empezada entra directo al wizard;
  // guiada o demo se quedan en la vista de estado/selector (no hay nada técnico
  // que el cliente deba hacer).
  useEffect(() => {
    if (!open || loading || !integration) return
    if (integration.mode === 'MANUAL_CLOUD_API' && integration.hasToken) {
      // Configuración avanzada ya empezada: directo al wizard técnico
      setView('manual')
      if (step === 0) setStep(integration.status === 'CONNECTED' ? 4 : 1)
    } else if (integration.declaredNumberType || integration.status === 'CONNECTING') {
      // Ya evaluó su número (o pidió ayuda): no repetir el wizard de preparación
      setView('choice')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, open])

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const data = await api.post<WhatsAppIntegration>('/api/integrations/whatsapp', {
        phoneNumberId: phoneNumberId.trim(),
        businessAccountId: businessAccountId.trim() || null,
        displayPhoneNumber: displayPhoneNumber.trim() || null,
        graphApiVersion,
        // El token solo se manda si el usuario escribió uno nuevo
        ...(accessToken.trim() ? { accessToken: accessToken.trim() } : {}),
      })
      setConfig(c => (c ? { ...c, integrations: [data, ...c.integrations.slice(1)] } : c))
      setAccessToken('')
      onChanged()
      setStep(2)
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e?.message || 'No se pudo guardar la configuración')
    } finally {
      setSaving(false)
    }
  }

  const validate = async () => {
    if (!integration) return
    setValidating(true)
    setError('')
    try {
      const data = await api.post<WhatsAppIntegration>('/api/integrations/whatsapp/validate', {
        integrationId: integration.id,
      })
      setConfig(c => (c ? { ...c, integrations: [data, ...c.integrations.slice(1)] } : c))
      onChanged()
      if (data.status === 'CONNECTED') setStep(4)
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e?.message || 'No se pudo validar la conexión')
    } finally {
      setValidating(false)
    }
  }

  const assign = async (reassign = false) => {
    if (!integration || !selectedAgentId) return
    setAssigning(true)
    setError('')
    setNeedsReassign(false)
    try {
      const data = await api.post<{ agentName: string; active: boolean }>(
        '/api/integrations/whatsapp/assign-agent',
        {
          agentId: selectedAgentId,
          phoneNumberId: integration.phoneNumberId,
          ...(reassign ? { reassign: true } : {}),
          ...(activateAgent ? { activate: true } : {}),
        }
      )
      setAssignDone(
        `Número asignado al agente ${data.agentName}. ${
          data.active
            ? 'El agente está activo y responderá por WhatsApp.'
            : 'El agente sigue inactivo: actívalo cuando quieras que empiece a responder.'
        }`
      )
      onChanged()
      load()
    } catch (err: unknown) {
      const e = err as { message?: string; statusCode?: number }
      if (e?.statusCode === 409 || /ya está asignado/i.test(e?.message ?? '')) {
        setNeedsReassign(true)
        setError(e?.message || 'Este número ya está asignado a otro agente.')
      } else {
        setError(e?.message || 'No se pudo asignar el agente')
      }
    } finally {
      setAssigning(false)
    }
  }

  const sendTest = async () => {
    if (!integration) return
    setTesting(true)
    setError('')
    setTestResult('')
    try {
      await api.post('/api/integrations/whatsapp/test-message', {
        integrationId: integration.id,
        to: testTo.trim(),
      })
      setTestResult('Mensaje de prueba enviado. Revisa el WhatsApp del número de destino.')
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e?.message || 'No se pudo enviar el mensaje de prueba')
    } finally {
      setTesting(false)
    }
  }

  const statusBadge = useMemo(() => {
    const meta = integration ? whatsappStatusMeta[integration.status] : whatsappStatusMeta.NOT_CONFIGURED
    return <Badge variant={meta.variant}>{meta.label}</Badge>
  }, [integration])

  return (
    <Modal open={open} onClose={onClose} title="Conectar WhatsApp Business" size="xl">
      {/* Encabezado: estado + pasos (los pasos solo aplican al modo avanzado) */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary-600" />
          {statusBadge}
          {integration && (
            <span className="text-xs text-slate-500">
              {whatsappModeMeta[integration.mode] ?? integration.mode}
            </span>
          )}
          {integration?.displayPhoneNumber && (
            <span className="text-xs text-slate-500">· {integration.displayPhoneNumber}</span>
          )}
        </div>
        {view === 'manual' && (
          <div className="flex items-center gap-1">
            {STEPS.map((label, i) => (
              <button
                key={label}
                type="button"
                title={label}
                onClick={() => setStep(i)}
                className={`h-2 rounded-full transition-all ${
                  i === step ? 'w-6 bg-primary-600' : 'w-2 bg-slate-300 hover:bg-slate-400'
                }`}
              />
            ))}
          </div>
        )}
      </div>
      {view === 'manual' && (
        <p className="text-xs text-slate-500 mb-3">
          Paso {step + 1} de {STEPS.length}: <strong>{STEPS[step]}</strong>
        </p>
      )}
      {view === 'prepare' && (
        <p className="text-xs text-slate-500 mb-3">
          Preparar número — <strong>antes de conectar, comprobamos si tu número está listo</strong>
        </p>
      )}

      {error && (
        <Alert variant="danger" className="mb-3">
          {error}
        </Alert>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary-500" />
        </div>
      ) : view === 'prepare' ? (
        <WhatsAppNumberWizard
          onRequestAssistance={() => {
            setChoiceView('assisted')
            setView('choice')
            load()
          }}
          onAdvancedSetup={() => {
            setView('manual')
            setStep(0)
          }}
          onTryDemo={() => {
            setChoiceView('choice')
            setView('choice')
          }}
          onSkip={() => {
            setChoiceView('choice')
            setView('choice')
          }}
        />
      ) : view === 'choice' ? (
        <WhatsAppConnectChoice
          capabilities={config?.capabilities ?? null}
          integration={integration}
          initialView={choiceView}
          onChooseManual={() => {
            setView('manual')
            setStep(integration?.status === 'CONNECTED' ? 4 : 0)
          }}
          onDone={() => {
            onChanged()
            load()
          }}
        />
      ) : (
        <>
          {step === 0 && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setView('choice')}
                className="text-xs text-primary-600 hover:text-primary-700 inline-flex items-center gap-1"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Ver otras formas de conectar
              </button>
              <StepRequirements onNext={() => setStep(1)} />
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Copia estos datos desde tu app de Meta:{' '}
                <strong>developers.facebook.com &gt; Tu app &gt; WhatsApp &gt; API Setup</strong>.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600">Phone Number ID *</label>
                  <input
                    className={inputClass}
                    value={phoneNumberId}
                    onChange={e => setPhoneNumberId(e.target.value)}
                    placeholder="p. ej. 106540352242922"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">
                    Business Account ID (opcional)
                  </label>
                  <input
                    className={inputClass}
                    value={businessAccountId}
                    onChange={e => setBusinessAccountId(e.target.value)}
                    placeholder="WhatsApp Business Account ID"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Número mostrado</label>
                  <input
                    className={inputClass}
                    value={displayPhoneNumber}
                    onChange={e => setDisplayPhoneNumber(e.target.value)}
                    placeholder="+1 809 555 1234"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Versión de Graph API</label>
                  <input
                    className={inputClass}
                    value={graphApiVersion}
                    onChange={e => setGraphApiVersion(e.target.value)}
                    placeholder="v20.0"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">
                  Access Token {integration?.hasToken ? '(ya hay uno guardado)' : '*'}
                </label>
                <input
                  className={inputClass}
                  type="password"
                  value={accessToken}
                  onChange={e => setAccessToken(e.target.value)}
                  placeholder={
                    integration?.hasToken
                      ? `Guardado y cifrado (····${integration.tokenLastFour ?? ''}). Pega uno nuevo solo para reemplazarlo.`
                      : 'Pega aquí el token de Meta (se guarda cifrado)'
                  }
                  autoComplete="off"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Usa un token de sistema (System User) permanente, no el token temporal de 24 horas
                  del panel de pruebas. Se cifra al guardarse y nunca se vuelve a mostrar completo.
                </p>
              </div>
              <div className="flex justify-between pt-1">
                <Button variant="secondary" onClick={() => setStep(0)} icon={<ChevronLeft className="h-4 w-4" />}>
                  Atrás
                </Button>
                <Button
                  onClick={save}
                  loading={saving}
                  disabled={!phoneNumberId.trim() || (!accessToken.trim() && !integration?.hasToken)}
                >
                  Guardar y continuar
                </Button>
              </div>
            </div>
          )}

          {step === 2 && integration && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                En tu app de Meta ve a <strong>WhatsApp &gt; Configuration &gt; Webhook</strong> y
                configura exactamente esto:
              </p>
              <CopyField label="Callback URL" value={integration.webhookUrl} />
              <CopyField label="Verify Token" value={integration.verifyToken} />
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">Campos del webhook a suscribir</p>
                <div className="flex gap-2">
                  {(config?.subscribeFields ?? ['messages']).map(f => (
                    <Badge key={f} variant="info">
                      {f}
                    </Badge>
                  ))}
                </div>
              </div>
              {integration.webhookVerifiedAt ? (
                <Alert variant="success">
                  Webhook verificado por Meta el {new Date(integration.webhookVerifiedAt).toLocaleString()}.
                </Alert>
              ) : (
                <Alert variant="info">
                  El webhook todavía no ha sido verificado en Meta. Al guardar la configuración en el
                  panel de Meta, Meta llamará a esta URL y quedará verificado automáticamente.
                </Alert>
              )}
              <div className="flex justify-between pt-1">
                <Button variant="secondary" onClick={() => setStep(1)} icon={<ChevronLeft className="h-4 w-4" />}>
                  Atrás
                </Button>
                <Button onClick={() => setStep(3)} icon={<ChevronRight className="h-4 w-4" />}>
                  Ya configuré el webhook
                </Button>
              </div>
            </div>
          )}

          {step === 3 && integration && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Vamos a comprobar contra Meta que el token es válido y que el Phone Number ID le
                pertenece. No se envía ningún mensaje.
              </p>
              {integration.status === 'CONNECTED' && (
                <Alert variant="success">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Conexión validada{integration.displayPhoneNumber ? ` — número ${integration.displayPhoneNumber}` : ''}
                    {integration.businessName ? ` (${integration.businessName})` : ''}.
                  </span>
                </Alert>
              )}
              {integration.status === 'ERROR' && integration.lastValidationError && (
                <Alert variant="danger">
                  <span className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    {integration.lastValidationError}
                  </span>
                </Alert>
              )}
              {integration.lastValidationAt && (
                <p className="text-xs text-slate-400">
                  Última validación: {new Date(integration.lastValidationAt).toLocaleString()}
                </p>
              )}
              <div className="flex justify-between pt-1">
                <Button variant="secondary" onClick={() => setStep(2)} icon={<ChevronLeft className="h-4 w-4" />}>
                  Atrás
                </Button>
                <div className="flex gap-2">
                  <Button
                    onClick={validate}
                    loading={validating}
                    icon={<RefreshCw className="h-4 w-4" />}
                  >
                    Validar conexión
                  </Button>
                  {integration.status === 'CONNECTED' && (
                    <Button variant="outline" onClick={() => setStep(4)} icon={<ChevronRight className="h-4 w-4" />}>
                      Continuar
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              {!integration || integration.status !== 'CONNECTED' ? (
                <Alert variant="warning">
                  WhatsApp no está conectado todavía. Completa los pasos anteriores y valida la
                  conexión antes de asignar un agente.
                </Alert>
              ) : (
                <>
                  <p className="text-sm text-slate-600">
                    Elige qué agente IA atenderá los mensajes que lleguen al número{' '}
                    <strong>{integration.displayPhoneNumber ?? integration.phoneNumberId}</strong>.
                  </p>
                  {integration.assignedAgents.length > 0 && (
                    <Alert variant="info">
                      Actualmente asignado a: {integration.assignedAgents.map(a => a.name).join(', ')}
                    </Alert>
                  )}
                  <div className="flex gap-2">
                    <select
                      className={inputClass}
                      value={selectedAgentId}
                      onChange={e => setSelectedAgentId(e.target.value)}
                    >
                      <option value="">Selecciona un agente…</option>
                      {agents.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.name} {a.status === 'ACTIVE' ? '' : '(inactivo)'}
                        </option>
                      ))}
                    </select>
                    <Button onClick={() => assign(false)} loading={assigning} disabled={!selectedAgentId}>
                      Asignar
                    </Button>
                  </div>
                  {/* La activación es una decisión explícita: asignar el número
                      NO puede poner al agente a responder sin que se entienda. */}
                  <label className="flex items-start gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      className="mt-0.5 flex-shrink-0"
                      checked={activateAgent}
                      onChange={e => setActivateAgent(e.target.checked)}
                    />
                    <span>
                      ¿Quieres activar este agente para responder por WhatsApp? Si lo dejas sin
                      marcar, el número queda asignado pero el agente no responderá todavía.
                    </span>
                  </label>
                  {needsReassign && (
                    <Alert variant="warning">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span>¿Quieres mover el número al agente seleccionado?</span>
                        <Button size="sm" variant="danger" onClick={() => assign(true)} loading={assigning}>
                          Sí, reasignar
                        </Button>
                      </div>
                    </Alert>
                  )}
                  {assignDone && <Alert variant="success">{assignDone}</Alert>}

                  <div className="border-t border-slate-100 pt-3 mt-2">
                    <p className="text-xs font-medium text-slate-600 mb-1.5">
                      Mensaje de prueba (opcional)
                    </p>
                    <p className="text-[11px] text-slate-400 mb-2">
                      Envía un mensaje fijo de confirmación a TU propio número (formato
                      internacional, ej: 18095551234). No lo uses con números de clientes: si el
                      destinatario nunca ha escrito al negocio, Meta puede rechazarlo (ventana de 24h).
                    </p>
                    <div className="flex gap-2">
                      <input
                        className={inputClass}
                        value={testTo}
                        onChange={e => setTestTo(e.target.value)}
                        placeholder="18095551234"
                      />
                      <Button
                        variant="outline"
                        onClick={sendTest}
                        loading={testing}
                        disabled={!testTo.trim()}
                        icon={<Send className="h-4 w-4" />}
                      >
                        Enviar
                      </Button>
                    </div>
                    {testResult && (
                      <Alert variant="success" className="mt-2">
                        {testResult}
                      </Alert>
                    )}
                  </div>

                  <div className="flex justify-between pt-1">
                    <Button variant="secondary" onClick={() => setStep(3)} icon={<ChevronLeft className="h-4 w-4" />}>
                      Atrás
                    </Button>
                    <Button onClick={onClose}>Finalizar</Button>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </Modal>
  )
}
