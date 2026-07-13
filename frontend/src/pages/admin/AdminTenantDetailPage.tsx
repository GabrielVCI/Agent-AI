import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Ban, CheckCircle, XCircle, UserPlus } from 'lucide-react'
import { AdminTenant } from '../../types'
import api from '../../lib/api'
import { Card, CardHeader } from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Alert from '../../components/ui/Alert'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import TenantVoiceCard from '../../components/admin/TenantVoiceCard'

interface TenantDetail extends AdminTenant {
  usedConversations: number
  usedAudioMinutes: number
  recentErrors?: string[]
}

export default function AdminTenantDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [tenant, setTenant] = useState<TenantDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [planId, setPlanId] = useState('')
  const [plans, setPlans] = useState<{ id: string; code: string | null; name: string; monthlyMessageLimit: number }[]>([])
  const [customLimit, setCustomLimit] = useState('')
  const [customPrice, setCustomPrice] = useState('')
  const [customSetup, setCustomSetup] = useState('')
  const [billingMode, setBillingMode] = useState('MANUAL')
  const [paymentStatus, setPaymentStatus] = useState('PENDING')
  const [internalNotes, setInternalNotes] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [userModal, setUserModal] = useState(false)
  const [userForm, setUserForm] = useState({ name: '', email: '', role: 'ADMIN', password: '' })
  const [userSaving, setUserSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (!id) return
    api.get<TenantDetail>(`/api/admin/tenants/${id}`).then(data => {
      setTenant(data)
      // Precargar editor de suscripción con los valores actuales
      const raw = data as unknown as Record<string, any>
      const sub = raw.subscription ?? {}
      if (sub.planId) setPlanId(String(sub.planId))
      if (sub.billingMode) setBillingMode(String(sub.billingMode))
      if (sub.paymentStatus) setPaymentStatus(String(sub.paymentStatus))
      if (sub.customMonthlyMessageLimit != null) setCustomLimit(String(sub.customMonthlyMessageLimit))
      if (sub.customMonthlyPrice != null) setCustomPrice(String(sub.customMonthlyPrice))
      if (sub.customSetupFee != null) setCustomSetup(String(sub.customSetupFee))
      if (raw.internalNotes) setInternalNotes(String(raw.internalNotes))
    }).finally(() => setLoading(false))
    // Catálogo de planes activos para el selector
    api
      .get<{ id: string; code: string | null; name: string; monthlyMessageLimit: number }[]>(
        '/api/billing/plans'
      )
      .then(list => setPlans(Array.isArray(list) ? list : []))
      .catch(() => setPlans([]))
  }, [id])

  const saveSubscription = async () => {
    if (!id || !planId) return
    setSaving(true)
    try {
      await api.put(`/api/admin/tenants/${id}/subscription`, {
        planId,
        billingMode,
        paymentStatus,
        // Vacío limpia el override y vuelve al valor del plan
        customMonthlyMessageLimit: customLimit.trim() ? Number(customLimit) : null,
        customMonthlyPrice: customPrice.trim() ? Number(customPrice) : null,
        customSetupFee: customSetup.trim() ? Number(customSetup) : null,
      })
      setMessage({ type: 'success', text: 'Suscripción actualizada' })
    } catch (err: unknown) {
      setMessage({
        type: 'error',
        text: (err as { message?: string })?.message || 'Error al actualizar la suscripción',
      })
    } finally { setSaving(false) }
  }

  const saveNotes = async () => {
    if (!id) return
    setNotesSaving(true)
    try {
      await api.put(`/api/admin/tenants/${id}`, { internalNotes: internalNotes.trim() || null })
      setMessage({ type: 'success', text: 'Notas guardadas' })
    } catch (err: unknown) {
      setMessage({ type: 'error', text: (err as { message?: string })?.message || 'Error al guardar notas' })
    } finally { setNotesSaving(false) }
  }

  const resetUsage = async () => {
    if (!id || !window.confirm('¿Resetear el contador de uso del mes en curso? (solo para pruebas)')) return
    setResetting(true)
    try {
      await api.post(`/api/admin/tenants/${id}/reset-usage`)
      const data = await api.get<TenantDetail>(`/api/admin/tenants/${id}`)
      setTenant(data)
      setMessage({ type: 'success', text: 'Uso del mes reseteado' })
    } catch (err: unknown) {
      setMessage({ type: 'error', text: (err as { message?: string })?.message || 'Error al resetear uso' })
    } finally { setResetting(false) }
  }

  const action = async (endpoint: string) => {
    if (!id) return
    try {
      await api.post(`/api/admin/tenants/${id}/${endpoint}`)
      const data = await api.get<TenantDetail>(`/api/admin/tenants/${id}`)
      setTenant(data)
      setMessage({ type: 'success', text: 'Operación realizada' })
    } catch {
      setMessage({ type: 'error', text: 'Error en la operación' })
    }
  }

  const createUser = async () => {
    if (!id || !userForm.email || !userForm.name) return
    setUserSaving(true)
    try {
      await api.post(`/api/admin/tenants/${id}/users`, userForm)
      setUserModal(false)
      setUserForm({ name: '', email: '', role: 'ADMIN', password: '' })
      setMessage({ type: 'success', text: 'Usuario creado' })
    } catch (err: unknown) {
      const e = err as { message?: string }
      setMessage({ type: 'error', text: e?.message || 'Error' })
    } finally { setUserSaving(false) }
  }

  if (loading) return <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>
  if (!tenant) return <div className="p-6 text-slate-500">Cliente no encontrado</div>

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/admin/clientes')} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{tenant.name}</h2>
          <p className="text-sm text-slate-500">{tenant.email}</p>
        </div>
        <div className="ml-auto">
          <Badge variant={
            tenant.status === 'ACTIVE' ? 'success'
            : tenant.status === 'SUSPENDED' ? 'warning'
            : tenant.status === 'TRIALING' ? 'info'
            : 'danger'
          }>
            {tenant.status}
          </Badge>
        </div>
      </div>

      {message && <Alert variant={message.type === 'success' ? 'success' : 'danger'}>{message.text}</Alert>}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <p className="text-xs text-slate-500">Agentes activos</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{tenant.agentsCount}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">Números</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{tenant.connectedNumbers}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">Conversaciones</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{tenant.usedConversations}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">Minutos audio</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{tenant.usedAudioMinutes}</p>
        </Card>
      </div>

      {/* Info */}
      <Card>
        <CardHeader title="Información" />
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-slate-500">Creado</p>
            <p className="font-medium">{new Date(tenant.createdAt).toLocaleDateString('es')}</p>
          </div>
          <div>
            <p className="text-slate-500">Último acceso</p>
            <p className="font-medium">{tenant.lastAccessAt ? new Date(tenant.lastAccessAt).toLocaleDateString('es') : '—'}</p>
          </div>
          <div>
            <p className="text-slate-500">Plan</p>
            <p className="font-medium">{tenant.plan}</p>
          </div>
        </div>
      </Card>

      {/* Suscripción: plan, modo de cobro y condiciones negociadas */}
      <Card>
        <CardHeader
          title="Suscripción"
          description="Plan, cobro manual y condiciones negociadas (vacío = usar el valor del plan)"
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-1">
            <label className="block text-xs text-slate-500 mb-1">Plan base</label>
            <select className="input w-full" value={planId} onChange={e => setPlanId(e.target.value)}>
              <option value="">Selecciona un plan…</option>
              {plans.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.monthlyMessageLimit.toLocaleString()} msg/mes)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Modo de cobro</label>
            <select className="input w-full" value={billingMode} onChange={e => setBillingMode(e.target.value)}>
              <option value="MANUAL">Manual</option>
              <option value="CUSTOM">Custom</option>
              <option value="FREE">Gratis</option>
              <option value="LEMONSQUEEZY">LemonSqueezy</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Estado de pago</label>
            <select className="input w-full" value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)}>
              <option value="NOT_REQUIRED">No requerido</option>
              <option value="PENDING">Pendiente</option>
              <option value="PAID">Pagado</option>
              <option value="OVERDUE">Atrasado</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Mensualidad custom (USD)</label>
            <input
              className="input w-full"
              type="number"
              min={0}
              step="0.01"
              value={customPrice}
              onChange={e => setCustomPrice(e.target.value)}
              placeholder="Del plan"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Implementación custom (USD)</label>
            <input
              className="input w-full"
              type="number"
              min={0}
              step="0.01"
              value={customSetup}
              onChange={e => setCustomSetup(e.target.value)}
              placeholder="Del plan"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Límite mensajes custom</label>
            <input
              className="input w-full"
              type="number"
              min={100}
              value={customLimit}
              onChange={e => setCustomLimit(e.target.value)}
              placeholder="Del plan"
            />
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <Button loading={saving} disabled={!planId} icon={<Save className="h-4 w-4" />} onClick={saveSubscription}>
            Guardar suscripción
          </Button>
        </div>
      </Card>

      {/* Uso del mes */}
      <Card>
        <CardHeader
          title="Uso del mes"
          action={
            <Button size="sm" variant="ghost" loading={resetting} onClick={resetUsage}>
              Resetear uso
            </Button>
          }
        />
        {(() => {
          const usage = (tenant as unknown as Record<string, any>).monthlyUsage ?? {}
          const total = Number(usage.totalMessages ?? 0)
          const limit = Number(usage.messageLimit ?? 0)
          const pct = limit > 0 ? Math.min(100, Math.round((total / limit) * 100)) : 0
          return (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>
                  {total.toLocaleString()} / {limit > 0 ? limit.toLocaleString() : '∞'} mensajes
                </span>
                <span className={usage.exceeded ? 'text-red-600 font-semibold' : 'text-slate-500'}>
                  {pct}%{usage.exceeded ? ' — límite alcanzado' : ''}
                </span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${usage.exceeded ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-primary-600'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-xs text-slate-400">
                {Number(usage.inboundMessages ?? 0).toLocaleString()} recibidos ·{' '}
                {Number(usage.outboundMessages ?? 0).toLocaleString()} enviados ·{' '}
                {Number(usage.aiTotalTokens ?? 0).toLocaleString()} tokens IA
              </p>
            </div>
          )
        })()}
      </Card>

      {/* Llamadas IA (config + uso + reset) */}
      {id && <TenantVoiceCard tenantId={id} />}

      {/* Notas internas comerciales */}
      <Card>
        <CardHeader title="Notas internas" description="Solo visibles para SUPER_ADMIN" />
        <textarea
          className="input w-full"
          rows={3}
          value={internalNotes}
          onChange={e => setInternalNotes(e.target.value)}
          placeholder="Acuerdo comercial, condiciones, contactos…"
        />
        <div className="flex justify-end mt-3">
          <Button size="sm" variant="outline" loading={notesSaving} onClick={saveNotes}>
            Guardar notas
          </Button>
        </div>
      </Card>

      {/* Actions */}
      <Card>
        <CardHeader title="Acciones" />
        <div className="flex flex-wrap gap-3">
          {tenant.status === 'ACTIVE' && (
            <Button variant="outline" icon={<Ban className="h-4 w-4" />} onClick={() => action('suspend')}>
              Suspender
            </Button>
          )}
          {tenant.status === 'SUSPENDED' && (
            <Button variant="outline" icon={<CheckCircle className="h-4 w-4" />} onClick={() => action('reactivate')}>
              Reactivar
            </Button>
          )}
          {tenant.status !== 'CANCELLED' && (
            <Button variant="danger" icon={<XCircle className="h-4 w-4" />} onClick={() => action('cancel')}>
              Cancelar cuenta
            </Button>
          )}
          <Button variant="secondary" icon={<UserPlus className="h-4 w-4" />} onClick={() => setUserModal(true)}>
            Crear usuario
          </Button>
        </div>
      </Card>

      {tenant.recentErrors && tenant.recentErrors.length > 0 && (
        <Card>
          <CardHeader title="Errores recientes" />
          <ul className="space-y-1">
            {tenant.recentErrors.map((e, i) => (
              <li key={i} className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{e}</li>
            ))}
          </ul>
        </Card>
      )}

      {/* Create user modal */}
      <Modal open={userModal} onClose={() => setUserModal(false)} title="Crear usuario" size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">Nombre *</label>
            <input className="input" value={userForm.name} onChange={e => setUserForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div>
            <label className="label">Correo *</label>
            <input type="email" className="input" value={userForm.email} onChange={e => setUserForm(p => ({ ...p, email: e.target.value }))} />
          </div>
          <div>
            <label className="label">Rol</label>
            <select className="input" value={userForm.role} onChange={e => setUserForm(p => ({ ...p, role: e.target.value }))}>
              <option value="ADMIN">ADMIN</option>
              <option value="AGENT_OPERATOR">AGENT_OPERATOR</option>
              <option value="BILLING">BILLING</option>
            </select>
          </div>
          <div>
            <label className="label">Contraseña temporal</label>
            <input type="password" className="input" value={userForm.password} onChange={e => setUserForm(p => ({ ...p, password: e.target.value }))} />
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setUserModal(false)} className="flex-1">Cancelar</Button>
            <Button loading={userSaving} onClick={createUser} className="flex-1">Crear</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
