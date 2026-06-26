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
  const [userModal, setUserModal] = useState(false)
  const [userForm, setUserForm] = useState({ name: '', email: '', role: 'ADMIN', password: '' })
  const [userSaving, setUserSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (!id) return
    api.get<TenantDetail>(`/api/admin/tenants/${id}`).then(data => {
      setTenant(data)
      setPlanId(data.plan)
    }).finally(() => setLoading(false))
  }, [id])

  const changePlan = async () => {
    if (!id || !planId) return
    setSaving(true)
    try {
      await api.put(`/api/admin/tenants/${id}/plan`, { planId })
      setMessage({ type: 'success', text: 'Plan actualizado' })
    } catch {
      setMessage({ type: 'error', text: 'Error al cambiar el plan' })
    } finally { setSaving(false) }
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

      {/* Change plan */}
      <Card>
        <CardHeader title="Cambiar plan" />
        <div className="flex gap-3">
          <input
            className="input flex-1"
            value={planId}
            onChange={e => setPlanId(e.target.value)}
            placeholder="ID o nombre del plan"
          />
          <Button loading={saving} icon={<Save className="h-4 w-4" />} onClick={changePlan}>
            Guardar
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
