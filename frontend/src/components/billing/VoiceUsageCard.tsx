import { useEffect, useState } from 'react'
import { Phone, Lock, ArrowUpCircle } from 'lucide-react'
import { Card, CardHeader } from '../ui/Card'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import Alert from '../ui/Alert'
import LoadingSpinner from '../ui/LoadingSpinner'
import { voiceApi, VoiceEntitlement } from '../../services/voiceApi'
import { openPlanCheckout } from '../../lib/lemonCheckout'

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es', { day: '2-digit', month: 'long' })
}

/**
 * Minutos de llamadas IA del mes (solo Enterprise). Para planes sin voz
 * muestra el estado bloqueado con CTA de mejora. No crashea sin datos.
 */
export default function VoiceUsageCard() {
  const [data, setData] = useState<VoiceEntitlement | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [upgradeMsg, setUpgradeMsg] = useState('')
  const [upgrading, setUpgrading] = useState(false)

  useEffect(() => {
    voiceApi
      .entitlement()
      .then(d => setData(d ?? null))
      .catch((err: unknown) =>
        setError((err as { message?: string })?.message || 'No se pudo cargar el uso de llamadas')
      )
      .finally(() => setLoading(false))
  }, [])

  const handleUpgrade = async () => {
    setUpgrading(true)
    setUpgradeMsg('')
    const result = await openPlanCheckout('ENTERPRISE')
    if (!result.ok && result.message) setUpgradeMsg(result.message)
    setUpgrading(false)
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

  if (error || !data) {
    return (
      <Card>
        <Alert variant="warning">{error || 'Sin información de llamadas disponible'}</Alert>
      </Card>
    )
  }

  // ── Plan sin voz: estado bloqueado con CTA ──
  if (data.reason === 'PLAN_REQUIRED') {
    return (
      <Card>
        <CardHeader
          title="Minutos de llamadas IA"
          description="Agentes que contestan llamadas telefónicas por ti"
        />
        {upgradeMsg && (
          <Alert variant="info" className="mb-4">
            {upgradeMsg}
          </Alert>
        )}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 rounded-xl bg-slate-50 border border-slate-200 p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-200 text-slate-500 flex-shrink-0">
            <Lock className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-800">Disponible solo en Enterprise</p>
            <p className="text-xs text-slate-500 mt-0.5">
              El plan Enterprise incluye minutos mensuales para que tus agentes IA atiendan
              llamadas telefónicas.
            </p>
          </div>
          <Button
            size="sm"
            icon={<ArrowUpCircle className="h-4 w-4" />}
            loading={upgrading}
            onClick={handleUpgrade}
          >
            Mejorar a Enterprise
          </Button>
        </div>
      </Card>
    )
  }

  // ── Enterprise con voz aún no activada por Sendwary ──
  if (data.reason === 'VOICE_NOT_ENABLED') {
    return (
      <Card>
        <CardHeader title="Minutos de llamadas IA" />
        <Alert variant="info">
          Tu plan Enterprise incluye llamadas con agentes IA, pero la función aún no está activada
          para tu cuenta. Contacta a soporte para habilitarla.
        </Alert>
      </Card>
    )
  }

  const pct = Math.min(100, data.percentUsed)
  const exceeded = data.reason === 'VOICE_MINUTES_LIMIT_REACHED'
  const nearLimit = !exceeded && data.percentUsed >= 80
  const barColor = exceeded ? 'bg-red-500' : nearLimit ? 'bg-amber-500' : 'bg-primary-600'

  return (
    <Card>
      <CardHeader
        title="Minutos de llamadas IA"
        description="Tu plan Enterprise incluye minutos mensuales para llamadas con agentes IA. Cuando se agoten, las llamadas se pausarán o requerirán autorización."
      />

      {exceeded && (
        <Alert variant="danger" className="mb-4" title="Minutos del mes agotados">
          Las llamadas IA están pausadas hasta el próximo periodo. Contacta a soporte si necesitas
          ampliar tu cuota.
        </Alert>
      )}
      {nearLimit && (
        <Alert variant="warning" className="mb-4" title={`Has usado el ${data.percentUsed}% de tus minutos`}>
          Al llegar al 100% las llamadas IA se pausarán.
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Badge variant={data.canUseVoice ? 'success' : 'danger'}>
          {data.canUseVoice ? 'Llamadas activas' : 'Llamadas pausadas'}
        </Badge>
        <span className="text-xs text-slate-400 ml-auto">
          Periodo: hasta {formatDate(data.periodEnd)}
        </span>
      </div>

      <div className="mb-3">
        <div className="flex justify-between text-xs text-slate-500 mb-1">
          <span className="inline-flex items-center gap-1">
            <Phone className="h-3.5 w-3.5" />
            Minutos usados
          </span>
          <span>
            {data.usedMinutes.toLocaleString()} / {data.monthlyMinutesLimit.toLocaleString()} (
            {data.percentUsed}%)
          </span>
        </div>
        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Te quedan <span className="font-medium text-slate-600">{data.remainingMinutes.toLocaleString()} minutos</span>
          {data.estimatedCost > 0 && <> · costo estimado del mes: US${data.estimatedCost.toFixed(2)}</>}
        </p>
      </div>
    </Card>
  )
}
