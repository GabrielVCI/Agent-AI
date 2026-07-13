import { useCallback, useEffect, useState } from 'react'
import { Phone, Save } from 'lucide-react'
import { Card, CardHeader } from '../ui/Card'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import Alert from '../ui/Alert'
import LoadingSpinner from '../ui/LoadingSpinner'
import api from '../../lib/api'
import { VoiceEntitlement, VoiceCall } from '../../services/voiceApi'

interface VoiceSettings {
  enabled: boolean
  minutesPerUser: number
  monthlyMinutesLimit: number | null
}

interface AdminVoiceData {
  settings: VoiceSettings
  entitlement: VoiceEntitlement
  recentCalls: VoiceCall[]
}

/** Configuración y uso de llamadas IA de un cliente (solo SUPER_ADMIN). */
export default function TenantVoiceCard({ tenantId }: { tenantId: string }) {
  const [data, setData] = useState<AdminVoiceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Editor
  const [enabled, setEnabled] = useState(false)
  const [minutesPerUser, setMinutesPerUser] = useState('180')
  const [monthlyLimit, setMonthlyLimit] = useState('')

  const load = useCallback(async () => {
    try {
      const result = await api.get<AdminVoiceData>(`/api/admin/tenants/${tenantId}/voice`)
      setData(result ?? null)
      if (result?.settings) {
        setEnabled(Boolean(result.settings.enabled))
        setMinutesPerUser(String(result.settings.minutesPerUser ?? 180))
        setMonthlyLimit(
          result.settings.monthlyMinutesLimit != null ? String(result.settings.monthlyMinutesLimit) : ''
        )
      }
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => {
    load()
  }, [load])

  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      await api.put(`/api/admin/tenants/${tenantId}/voice`, {
        enabled,
        minutesPerUser: Number(minutesPerUser) || 180,
        monthlyMinutesLimit: monthlyLimit.trim() ? Number(monthlyLimit) : null,
      })
      setMessage({ type: 'success', text: 'Configuración de voz guardada' })
      await load()
    } catch (err: unknown) {
      setMessage({
        type: 'error',
        text: (err as { message?: string })?.message || 'Error al guardar',
      })
    } finally {
      setSaving(false)
    }
  }

  const resetUsage = async () => {
    if (!window.confirm('¿Resetear los minutos de voz del mes en curso? (solo pruebas)')) return
    setResetting(true)
    try {
      await api.post(`/api/admin/tenants/${tenantId}/voice/reset-usage`)
      setMessage({ type: 'success', text: 'Minutos de voz reseteados' })
      await load()
    } catch (err: unknown) {
      setMessage({ type: 'error', text: (err as { message?: string })?.message || 'Error al resetear' })
    } finally {
      setResetting(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <div className="flex justify-center py-6">
          <LoadingSpinner />
        </div>
      </Card>
    )
  }
  if (!data) return null

  const { entitlement, recentCalls } = data
  const pct = Math.min(100, entitlement.percentUsed)

  return (
    <Card>
      <CardHeader
        title="Llamadas IA (ElevenLabs)"
        description="Solo Enterprise por defecto; el toggle habilita voz aunque el plan no lo incluya (override negociado)"
        action={
          <Button size="sm" variant="ghost" loading={resetting} onClick={resetUsage}>
            Resetear minutos
          </Button>
        }
      />

      {message && (
        <Alert variant={message.type === 'success' ? 'success' : 'danger'} className="mb-4">
          {message.text}
        </Alert>
      )}

      {/* Estado + uso actual */}
      <div className="flex flex-wrap items-center gap-2 mb-2 text-sm">
        <Badge variant={entitlement.canUseVoice ? 'success' : 'default'}>
          {entitlement.canUseVoice ? 'Voz activa' : `Bloqueada: ${entitlement.reason}`}
        </Badge>
        <span className="text-slate-500">
          {entitlement.usedMinutes.toLocaleString()} / {entitlement.monthlyMinutesLimit.toLocaleString()} min
          ({entitlement.percentUsed}%)
        </span>
        {entitlement.estimatedCost > 0 && (
          <span className="text-xs text-slate-400">costo≈US${entitlement.estimatedCost.toFixed(2)}</span>
        )}
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-4">
        <div
          className={`h-full rounded-full ${pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-primary-600'}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Configuración */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <label className="flex items-center gap-2 text-sm text-slate-700 pb-2">
          <input
            type="checkbox"
            checked={enabled}
            onChange={e => setEnabled(e.target.checked)}
            className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
          />
          Llamadas IA habilitadas
        </label>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Minutos por usuario</label>
          <input
            className="input w-full"
            type="number"
            min={1}
            value={minutesPerUser}
            onChange={e => setMinutesPerUser(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">
            Límite mensual custom (vacío = usuarios × cuota)
          </label>
          <input
            className="input w-full"
            type="number"
            min={0}
            value={monthlyLimit}
            onChange={e => setMonthlyLimit(e.target.value)}
            placeholder="auto"
          />
        </div>
      </div>
      <div className="flex justify-end mt-3">
        <Button size="sm" loading={saving} icon={<Save className="h-4 w-4" />} onClick={save}>
          Guardar voz
        </Button>
      </div>

      {/* Historial reciente */}
      {recentCalls.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Últimas llamadas
          </p>
          <div className="space-y-1">
            {recentCalls.map(call => (
              <div key={call.id} className="flex items-center gap-2 text-xs text-slate-600">
                <Phone className="h-3 w-3 text-slate-400 flex-shrink-0" />
                <span>{new Date(call.startedAt).toLocaleString('es')}</span>
                <span className="text-slate-400">·</span>
                <span>{call.durationMinutes} min</span>
                <span className="text-slate-400">·</span>
                <span>{call.status}</span>
                {call.customerPhone && (
                  <span className="text-slate-400 truncate">· {call.customerPhone}</span>
                )}
                <span className="ml-auto text-slate-400">US${call.estimatedCost.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}
