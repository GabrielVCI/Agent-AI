import { useState } from 'react'
import {
  Sparkles, Wrench, FlaskConical, ChevronRight, ShieldCheck, Clock,
  CheckCircle2, Circle, AlertTriangle,
} from 'lucide-react'
import api from '../../lib/api'
import Button from '../ui/Button'
import Alert from '../ui/Alert'
import EmbeddedSignupPanel from './EmbeddedSignupPanel'
import type { WhatsAppCapabilities, WhatsAppIntegration } from './whatsapp.types'

/**
 * Selector de método de conexión (Parte D/E): el cliente estándar elige entre
 * conexión guiada, configuración avanzada o demo. La opción recomendada es la
 * guiada — nadie debería tener que crear una app en Meta Developers para
 * empezar a usar Sendwary.
 */

const ASSISTED_CHECKLIST = [
  { key: 'hasMetaBusinessAccount' as const, label: 'Tengo (o puedo crear) una cuenta de Meta Business' },
  { key: 'hasAdminAccess' as const, label: 'Tengo acceso de administrador al negocio' },
  { key: 'hasAvailableNumber' as const, label: 'Tengo un número de teléfono disponible para WhatsApp' },
]

function OptionCard({
  icon,
  title,
  description,
  badge,
  badgeTone = 'primary',
  disabled,
  disabledReason,
  cta,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  description: string
  badge?: string
  badgeTone?: 'primary' | 'slate' | 'amber'
  disabled?: boolean
  disabledReason?: string
  cta: string
  onClick: () => void
}) {
  const toneClass =
    badgeTone === 'primary'
      ? 'bg-primary-100 text-primary-700'
      : badgeTone === 'amber'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-slate-100 text-slate-600'

  return (
    <div
      className={`rounded-xl border p-4 transition ${
        disabled
          ? 'border-slate-200 bg-slate-50/60 opacity-75'
          : 'border-slate-200 hover:border-primary-300 hover:shadow-sm bg-white'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            disabled ? 'bg-slate-100 text-slate-400' : 'bg-primary-50 text-primary-600'
          }`}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-slate-900">{title}</p>
            {badge && (
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${toneClass}`}>
                {badge}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">{description}</p>
          {disabled && disabledReason && (
            <p className="text-xs text-amber-600 mt-1.5">{disabledReason}</p>
          )}
          <div className="mt-3">
            <Button
              size="sm"
              variant={disabled ? 'secondary' : 'primary'}
              disabled={disabled}
              onClick={onClick}
              icon={<ChevronRight className="h-3.5 w-3.5" />}
            >
              {cta}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function WhatsAppConnectChoice({
  capabilities,
  integration,
  initialView = 'choice',
  onChooseManual,
  onDone,
}: {
  capabilities: WhatsAppCapabilities | null
  integration: WhatsAppIntegration | null
  /** 'assisted' entra directo al formulario (viene del wizard de preparación) */
  initialView?: 'choice' | 'assisted'
  onChooseManual: () => void
  onDone: () => void
}) {
  const [view, setView] = useState<'choice' | 'assisted'>(initialView)
  const [checklist, setChecklist] = useState<Record<string, boolean>>({})
  const [form, setForm] = useState({
    businessName: '',
    contactPhone: '',
    // Si ya declaró un número en el wizard de preparación, el backend lo tiene:
    // aquí solo se pide de nuevo si hiciera falta.
    desiredNumber: '',
    notes: '',
  })
  const [busy, setBusy] = useState<'assisted' | 'demo' | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const easy = capabilities?.easyOnboarding
  const demo = capabilities?.demoSandbox
  const embeddedActive = Boolean(capabilities?.embeddedSignup?.enabled)
  const alreadyRequested = Boolean(integration?.assistedSetupRequestedAt)

  const submitAssisted = async () => {
    setBusy('assisted')
    setError('')
    try {
      await api.post('/api/integrations/whatsapp/request-assisted-setup', {
        businessName: form.businessName.trim() || null,
        contactPhone: form.contactPhone.trim() || null,
        desiredNumber: form.desiredNumber.trim() || null,
        notes: form.notes.trim() || null,
        hasMetaBusinessAccount: Boolean(checklist.hasMetaBusinessAccount),
        hasAdminAccess: Boolean(checklist.hasAdminAccess),
        hasAvailableNumber: Boolean(checklist.hasAvailableNumber),
      })
      setSuccess(
        'Solicitud enviada. El equipo de Sendwary te contactará para conectar tu WhatsApp Business.'
      )
      onDone()
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'No se pudo enviar la solicitud')
    } finally {
      setBusy(null)
    }
  }

  const enableDemo = async () => {
    setBusy('demo')
    setError('')
    try {
      await api.post('/api/integrations/whatsapp/demo')
      setSuccess('Modo demo activado. Recuerda: es solo para pruebas, no para atender clientes reales.')
      onDone()
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'No se pudo activar el modo demo')
    } finally {
      setBusy(null)
    }
  }

  if (success) {
    return (
      <div className="text-center py-6">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="h-7 w-7 text-emerald-600" />
        </div>
        <p className="text-slate-700 max-w-md mx-auto">{success}</p>
      </div>
    )
  }

  // ── Formulario de conexión guiada (asistida) ──
  if (view === 'assisted') {
    return (
      <div className="space-y-4">
        <div>
          <p className="text-sm text-slate-600">
            Nuestro equipo se encarga de la parte técnica. Confirma qué tienes listo y cuéntanos
            cómo contactarte:
          </p>
        </div>

        {error && <Alert variant="danger">{error}</Alert>}

        <div className="space-y-2">
          {ASSISTED_CHECKLIST.map(item => (
            <button
              key={item.key}
              type="button"
              onClick={() => setChecklist(c => ({ ...c, [item.key]: !c[item.key] }))}
              className="w-full flex items-start gap-2.5 text-left p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition"
            >
              {checklist[item.key] ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
              ) : (
                <Circle className="h-5 w-5 text-slate-300 flex-shrink-0" />
              )}
              <span className="text-sm text-slate-700">{item.label}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400">
          Si te falta alguno, envía la solicitud igual: te ayudamos a resolverlo.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-600">Nombre comercial</label>
            <input
              className="input w-full"
              value={form.businessName}
              onChange={e => setForm(f => ({ ...f, businessName: e.target.value }))}
              placeholder="Como quieres que te vean tus clientes"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Teléfono de contacto</label>
            <input
              className="input w-full"
              value={form.contactPhone}
              onChange={e => setForm(f => ({ ...f, contactPhone: e.target.value }))}
              placeholder="Para coordinar la configuración"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-slate-600">
              Número que quieres usar en WhatsApp (opcional)
            </label>
            <input
              className="input w-full"
              value={form.desiredNumber}
              onChange={e => setForm(f => ({ ...f, desiredNumber: e.target.value }))}
              placeholder="+1 809 555 1234"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-slate-600">Comentarios (opcional)</label>
            <textarea
              className="input w-full"
              rows={2}
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Horarios para contactarte, dudas, detalles de tu negocio…"
            />
          </div>
        </div>

        <Alert variant="info">
          <span className="flex items-start gap-2 text-xs">
            <ShieldCheck className="h-4 w-4 mt-0.5 flex-shrink-0" />
            Sendwary usa exclusivamente la plataforma oficial de WhatsApp Business. Nunca te
            pediremos la contraseña de tu WhatsApp personal ni usaremos métodos no oficiales.
          </span>
        </Alert>

        <div className="flex justify-between">
          <Button variant="secondary" onClick={() => setView('choice')}>
            Atrás
          </Button>
          <Button onClick={submitAssisted} loading={busy === 'assisted'}>
            {alreadyRequested ? 'Actualizar solicitud' : 'Solicitar conexión guiada'}
          </Button>
        </div>
      </div>
    )
  }

  // ── Selector de método ──
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Elige cómo quieres conectar tu WhatsApp Business. La mayoría de los negocios eligen la
        conexión guiada.
      </p>

      {error && <Alert variant="danger">{error}</Alert>}

      {/* Conexión recomendada: Embedded Signup oficial de Meta.
          Si no está habilitado, el panel muestra el fallback de asistencia. */}
      <EmbeddedSignupPanel
        capabilities={capabilities}
        integration={integration}
        onRequestAssistance={() => setView('assisted')}
        onAdvancedSetup={onChooseManual}
        onConnected={onDone}
      />

      {alreadyRequested && integration?.status === 'CONNECTING' && (
        <Alert variant="info">
          <span className="flex items-start gap-2">
            <Clock className="h-4 w-4 mt-0.5 flex-shrink-0" />
            Ya solicitaste la conexión guiada. Nuestro equipo está trabajando en ella y te
            contactará; puedes actualizar tus datos cuando quieras.
          </span>
        </Alert>
      )}

      {/* Con Embedded Signup activo, la vía asistida pasa a ser el respaldo
          (el panel de arriba ya es la opción recomendada). */}
      <OptionCard
        icon={<Sparkles className="h-5 w-5" />}
        title={embeddedActive ? 'Conexión asistida por el equipo' : 'Conexión guiada'}
        description={
          embeddedActive
            ? 'Si prefieres que lo hagamos por ti, nuestro equipo configura tu número contigo.'
            : 'Recomendado para la mayoría de negocios. Conecta tu WhatsApp Business siguiendo un proceso simple: nuestro equipo se encarga de la parte técnica.'
        }
        badge={embeddedActive ? 'Con ayuda' : 'Recomendado'}
        badgeTone={embeddedActive ? 'slate' : 'primary'}
        disabled={!easy?.enabled}
        disabledReason={!easy?.enabled ? 'Temporalmente no disponible. Usa la configuración avanzada.' : undefined}
        cta={alreadyRequested ? 'Ver mi solicitud' : 'Solicitar asistencia'}
        onClick={() => setView('assisted')}
      />

      <OptionCard
        icon={<Wrench className="h-5 w-5" />}
        title="Configuración avanzada"
        description="Para negocios que ya tienen WhatsApp Cloud API configurado en Meta y quieren pegar sus credenciales."
        badge="Avanzado"
        badgeTone="slate"
        cta="Configurar manualmente"
        onClick={onChooseManual}
      />

      <OptionCard
        icon={<FlaskConical className="h-5 w-5" />}
        title="Modo demo"
        description={`Prueba Sendwary con un número demo antes de conectar tu número real.${
          demo?.messageLimit ? ` Límite: ${demo.messageLimit} mensajes.` : ''
        }`}
        badge="Solo pruebas"
        badgeTone="amber"
        disabled={!demo?.enabled}
        disabledReason={
          !demo?.enabled ? 'El modo demo no está habilitado en este entorno.' : undefined
        }
        cta={busy === 'demo' ? 'Activando…' : 'Probar con demo'}
        onClick={enableDemo}
      />

      <Alert variant="warning">
        <span className="flex items-start gap-2 text-xs">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>
            <strong>Reglas de WhatsApp Business:</strong> escribe solo a personas que te
            contactaron o dieron su consentimiento, usa plantillas aprobadas fuera de la ventana de
            24 horas y mantén los datos de tu negocio correctos. El incumplimiento puede hacer que
            Meta limite o bloquee tu número.
          </span>
        </span>
      </Alert>
    </div>
  )
}
