import { useEffect, useState } from 'react'
import { Building2, Upload } from 'lucide-react'
import { Company } from '../types'
import api from '../lib/api'
import { Card, CardHeader } from '../components/ui/Card'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'
import LoadingSpinner from '../components/ui/LoadingSpinner'

const industries = [
  'Retail', 'Servicios', 'Salud', 'Educación', 'Tecnología',
  'Inmobiliario', 'Turismo y Hotelería', 'Manufactura', 'Gastronomía',
  'Logística', 'Construcción', 'Otro',
]

const timezones = [
  'America/Santo_Domingo', 'America/New_York', 'America/Chicago',
  'America/Denver', 'America/Los_Angeles', 'America/Bogota',
  'America/Lima', 'America/Santiago', 'America/Buenos_Aires',
  'Europe/Madrid', 'UTC',
]

export default function CompanyPage() {
  const [company, setCompany] = useState<Company | null>(null)
  const [form, setForm] = useState<Partial<Company>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    api.get<Company>('/api/company/me').then(data => {
      setCompany(data)
      setForm(data)
    }).finally(() => setLoading(false))
  }, [])

  const set = (key: keyof Company, val: string) => setForm(p => ({ ...p, [key]: val }))

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const updated = await api.put<Company>('/api/company/me', form)
      setCompany(updated)
      setForm(updated)
      setMessage({ type: 'success', text: 'Información actualizada correctamente' })
    } catch (err: unknown) {
      const e = err as { message?: string }
      setMessage({ type: 'error', text: e?.message || 'Error al guardar' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>
  }

  return (
    <div className="p-4 lg:p-6 max-w-screen-xl mx-auto w-full space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary-100 flex items-center justify-center">
            <Building2 className="h-5 w-5 text-primary-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Empresa</h2>
            <p className="text-sm text-slate-500">Información y datos de tu empresa</p>
          </div>
        </div>
        {/* Acciones siempre visibles arriba: no hay que bajar hasta el final para guardar */}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setForm(company || {})}>Descartar</Button>
          <Button loading={saving} onClick={handleSave} icon={<Upload className="h-4 w-4" />}>
            Guardar cambios
          </Button>
        </div>
      </div>

      {message && (
        <Alert variant={message.type === 'success' ? 'success' : 'danger'}>
          {message.text}
        </Alert>
      )}

      <Card>
        <CardHeader title="Información general" />
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div>
              <label className="label">Nombre comercial</label>
              <input className="input" value={form.name || ''} onChange={e => set('name', e.target.value)} placeholder="Nombre de la empresa" />
            </div>
            <div>
              <label className="label">Razón social</label>
              <input className="input" value={form.legalName || ''} onChange={e => set('legalName', e.target.value)} placeholder="Razón legal" />
            </div>
            <div>
              <label className="label">RNC / Identificación fiscal</label>
              <input className="input" value={form.rnc || ''} onChange={e => set('rnc', e.target.value)} placeholder="000-00000-0" />
            </div>
            <div>
              <label className="label">Teléfono</label>
              <input className="input" value={form.phone || ''} onChange={e => set('phone', e.target.value)} placeholder="+1 809 000 0000" />
            </div>
            <div>
              <label className="label">Correo electrónico</label>
              <input type="email" className="input" value={form.email || ''} onChange={e => set('email', e.target.value)} placeholder="info@empresa.com" />
            </div>
            <div>
              <label className="label">Sitio web</label>
              <input type="url" className="input" value={form.website || ''} onChange={e => set('website', e.target.value)} placeholder="https://..." />
            </div>
            <div>
              <label className="label">Industria</label>
              <select className="input" value={form.industry || ''} onChange={e => set('industry', e.target.value)}>
                <option value="">Seleccionar...</option>
                {industries.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Zona horaria</label>
              <select className="input" value={form.timezone || ''} onChange={e => set('timezone', e.target.value)}>
                <option value="">Seleccionar...</option>
                {timezones.map(tz => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Dirección</label>
            <input className="input" value={form.address || ''} onChange={e => set('address', e.target.value)} placeholder="Calle, ciudad, país" />
          </div>
          <div>
            <label className="label">Descripción de la empresa</label>
            <textarea className="input resize-none" rows={3} value={form.description || ''} onChange={e => set('description', e.target.value)} placeholder="¿Qué hace tu empresa?" />
          </div>
        </div>
      </Card>

      {/* Redes y logo lado a lado en desktop: menos espacio vacío */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <Card>
          <CardHeader title="Redes sociales" description="Opcional" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(['instagram', 'facebook', 'twitter', 'linkedin'] as const).map(net => (
              <div key={net}>
                <label className="label capitalize">{net}</label>
                <input
                  className="input"
                  value={form.socialMedia?.[net] || ''}
                  onChange={e => setForm(p => ({
                    ...p,
                    socialMedia: { ...(p.socialMedia || {}), [net]: e.target.value },
                  }))}
                  placeholder={`https://${net}.com/...`}
                />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Logo" description="Imagen representativa de tu empresa" />
          <div className="flex items-center gap-4">
            {form.logoUrl ? (
              <img src={form.logoUrl} alt="Logo" className="h-16 w-16 rounded-xl object-cover border border-slate-200" />
            ) : (
              <div className="h-16 w-16 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                <Building2 className="h-7 w-7 text-slate-400" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <label className="label">URL del logo</label>
              <input className="input" value={form.logoUrl || ''} onChange={e => set('logoUrl', e.target.value)} placeholder="https://..." />
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
