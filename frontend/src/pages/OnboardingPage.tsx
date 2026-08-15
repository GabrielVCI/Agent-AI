import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Building2, MessageSquare, Target } from 'lucide-react'
import { SendwaryLogo } from '../components/BrandLogo'
import { useAuth } from '../contexts/AuthContext'
import api from '../lib/api'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'

const inputClass =
  'w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder:text-slate-400 transition'

const industries = [
  'Ferretería / Construcción',
  'Salud / Clínica',
  'Belleza / Spa',
  'Restaurante / Comida',
  'Comercio / Retail',
  'Servicios profesionales',
  'Educación',
  'Inmobiliaria',
  'Automotriz',
  'Otro',
]

const messageOptions = [
  { value: 'LT_500', label: 'Menos de 500' },
  { value: 'B_500_1500', label: '500 a 1,500' },
  { value: 'B_1500_5000', label: '1,500 a 5,000' },
  { value: 'GT_5000', label: 'Más de 5,000' },
]

const goalOptions = [
  { value: 'RESPONDER_CLIENTES', label: 'Responder clientes' },
  { value: 'CITAS', label: 'Agendar citas' },
  { value: 'COTIZACIONES', label: 'Generar cotizaciones' },
  { value: 'SOPORTE', label: 'Soporte' },
  { value: 'VENTAS', label: 'Ventas' },
  { value: 'OTRO', label: 'Otro' },
]

interface FormData {
  businessName: string
  industry: string
  monthlyMessages: string
  phoneNumbers: number
  usersNeeded: number
  mainGoal: string
  usesWhatsappBusiness: boolean | null
  needsHumanHandoff: boolean | null
}

function OptionGrid({
  options,
  value,
  onChange,
  columns = 2,
}: {
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
  columns?: number
}) {
  return (
    <div className={`grid gap-2 ${columns === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors text-left ${
            value === opt.value
              ? 'border-primary-500 bg-primary-50 text-primary-700 ring-1 ring-primary-500'
              : 'border-slate-300 text-slate-600 hover:bg-slate-50'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function YesNo({
  value,
  onChange,
}: {
  value: boolean | null
  onChange: (v: boolean) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {[
        { v: true, label: 'Sí' },
        { v: false, label: 'No' },
      ].map(opt => (
        <button
          key={String(opt.v)}
          type="button"
          onClick={() => onChange(opt.v)}
          className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
            value === opt.v
              ? 'border-primary-500 bg-primary-50 text-primary-700 ring-1 ring-primary-500'
              : 'border-slate-300 text-slate-600 hover:bg-slate-50'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export default function OnboardingPage() {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Flujo comercial: primero verificar el correo, después crear la empresa
  if (user && user.emailVerified === false) {
    return <Navigate to="/verificar-correo" replace />
  }

  const [form, setForm] = useState<FormData>({
    businessName: '',
    industry: '',
    monthlyMessages: '',
    phoneNumbers: 1,
    usersNeeded: 1,
    mainGoal: '',
    usesWhatsappBusiness: null,
    needsHumanHandoff: null,
  })

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setForm(f => ({ ...f, [key]: value }))

  const steps = [
    {
      icon: <Building2 className="h-5 w-5" />,
      title: 'Tu negocio',
      valid: form.businessName.trim().length >= 2 && form.industry !== '',
    },
    {
      icon: <MessageSquare className="h-5 w-5" />,
      title: 'Tu operación',
      valid: form.monthlyMessages !== '' && form.phoneNumbers >= 1 && form.usersNeeded >= 1,
    },
    {
      icon: <Target className="h-5 w-5" />,
      title: 'Tu objetivo',
      valid:
        form.mainGoal !== '' &&
        form.usesWhatsappBusiness !== null &&
        form.needsHumanHandoff !== null,
    },
  ]

  const isLast = step === steps.length - 1

  const handleNext = async () => {
    setError('')
    if (!isLast) {
      setStep(s => s + 1)
      return
    }
    setLoading(true)
    try {
      await api.post('/api/onboarding', {
        businessName: form.businessName.trim(),
        industry: form.industry,
        monthlyMessages: form.monthlyMessages,
        phoneNumbers: form.phoneNumbers,
        usersNeeded: form.usersNeeded,
        mainGoal: form.mainGoal,
        usesWhatsappBusiness: form.usesWhatsappBusiness,
        needsHumanHandoff: form.needsHumanHandoff,
      })
      // El backend acaba de asociar el tenant al usuario: recargar la sesión.
      await refreshUser()
      navigate('/', { replace: true })
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e?.message || 'No se pudo guardar la información')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-950 via-primary-900 to-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <SendwaryLogo className="h-12 mx-auto mb-5" />
          <h1 className="text-2xl font-bold text-white">
            ¡Bienvenido{user?.name ? `, ${user.name}` : ''}!
          </h1>
          <p className="text-primary-200/80 text-sm mt-1">
            Cuéntanos de tu negocio para configurar tu espacio de trabajo
          </p>
        </div>

        {/* Barra de progreso */}
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mb-4 max-w-xs mx-auto">
          <div
            className="h-full bg-primary-400 rounded-full transition-all duration-300"
            style={{ width: `${((step + 1) / steps.length) * 100}%` }}
          />
        </div>

        {/* Pasos */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {steps.map((s, i) => (
            <div
              key={s.title}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
                i === step
                  ? 'bg-primary-500 text-white'
                  : i < step
                    ? 'bg-primary-500/30 text-primary-200'
                    : 'bg-white/10 text-slate-400'
              }`}
            >
              {s.icon}
              <span className="hidden sm:inline">{s.title}</span>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {error && (
            <Alert variant="danger" className="mb-4">
              {error}
            </Alert>
          )}

          {step === 0 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Nombre del negocio
                </label>
                <input
                  type="text"
                  value={form.businessName}
                  onChange={e => set('businessName', e.target.value)}
                  placeholder="Ej: Ferretería El Constructor"
                  className={inputClass}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Industria</label>
                <select
                  value={form.industry}
                  onChange={e => set('industry', e.target.value)}
                  className={inputClass}
                >
                  <option value="">Selecciona una industria…</option>
                  {industries.map(i => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  ¿Cuántos mensajes recibes al mes aproximadamente?
                </label>
                <OptionGrid
                  options={messageOptions}
                  value={form.monthlyMessages}
                  onChange={v => set('monthlyMessages', v)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Números de teléfono
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={form.phoneNumbers}
                    onChange={e => set('phoneNumbers', Number(e.target.value))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Usuarios que necesitas
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={form.usersNeeded}
                    onChange={e => set('usersNeeded', Number(e.target.value))}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  ¿Cuál es tu objetivo principal?
                </label>
                <OptionGrid
                  options={goalOptions}
                  value={form.mainGoal}
                  onChange={v => set('mainGoal', v)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  ¿Ya usas WhatsApp Business?
                </label>
                <YesNo
                  value={form.usesWhatsappBusiness}
                  onChange={v => set('usesWhatsappBusiness', v)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  ¿Necesitas que personas de tu equipo intervengan en las conversaciones?
                </label>
                <YesNo value={form.needsHumanHandoff} onChange={v => set('needsHumanHandoff', v)} />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mt-8">
            <Button
              variant="ghost"
              onClick={() => setStep(s => Math.max(0, s - 1))}
              disabled={step === 0 || loading}
              icon={<ArrowLeft className="h-4 w-4" />}
            >
              Atrás
            </Button>
            <Button
              onClick={handleNext}
              loading={loading}
              disabled={!steps[step].valid}
              icon={isLast ? undefined : <ArrowRight className="h-4 w-4" />}
            >
              {isLast ? 'Crear mi espacio' : 'Continuar'}
            </Button>
          </div>
        </div>

        <p className="text-center text-xs text-slate-500 mt-6">
          Podrás ajustar esta información luego en Configuración.
        </p>
      </div>
    </div>
  )
}
