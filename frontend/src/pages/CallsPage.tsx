import { useCallback, useEffect, useState } from 'react'
import {
  Phone, PhoneIncoming, PhoneOutgoing, Lock, ArrowUpCircle, MessageSquare, FileText,
} from 'lucide-react'
import { Card } from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'
import Modal from '../components/ui/Modal'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { voiceApi, VoiceCall, VoiceCallDetail, VoiceEntitlement } from '../services/voiceApi'
import { openPlanCheckout } from '../lib/lemonCheckout'
import { useNavigate } from 'react-router-dom'

const statusMeta: Record<string, { label: string; variant: 'success' | 'danger' | 'warning' | 'default' }> = {
  COMPLETED: { label: 'Completada', variant: 'success' },
  FAILED: { label: 'Fallida', variant: 'danger' },
  CANCELLED: { label: 'Cancelada', variant: 'default' },
  STARTED: { label: 'En curso', variant: 'warning' },
}

function formatDateTime(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** Historial de llamadas IA (Enterprise). Estado bloqueado para otros planes. */
export default function CallsPage() {
  const navigate = useNavigate()
  const [entitlement, setEntitlement] = useState<VoiceEntitlement | null>(null)
  const [calls, setCalls] = useState<VoiceCall[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<VoiceCallDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [upgradeMsg, setUpgradeMsg] = useState('')
  const [upgrading, setUpgrading] = useState(false)

  const load = useCallback(async () => {
    try {
      const ent = await voiceApi.entitlement()
      setEntitlement(ent ?? null)
      if (ent && ent.reason !== 'PLAN_REQUIRED') {
        const list = await voiceApi.calls()
        setCalls(Array.isArray(list) ? list : [])
      }
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'No se pudieron cargar las llamadas')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const openDetail = async (call: VoiceCall) => {
    setDetailLoading(true)
    try {
      const data = await voiceApi.call(call.id)
      setDetail(data ?? null)
    } catch {
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  const handleUpgrade = async () => {
    setUpgrading(true)
    setUpgradeMsg('')
    const result = await openPlanCheckout({ planCode: 'ENTERPRISE' })
    if (!result.ok && result.message) setUpgradeMsg(result.message)
    setUpgrading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  // Plan sin voz → estado bloqueado
  if (entitlement?.reason === 'PLAN_REQUIRED') {
    return (
      <div className="p-4 lg:p-6 max-w-screen-md mx-auto w-full">
        {upgradeMsg && (
          <Alert variant="info" className="mb-4">
            {upgradeMsg}
          </Alert>
        )}
        <Card>
          <div className="flex flex-col items-center text-center py-10 px-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 mb-4">
              <Lock className="h-7 w-7" />
            </span>
            <h2 className="text-lg font-semibold text-slate-900">
              Llamadas IA — disponible solo en Enterprise
            </h2>
            <p className="text-sm text-slate-500 mt-2 max-w-md">
              Con el plan Enterprise, tus agentes IA contestan llamadas telefónicas, consultan tu
              catálogo, agendan citas y escalan a tu equipo cuando hace falta.
            </p>
            <Button
              className="mt-5"
              icon={<ArrowUpCircle className="h-4 w-4" />}
              loading={upgrading}
              onClick={handleUpgrade}
            >
              Mejorar a Enterprise
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 max-w-screen-xl mx-auto w-full space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Llamadas</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Historial de llamadas atendidas por tus agentes IA
          </p>
        </div>
        {entitlement && (
          <div className="text-sm text-slate-600">
            <span className="font-semibold">{entitlement.remainingMinutes.toLocaleString()}</span>{' '}
            min restantes de {entitlement.monthlyMinutesLimit.toLocaleString()}
            {!entitlement.canUseVoice && (
              <Badge variant="danger" className="ml-2">
                {entitlement.reason === 'VOICE_MINUTES_LIMIT_REACHED' ? 'Sin minutos' : 'Pausadas'}
              </Badge>
            )}
          </div>
        )}
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {entitlement?.reason === 'VOICE_NOT_ENABLED' && (
        <Alert variant="info">
          Tu plan Enterprise incluye llamadas IA, pero la función aún no está activada para tu
          cuenta. Contacta a soporte para habilitarla.
        </Alert>
      )}

      <Card padding="none">
        {calls.length === 0 ? (
          <EmptyState
            icon={<Phone className="h-10 w-10" />}
            title="Sin llamadas todavía"
            description="Cuando tus agentes IA atiendan llamadas, aparecerán aquí con su duración, costo y transcripción."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Agente</th>
                  <th className="px-4 py-3 font-medium text-right">Duración</th>
                  <th className="px-4 py-3 font-medium text-right">Costo est.</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Resumen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {calls.map(call => {
                  const meta = statusMeta[call.status] ?? statusMeta.COMPLETED
                  return (
                    <tr
                      key={call.id}
                      onClick={() => openDetail(call)}
                      className="hover:bg-slate-50 cursor-pointer"
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                        <span className="inline-flex items-center gap-1.5">
                          {call.direction === 'OUTBOUND' ? (
                            <PhoneOutgoing className="h-3.5 w-3.5 text-slate-400" />
                          ) : (
                            <PhoneIncoming className="h-3.5 w-3.5 text-slate-400" />
                          )}
                          {formatDateTime(call.startedAt)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                        {call.customerPhone ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{call.agent?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-slate-700">
                        {call.durationMinutes} min
                      </td>
                      <td className="px-4 py-3 text-right text-slate-500">
                        US${call.estimatedCost.toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-500 max-w-[280px] truncate">
                        {call.summary ?? '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Detalle con transcript */}
      <Modal
        open={detail !== null || detailLoading}
        onClose={() => setDetail(null)}
        title="Detalle de llamada"
        size="xl"
      >
        {detailLoading || !detail ? (
          <div className="flex justify-center py-10">
            <LoadingSpinner />
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="bg-slate-50 rounded-lg p-2.5">
                <p className="text-slate-500">Cliente</p>
                <p className="font-semibold text-slate-800">{detail.customerPhone ?? '—'}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-2.5">
                <p className="text-slate-500">Duración</p>
                <p className="font-semibold text-slate-800">{detail.durationMinutes} min</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-2.5">
                <p className="text-slate-500">Costo estimado</p>
                <p className="font-semibold text-slate-800">US${detail.estimatedCost.toFixed(2)}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-2.5">
                <p className="text-slate-500">Agente</p>
                <p className="font-semibold text-slate-800 truncate">{detail.agent?.name ?? '—'}</p>
              </div>
            </div>

            {detail.summary && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                  Resumen
                </p>
                <p className="text-slate-700 bg-slate-50 rounded-lg p-3">{detail.summary}</p>
              </div>
            )}

            {detail.transcript ? (
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                  <FileText className="h-3.5 w-3.5" />
                  Transcripción
                </p>
                <pre className="whitespace-pre-wrap text-xs text-slate-600 bg-slate-50 rounded-lg p-3 max-h-72 overflow-y-auto font-sans">
                  {detail.transcript}
                </pre>
              </div>
            ) : (
              <p className="text-xs text-slate-400">Sin transcripción disponible.</p>
            )}

            {detail.conversationId && (
              <Button
                size="sm"
                variant="outline"
                icon={<MessageSquare className="h-3.5 w-3.5" />}
                onClick={() => navigate('/conversations')}
              >
                Ver en conversaciones
              </Button>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
