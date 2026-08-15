import { useState } from 'react'
import {
  Smartphone, Store, Server, Building2, Sparkles, ChevronLeft, ChevronRight,
  ShieldCheck, Info, CheckCircle2, Lightbulb,
} from 'lucide-react'
import api from '../../lib/api'
import Button from '../ui/Button'
import Alert from '../ui/Alert'
import type { DeclaredNumberType, ReadinessAction, ReadinessAssessment } from './whatsapp.types'

/**
 * Wizard "Preparar número" (paso previo a conectar).
 *
 * Regla de producto: Sendwary NO promete que basta con escribir el número.
 * Aquí el cliente declara dónde vive hoy su número y el backend devuelve una
 * recomendación honesta, sin lenguaje técnico. Solo después se ofrece conectar.
 */

const OPTIONS: {
  value: DeclaredNumberType
  icon: React.ReactNode
  label: string
  hint: string
}[] = [
  {
    value: 'PERSONAL',
    icon: <Smartphone className="h-5 w-5" />,
    label: 'Uso este número en WhatsApp personal',
    hint: 'Es el WhatsApp de siempre, el de tu teléfono.',
  },
  {
    value: 'BUSINESS_APP',
    icon: <Store className="h-5 w-5" />,
    label: 'Uso este número en la app WhatsApp Business',
    hint: 'La app verde para negocios, con catálogo y respuestas rápidas.',
  },
  {
    value: 'CLOUD_API',
    icon: <Server className="h-5 w-5" />,
    label: 'Ya tengo WhatsApp Cloud API',
    hint: 'Tu equipo técnico ya lo configuró con Meta.',
  },
  {
    value: 'OTHER_PROVIDER',
    icon: <Building2 className="h-5 w-5" />,
    label: 'Mi número está con otro proveedor',
    hint: 'Lo usas hoy con otra plataforma de mensajería.',
  },
  {
    value: 'NEW_NUMBER',
    icon: <Sparkles className="h-5 w-5" />,
    label: 'Quiero usar un número nuevo',
    hint: 'Un número dedicado solo para Sendwary. Lo más rápido y seguro.',
  },
]

const ACTION_LABELS: Record<ReadinessAction, string> = {
  USE_NEW_NUMBER: 'Usar un número nuevo',
  REQUEST_ASSISTANCE: 'Solicitar asistencia',
  ADVANCED_SETUP: 'Tengo configuración avanzada',
  CONNECT_WITH_META: 'Conectar con Meta',
  TRY_DEMO: 'Probar con demo',
}

export default function WhatsAppNumberWizard({
  onRequestAssistance,
  onAdvancedSetup,
  onTryDemo,
  onSkip,
}: {
  /** Abre el formulario de asistencia, ya con el contexto del wizard guardado */
  onRequestAssistance: () => void
  onAdvancedSetup: () => void
  onTryDemo: () => void
  /** Volver al selector de métodos (para quien ya sabe lo que quiere) */
  onSkip: () => void
}) {
  const [step, setStep] = useState<1 | 2>(1)
  const [selected, setSelected] = useState<DeclaredNumberType | null>(null)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [currentProvider, setCurrentProvider] = useState('')
  const [notes, setNotes] = useState('')
  const [assessment, setAssessment] = useState<ReadinessAssessment | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const evaluate = async () => {
    if (!selected) return
    setSaving(true)
    setError('')
    try {
      const data = await api.post<{ assessment: ReadinessAssessment }>(
        '/api/integrations/whatsapp/number-readiness',
        {
          declaredNumberType: selected,
          phoneNumber: phoneNumber.trim() || null,
          currentProvider: currentProvider.trim() || null,
          notes: notes.trim() || null,
        }
      )
      setAssessment(data.assessment)
      setStep(2)
    } catch (err: unknown) {
      setError(
        (err as { message?: string })?.message ||
          'No pudimos guardar tu respuesta. Intenta nuevamente.'
      )
    } finally {
      setSaving(false)
    }
  }

  const runAction = (action: ReadinessAction) => {
    switch (action) {
      case 'ADVANCED_SETUP':
        onAdvancedSetup()
        break
      case 'TRY_DEMO':
        onTryDemo()
        break
      case 'USE_NEW_NUMBER':
      case 'REQUEST_ASSISTANCE':
      case 'CONNECT_WITH_META':
      default:
        // Sin Embedded Signup activo, "Conectar con Meta" también pasa por el
        // equipo: nunca mandamos al cliente a un flujo que no existe todavía.
        onRequestAssistance()
        break
    }
  }

  // ── Paso 2: recomendación ──
  if (step === 2 && assessment) {
    const isGoodNews =
      assessment.readiness === 'CLOUD_API_READY' ||
      assessment.readiness === 'NEW_NUMBER_RECOMMENDED'

    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setStep(1)}
          className="text-xs text-primary-600 hover:text-primary-700 inline-flex items-center gap-1"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Cambiar mi respuesta
        </button>

        <div
          className={`rounded-xl border p-5 ${
            isGoodNews ? 'border-emerald-200 bg-emerald-50/60' : 'border-primary-200 bg-primary-50/60'
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                isGoodNews ? 'bg-emerald-100 text-emerald-700' : 'bg-primary-100 text-primary-700'
              }`}
            >
              {isGoodNews ? <CheckCircle2 className="h-5 w-5" /> : <Lightbulb className="h-5 w-5" />}
            </div>
            <div>
              <p className="font-semibold text-slate-900">{assessment.title}</p>
              <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{assessment.message}</p>
            </div>
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">Lo que debes saber</p>
          <ul className="space-y-1.5">
            {assessment.details.map((d, i) => (
              <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                <Info className="h-3.5 w-3.5 mt-1 text-primary-500 flex-shrink-0" />
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <p className="text-xs font-medium text-slate-500 mb-2">¿Cómo quieres continuar?</p>
          <div className="flex flex-col sm:flex-row gap-2">
            {assessment.actions.map((action, i) => (
              <Button
                key={action}
                variant={i === 0 ? 'primary' : 'secondary'}
                className="flex-1"
                onClick={() => runAction(action)}
                icon={i === 0 ? <ChevronRight className="h-4 w-4" /> : undefined}
              >
                {ACTION_LABELS[action]}
              </Button>
            ))}
          </div>
          {assessment.recommendedAction !== 'ADVANCED_SETUP' && (
            <p className="text-[11px] text-slate-400 mt-2">
              Te recomendamos la primera opción. Si tu equipo ya trabaja con la API de WhatsApp,
              puedes usar la configuración avanzada.
            </p>
          )}
        </div>
      </div>
    )
  }

  // ── Paso 1: tipo de número ──
  return (
    <div className="space-y-4">
      <div>
        <p className="font-medium text-slate-900">¿Qué tipo de número quieres usar?</p>
        <p className="text-sm text-slate-500 mt-1">
          Con esto sabremos si tu número está listo o necesita una preparación previa. Es rápido y
          no cambia nada todavía.
        </p>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="space-y-2">
        {OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setSelected(opt.value)}
            className={`w-full flex items-start gap-3 text-left p-3 rounded-xl border transition ${
              selected === opt.value
                ? 'border-primary-400 bg-primary-50/60 ring-1 ring-primary-200'
                : 'border-slate-200 hover:border-primary-300 hover:bg-slate-50'
            }`}
          >
            <div
              className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                selected === opt.value
                  ? 'bg-primary-100 text-primary-600'
                  : 'bg-slate-100 text-slate-400'
              }`}
            >
              {opt.icon}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800">{opt.label}</p>
              <p className="text-xs text-slate-500 mt-0.5">{opt.hint}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Datos complementarios según la opción */}
      {selected && selected !== 'CLOUD_API' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div>
            <label className="text-xs font-medium text-slate-600">
              {selected === 'NEW_NUMBER' ? 'Número que quieres usar (si ya lo tienes)' : 'Tu número'}
            </label>
            <input
              className="input w-full"
              value={phoneNumber}
              onChange={e => setPhoneNumber(e.target.value)}
              placeholder="+1 809 555 1234"
            />
          </div>
          {selected === 'OTHER_PROVIDER' && (
            <div>
              <label className="text-xs font-medium text-slate-600">Proveedor actual</label>
              <input
                className="input w-full"
                value={currentProvider}
                onChange={e => setCurrentProvider(e.target.value)}
                placeholder="Ej.: Twilio, 360dialog, otro"
              />
            </div>
          )}
          <div className={selected === 'OTHER_PROVIDER' ? 'sm:col-span-2' : ''}>
            <label className="text-xs font-medium text-slate-600">Comentarios (opcional)</label>
            <input
              className="input w-full"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Algo que debamos saber sobre tu número"
            />
          </div>
        </div>
      )}

      <Alert variant="info">
        <span className="flex items-start gap-2 text-xs">
          <ShieldCheck className="h-4 w-4 mt-0.5 flex-shrink-0" />
          Nunca te pediremos la contraseña de tu WhatsApp, de Facebook ni capturas con datos
          privados. Sendwary usa exclusivamente la plataforma oficial de WhatsApp Business.
        </span>
      </Alert>

      <div className="flex justify-between items-center">
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-slate-500 hover:text-slate-700"
        >
          Ver todas las formas de conectar
        </button>
        <Button onClick={evaluate} loading={saving} disabled={!selected}>
          Ver mi recomendación
        </Button>
      </div>
    </div>
  )
}
