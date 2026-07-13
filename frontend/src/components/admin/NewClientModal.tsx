import { useState, FormEvent } from 'react'
import { CheckCircle2, Copy } from 'lucide-react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Alert from '../ui/Alert'
import api from '../../lib/api'

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder:text-slate-400 transition'

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

type PlanChoice = 'BASIC' | 'PRO' | 'ENTERPRISE' | 'CUSTOM'
type BillingMode = 'MANUAL' | 'CUSTOM' | 'FREE' | 'LEMONSQUEEZY'

interface FormState {
  companyName: string
  industry: string
  ownerFirstName: string
  ownerLastName: string
  ownerEmail: string
  ownerPassword: string
  planChoice: PlanChoice
  billingMode: BillingMode
  customPlanName: string
  customMonthlyPrice: string
  customSetupFee: string
  customMonthlyMessageLimit: string
  customMonthlyTokenLimit: string
  customMaxUsers: string
  customMaxAgents: string
  customMaxWhatsappNumbers: string
  internalNotes: string
}

const emptyForm: FormState = {
  companyName: '',
  industry: '',
  ownerFirstName: '',
  ownerLastName: '',
  ownerEmail: '',
  ownerPassword: '',
  planChoice: 'BASIC',
  billingMode: 'MANUAL',
  customPlanName: '',
  customMonthlyPrice: '',
  customSetupFee: '',
  customMonthlyMessageLimit: '',
  customMonthlyTokenLimit: '',
  customMaxUsers: '',
  customMaxAgents: '',
  customMaxWhatsappNumbers: '',
  internalNotes: '',
}

interface CreatedResult {
  ownerEmail: string
  tempPassword: string | null
}

const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v))

/**
 * Alta manual de clientes (venta directa, sin LemonSqueezy).
 * Plan "Personalizado" usa ENTERPRISE como base + overrides negociados.
 */
export default function NewClientModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<CreatedResult | null>(null)
  const [copied, setCopied] = useState(false)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(f => ({ ...f, [key]: value }))

  const isCustom = form.planChoice === 'CUSTOM'

  const handleClose = () => {
    setForm(emptyForm)
    setCreated(null)
    setError('')
    onClose()
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (isCustom && (!form.customMonthlyPrice.trim() || !form.customMonthlyMessageLimit.trim())) {
      setError('Un plan personalizado requiere mensualidad y límite de mensajes')
      return
    }

    setSaving(true)
    try {
      const result = await api.post<{
        owner: { email: string }
        tempPassword: string | null
      }>('/api/admin/tenants', {
        companyName: form.companyName.trim(),
        industry: form.industry || undefined,
        ownerFirstName: form.ownerFirstName.trim(),
        ownerLastName: form.ownerLastName.trim() || undefined,
        ownerEmail: form.ownerEmail.trim(),
        ownerPassword: form.ownerPassword.trim() || undefined,
        // Personalizado usa ENTERPRISE como plan base
        planCode: isCustom ? 'ENTERPRISE' : form.planChoice,
        billingMode: isCustom && form.billingMode === 'MANUAL' ? 'CUSTOM' : form.billingMode,
        customPlanName: isCustom ? form.customPlanName.trim() || 'Plan personalizado' : undefined,
        customMonthlyPrice: numOrNull(form.customMonthlyPrice),
        customSetupFee: numOrNull(form.customSetupFee),
        customMonthlyMessageLimit: numOrNull(form.customMonthlyMessageLimit),
        customMonthlyTokenLimit: numOrNull(form.customMonthlyTokenLimit),
        customMaxUsers: numOrNull(form.customMaxUsers),
        customMaxAgents: numOrNull(form.customMaxAgents),
        customMaxWhatsappNumbers: numOrNull(form.customMaxWhatsappNumbers),
        internalNotes: form.internalNotes.trim() || undefined,
      })
      setCreated({
        ownerEmail: result?.owner?.email ?? form.ownerEmail.trim(),
        tempPassword: result?.tempPassword ?? null,
      })
      onCreated()
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'Error al crear el cliente')
    } finally {
      setSaving(false)
    }
  }

  const copyCredentials = () => {
    if (!created) return
    const text = `Acceso a Sendwary\nUsuario: ${created.ownerEmail}${created.tempPassword ? `\nContraseña temporal: ${created.tempPassword}` : ''}\nURL: ${window.location.origin}/login`
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <Modal open={open} onClose={handleClose} title="Nuevo cliente" size="xl">
      {created ? (
        // ── Resultado: credenciales del owner (se muestran UNA vez) ──
        <div className="space-y-4">
          <Alert variant="success" title="Cliente creado correctamente">
            La empresa quedó activa con su suscripción manual. No se usó LemonSqueezy.
          </Alert>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-1.5 text-sm">
            <p>
              <span className="text-slate-500">Usuario:</span>{' '}
              <span className="font-medium text-slate-900">{created.ownerEmail}</span>
            </p>
            {created.tempPassword ? (
              <>
                <p>
                  <span className="text-slate-500">Contraseña temporal:</span>{' '}
                  <code className="font-mono font-semibold text-primary-700 bg-primary-50 px-1.5 py-0.5 rounded">
                    {created.tempPassword}
                  </code>
                </p>
                <p className="text-xs text-amber-600">
                  Guárdala ahora: no se volverá a mostrar. El sistema de invitación por email está
                  pendiente.
                </p>
              </>
            ) : (
              <p className="text-xs text-slate-500">
                Se usó la contraseña definida por ti en el formulario.
              </p>
            )}
          </div>
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              icon={copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              onClick={copyCredentials}
            >
              {copied ? 'Copiado' : 'Copiar credenciales'}
            </Button>
            <Button onClick={handleClose}>Cerrar</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && <Alert variant="danger">{error}</Alert>}

          {/* 1. Empresa */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Empresa
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={form.companyName}
                onChange={e => set('companyName', e.target.value)}
                required
                minLength={2}
                placeholder="Nombre de la empresa"
                className={inputClass}
              />
              <select
                value={form.industry}
                onChange={e => set('industry', e.target.value)}
                className={inputClass}
              >
                <option value="">Industria…</option>
                {industries.map(i => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 2. Owner */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Usuario owner
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={form.ownerFirstName}
                onChange={e => set('ownerFirstName', e.target.value)}
                required
                minLength={2}
                placeholder="Nombre"
                className={inputClass}
              />
              <input
                type="text"
                value={form.ownerLastName}
                onChange={e => set('ownerLastName', e.target.value)}
                placeholder="Apellido"
                className={inputClass}
              />
              <input
                type="email"
                value={form.ownerEmail}
                onChange={e => set('ownerEmail', e.target.value)}
                required
                placeholder="correo@cliente.com"
                className={inputClass}
              />
              <input
                type="text"
                value={form.ownerPassword}
                onChange={e => set('ownerPassword', e.target.value)}
                minLength={8}
                placeholder="Contraseña (vacío = generar temporal)"
                className={inputClass}
              />
            </div>
          </div>

          {/* 3. Plan */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Plan</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(
                [
                  { value: 'BASIC', label: 'Básico' },
                  { value: 'PRO', label: 'Pro' },
                  { value: 'ENTERPRISE', label: 'Enterprise' },
                  { value: 'CUSTOM', label: 'Personalizado' },
                ] as { value: PlanChoice; label: string }[]
              ).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => set('planChoice', opt.value)}
                  className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    form.planChoice === opt.value
                      ? 'border-primary-500 bg-primary-50 text-primary-700 ring-1 ring-primary-500'
                      : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {isCustom && (
              <input
                type="text"
                value={form.customPlanName}
                onChange={e => set('customPlanName', e.target.value)}
                placeholder="Nombre comercial del plan (ej: Enterprise Plus)"
                className={`${inputClass} mt-2`}
              />
            )}
          </div>

          {/* 4. Configuración económica */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Configuración económica
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Mensualidad (USD)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.customMonthlyPrice}
                  onChange={e => set('customMonthlyPrice', e.target.value)}
                  placeholder={isCustom ? 'Requerido' : 'Del plan'}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Implementación (USD)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.customSetupFee}
                  onChange={e => set('customSetupFee', e.target.value)}
                  placeholder="Del plan"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Modo de cobro</label>
                <select
                  value={form.billingMode}
                  onChange={e => set('billingMode', e.target.value as BillingMode)}
                  className={inputClass}
                >
                  <option value="MANUAL">Manual (transferencia/acuerdo)</option>
                  <option value="CUSTOM">Custom (acuerdo negociado)</option>
                  <option value="FREE">Gratis</option>
                  <option value="LEMONSQUEEZY">LemonSqueezy (cuando esté activo)</option>
                </select>
              </div>
            </div>
          </div>

          {/* 5. Límites */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Límites {isCustom ? '' : '(vacío = usar los del plan)'}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Mensajes/mes</label>
                <input
                  type="number"
                  min={100}
                  value={form.customMonthlyMessageLimit}
                  onChange={e => set('customMonthlyMessageLimit', e.target.value)}
                  placeholder={isCustom ? 'Req.' : '—'}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Tokens/mes</label>
                <input
                  type="number"
                  min={1000}
                  value={form.customMonthlyTokenLimit}
                  onChange={e => set('customMonthlyTokenLimit', e.target.value)}
                  placeholder="—"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Usuarios</label>
                <input
                  type="number"
                  min={1}
                  value={form.customMaxUsers}
                  onChange={e => set('customMaxUsers', e.target.value)}
                  placeholder="—"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Agentes IA</label>
                <input
                  type="number"
                  min={1}
                  value={form.customMaxAgents}
                  onChange={e => set('customMaxAgents', e.target.value)}
                  placeholder="—"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Números WA</label>
                <input
                  type="number"
                  min={1}
                  value={form.customMaxWhatsappNumbers}
                  onChange={e => set('customMaxWhatsappNumbers', e.target.value)}
                  placeholder="—"
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* 6. Notas internas */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Notas internas (el cliente no las ve)
            </label>
            <textarea
              value={form.internalNotes}
              onChange={e => set('internalNotes', e.target.value)}
              rows={2}
              placeholder="Acuerdo comercial, contacto, condiciones especiales…"
              className={inputClass}
            />
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="secondary" onClick={handleClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" loading={saving}>
              Crear cliente
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
