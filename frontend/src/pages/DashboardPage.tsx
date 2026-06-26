import { useEffect, useState } from 'react'
import {
  MessageSquare, Bot, FileText, Users, Clock, TrendingUp,
  ArrowDownLeft, ArrowUpRight, AlertCircle, CheckCircle2, Mic,
  RefreshCw, AlertTriangle,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { Card, CardHeader, StatCard } from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import Alert from '../components/ui/Alert'
import api from '../lib/api'
import {
  normalizeDashboardSummary,
  normalizeDashboardByPhone,
  normalizeAgentPerformance,
  normalizeDashboardActivity,
  normalizeDashboardQuotes,
  normalizeDashboardAudio,
  normalizeDashboardAlerts,
  formatInteger,
  formatNumber,
  formatPercent,
  formatTime,
  DashboardSummaryView,
  PhoneSummaryView,
  AgentPerfView,
  ActivityDayView,
  QuotesView,
  AudioView,
  AlertView,
} from '../lib/dashboard'

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummaryView | null>(null)
  const [phones, setPhones] = useState<PhoneSummaryView[]>([])
  const [agents, setAgents] = useState<AgentPerfView[]>([])
  const [activity, setActivity] = useState<ActivityDayView[]>([])
  const [quotes, setQuotes] = useState<QuotesView | null>(null)
  const [audio, setAudio] = useState<AudioView | null>(null)
  const [alerts, setAlerts] = useState<AlertView[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    // allSettled: un endpoint que falle (p.ej. 403) no rompe el resto del dashboard.
    const [s, p, a, act, q, au, al] = await Promise.allSettled([
      api.get<unknown>('/api/dashboard/summary'),
      api.get<unknown>('/api/dashboard/by-phone'),
      api.get<unknown>('/api/dashboard/agent-performance'),
      api.get<unknown>('/api/dashboard/activity'),
      api.get<unknown>('/api/dashboard/quotes'),
      api.get<unknown>('/api/dashboard/audio'),
      api.get<unknown>('/api/dashboard/alerts'),
    ])

    // Todos los datos pasan por su normalizador: la UI nunca toca datos crudos.
    setSummary(s.status === 'fulfilled' ? normalizeDashboardSummary(s.value) : null)
    setPhones(p.status === 'fulfilled' ? normalizeDashboardByPhone(p.value) : [])
    setAgents(a.status === 'fulfilled' ? normalizeAgentPerformance(a.value) : [])
    setActivity(act.status === 'fulfilled' ? normalizeDashboardActivity(act.value) : [])
    setQuotes(q.status === 'fulfilled' ? normalizeDashboardQuotes(q.value) : null)
    setAudio(au.status === 'fulfilled' ? normalizeDashboardAudio(au.value) : null)
    setAlerts(al.status === 'fulfilled' ? normalizeDashboardAlerts(al.value) : [])

    // Si el principal (summary) falló, mostramos error amigable (sin crashear).
    if (s.status === 'rejected') {
      setError('No se pudieron cargar algunas métricas del dashboard.')
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-8 max-w-screen-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Dashboard</h2>
          <p className="text-sm text-slate-500">Métricas del mes actual</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Actualizar
        </button>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map(a => (
            <Alert key={a.id} variant={a.type === 'DANGER' ? 'danger' : a.type === 'WARNING' ? 'warning' : 'info'}>
              {a.message}
            </Alert>
          ))}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard
          label="Respondidas por IA"
          value={summary ? formatInteger(summary.aiResponded) : '—'}
          icon={<Bot className="h-5 w-5" />}
          variant="primary"
        />
        <StatCard
          label="Total conversaciones"
          value={summary ? formatInteger(summary.totalConversations) : '—'}
          icon={<MessageSquare className="h-5 w-5" />}
          variant="default"
        />
        <StatCard
          label="Cotizaciones"
          value={summary ? formatInteger(summary.quotesRequested) : '—'}
          icon={<FileText className="h-5 w-5" />}
          variant="success"
        />
        <StatCard
          label="Intervención humana"
          value={summary ? formatPercent(summary.humanInterventionRate) : '—'}
          icon={<Users className="h-5 w-5" />}
          variant="warning"
        />
        <StatCard
          label="Tiempo 1.ª respuesta"
          value={summary ? formatTime(summary.avgFirstResponseTime) : '—'}
          icon={<Clock className="h-5 w-5" />}
          variant="default"
        />
        <StatCard
          label="Mensajes entrantes"
          value={summary ? formatInteger(summary.inboundMessages) : '—'}
          icon={<ArrowDownLeft className="h-5 w-5" />}
          variant="default"
        />
        <StatCard
          label="Mensajes salientes"
          value={summary ? formatInteger(summary.outboundMessages) : '—'}
          icon={<ArrowUpRight className="h-5 w-5" />}
          variant="default"
        />
        <StatCard
          label="Sin responder"
          value={summary ? formatInteger(summary.unresolvedConversations) : '—'}
          icon={<AlertCircle className="h-5 w-5" />}
          variant="danger"
        />
        <StatCard
          label="Resueltas por IA"
          value={summary ? formatInteger(summary.aiResolvedConversations) : '—'}
          icon={<CheckCircle2 className="h-5 w-5" />}
          variant="success"
        />
        <StatCard
          label="Uso mensual"
          value={summary ? `${Math.round(summary.monthlyUsage)}%` : '—'}
          icon={<TrendingUp className="h-5 w-5" />}
          variant={summary && summary.monthlyUsage > 80 ? 'danger' : 'default'}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Actividad diaria" description="Conversaciones y cotizaciones" />
          {activity.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={activity}>
                <defs>
                  <linearGradient id="colorConv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                <Area type="monotone" dataKey="conversations" name="Conversaciones" stroke="#6366f1" fill="url(#colorConv)" strokeWidth={2} />
                <Area type="monotone" dataKey="quotes" name="Cotizaciones" stroke="#22c55e" fill="none" strokeWidth={2} strokeDasharray="4 2" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-slate-400 text-sm">Sin datos</div>
          )}
        </Card>

        <Card>
          <CardHeader title="Rendimiento de agentes" />
          {agents.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={agents} barSize={20}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="agentName" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                <Bar dataKey="conversationsHandled" name="Conversaciones" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="quotesGenerated" name="Cotizaciones" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-slate-400 text-sm">Sin datos</div>
          )}
        </Card>
      </div>

      {/* Commercial metrics */}
      {quotes && (
        <div>
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Métricas comerciales</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Cotizaciones creadas" value={formatInteger(quotes.quotesCreated)} variant="success" />
            <StatCard label="Tasa conversión" value={formatPercent(quotes.conversionRate)} variant="primary" />
            <StatCard label="Valor promedio" value={`$${formatNumber(quotes.avgValue)}`} variant="default" />
            <StatCard label="Valor total cotizado" value={`$${formatNumber(quotes.totalValue)}`} variant="success" />
          </div>
        </div>
      )}

      {/* Audio metrics */}
      {audio && (
        <div>
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Métricas de audio</h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <StatCard label="Audios recibidos" value={formatInteger(audio.received)} icon={<Mic className="h-5 w-5" />} variant="primary" />
            <StatCard label="Transcritos" value={formatInteger(audio.transcribed)} variant="success" />
            <StatCard label="Fallidos" value={formatInteger(audio.failed)} variant="danger" />
            <StatCard label="Iniciados por audio" value={formatInteger(audio.initiatedByAudio)} variant="default" />
            <StatCard label="% mensajes audio" value={formatPercent(audio.percentByAudio)} variant="default" />
          </div>
        </div>
      )}

      {/* Phones summary */}
      {phones.length > 0 && (
        <Card padding="none">
          <div className="p-6 border-b border-slate-100">
            <h3 className="text-base font-semibold text-slate-900">Resumen por número de WhatsApp</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {['Número','Agente','Recibidos','Enviados','Conversaciones','Cotizaciones','Humanos','IA resuelta','Sin responder','Conversión'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {phones.map((p, i) => (
                  <tr key={`${p.phone}-${i}`} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">{p.phone}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{p.agentName || '—'}</td>
                    <td className="px-4 py-3 text-slate-700">{formatInteger(p.messagesReceived)}</td>
                    <td className="px-4 py-3 text-slate-700">{formatInteger(p.messagesSent)}</td>
                    <td className="px-4 py-3 text-slate-700">{formatInteger(p.conversationsHandled)}</td>
                    <td className="px-4 py-3 text-slate-700">{formatInteger(p.quotesCreated)}</td>
                    <td className="px-4 py-3 text-slate-700">{formatInteger(p.humanTakenOver)}</td>
                    <td className="px-4 py-3 text-slate-700">{formatInteger(p.aiResolved)}</td>
                    <td className="px-4 py-3">
                      <span className={p.unresolvedConversations > 0 ? 'text-red-600 font-medium' : 'text-slate-700'}>
                        {formatInteger(p.unresolvedConversations)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={p.quoteConversionRate >= 30 ? 'success' : 'default'}>
                        {formatPercent(p.quoteConversionRate)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Agents performance table */}
      {agents.length > 0 && (
        <Card padding="none">
          <div className="p-6 border-b border-slate-100">
            <h3 className="text-base font-semibold text-slate-900">Rendimiento por agente</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {['Agente','Conversaciones','Cotizaciones','Intervención humana'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {agents.map((a, i) => (
                  <tr key={`${a.agentId}-${i}`} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{a.agentName}</td>
                    <td className="px-4 py-3 text-slate-700">{formatInteger(a.conversationsHandled)}</td>
                    <td className="px-4 py-3 text-slate-700">{formatInteger(a.quotesGenerated)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={a.humanInterventionRate > 30 ? 'warning' : 'success'}>
                        {formatPercent(a.humanInterventionRate)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!summary && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <AlertTriangle className="h-10 w-10 text-slate-300 mb-3" />
          <p className="text-slate-500 text-sm">No hay datos disponibles aún.</p>
        </div>
      )}
    </div>
  )
}
