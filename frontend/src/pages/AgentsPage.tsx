import { useEffect, useState, useCallback } from 'react'
import {
  Plus, Bot, Edit, Power, PowerOff, Play, Send, Sparkles,
  ShieldCheck, MessageSquare, Cpu, Phone, UserCog, Mic, Hash,
} from 'lucide-react'
import {
  Agent, AgentInput, AgentType, AgentIntent, AgentTestResult,
} from '../types'
import {
  listAgents, createAgent, updateAgent, setAgentStatus, testAgent,
} from '../services/agentsApi'
import api from '../lib/api'
import { Card } from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import Alert from '../components/ui/Alert'

interface PlanLimit { maxAgents: number; usedAgents: number }

const typeLabels: Record<AgentType, string> = {
  SALES: 'Ventas', SUPPORT: 'Soporte', APPOINTMENTS: 'Citas', CUSTOM: 'Personalizado',
}

const toneOptions: { value: string; label: string }[] = [
  { value: 'PROFESSIONAL', label: 'Profesional' },
  { value: 'FRIENDLY', label: 'Cercano' },
  { value: 'DIRECT', label: 'Directo' },
  { value: 'WARM', label: 'Amable' },
  { value: 'TECHNICAL', label: 'Técnico' },
]
const toneLabel = (v?: string) => toneOptions.find(t => t.value === v)?.label || v || '—'

const modelOptions = ['gpt-4.1-mini', 'gpt-4.1']

const intentLabels: Record<AgentIntent, string> = {
  GREETING: 'Saludo',
  SEARCH_PRODUCT: 'Búsqueda de producto',
  ASK_PRICE: 'Consulta de precio',
  ADD_TO_QUOTE: 'Agregar a cotización',
  REMOVE_FROM_QUOTE: 'Quitar de cotización',
  GENERATE_QUOTE: 'Generar cotización',
  ASK_RECOMMENDATION: 'Pide recomendación',
  HUMAN_HANDOFF: 'Pasar a humano',
  UNKNOWN: 'Desconocido',
}

const DEFAULT_PROMPT =
  'Eres un agente IA para WhatsApp. Responde de forma clara, breve y profesional. ' +
  'Ayuda al cliente a resolver su solicitud. Si falta información, pide aclaración. ' +
  'No inventes precios, disponibilidad ni datos que no tengas.'

const SAMPLE_TEST_MESSAGE =
  'Hola, necesito cotizar 2 galones de pintura blanca y una brocha.'

type AgentForm = AgentInput

const defaultForm: AgentForm = {
  name: '',
  type: 'SALES',
  description: '',
  department: '',
  basePrompt: DEFAULT_PROMPT,
  tone: 'PROFESSIONAL',
  aiModel: 'gpt-4.1-mini',
  whatsappNumber: '',
  whatsappPhoneNumberId: '',
  allowAudio: false,
  allowHumanIntervention: true,
}

function formatDate(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [planLimit, setPlanLimit] = useState<PlanLimit | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // Crear / editar
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Agent | null>(null)
  const [form, setForm] = useState<AgentForm>(defaultForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Confirmar desactivación
  const [confirmTarget, setConfirmTarget] = useState<Agent | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Probar agente
  const [testTarget, setTestTarget] = useState<Agent | null>(null)
  const [testMessage, setTestMessage] = useState(SAMPLE_TEST_MESSAGE)
  const [testCustomerName, setTestCustomerName] = useState('Cliente de prueba')
  const [testLoading, setTestLoading] = useState(false)
  const [testResult, setTestResult] = useState<AgentTestResult | null>(null)
  const [testError, setTestError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const [agentsRes, planRes] = await Promise.allSettled([
        listAgents(),
        api.get<unknown>('/api/account/plan'),
      ])

      let agentsCount = 0
      if (agentsRes.status === 'fulfilled') {
        setAgents(agentsRes.value)
        agentsCount = agentsRes.value.length
      } else {
        setLoadError(
          (agentsRes.reason as { message?: string })?.message ||
            'No se pudieron cargar los agentes.'
        )
      }

      // El endpoint /api/account/plan devuelve la suscripción (con plan anidado),
      // no { maxAgents, usedAgents }. Derivamos el límite de forma tolerante y
      // usamos el conteo real de agentes como "usados".
      if (planRes.status === 'fulfilled') {
        const sub = (planRes.value ?? {}) as Record<string, any>
        const plan = (sub.plan ?? {}) as Record<string, any>
        const maxAgents = Number(plan.maxAgents ?? sub.maxAgents)
        // Solo aplicamos límite si el plan declara un máximo válido (>0).
        // Si es desconocido, no mostramos ni bloqueamos la creación.
        setPlanLimit(
          Number.isFinite(maxAgents) && maxAgents > 0
            ? { maxAgents, usedAgents: agentsCount }
            : null
        )
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // --- Crear / editar ---
  const openCreate = () => {
    setEditTarget(null)
    setForm(defaultForm)
    setFormError('')
    setModalOpen(true)
  }

  const openEdit = (agent: Agent) => {
    setEditTarget(agent)
    setForm({
      name: agent.name,
      type: agent.type,
      description: agent.description || '',
      department: agent.department || '',
      basePrompt: agent.basePrompt || '',
      tone: agent.tone || 'PROFESSIONAL',
      aiModel: agent.aiModel || 'gpt-4.1-mini',
      whatsappNumber: agent.whatsappNumber || '',
      whatsappPhoneNumberId: agent.whatsappPhoneNumberId || '',
      allowAudio: agent.allowAudio,
      allowHumanIntervention: agent.allowHumanIntervention,
    })
    setFormError('')
    setModalOpen(true)
  }

  const validateForm = (): string | null => {
    if (!form.name.trim()) return 'El nombre del agente es requerido.'
    if (!form.type) return 'El tipo de agente es requerido.'
    if (!form.tone) return 'El tono es requerido.'
    if (!form.aiModel) return 'El modelo de OpenAI es requerido.'
    return null
  }

  const handleSave = async () => {
    const err = validateForm()
    if (err) { setFormError(err); return }
    setSaving(true)
    setFormError('')
    try {
      if (editTarget) {
        await updateAgent(editTarget.id, form)
      } else {
        await createAgent(form)
      }
      setModalOpen(false)
      await load()
    } catch (e: unknown) {
      setFormError((e as { message?: string })?.message || 'No se pudo guardar el agente.')
    } finally {
      setSaving(false)
    }
  }

  // --- Activar / desactivar ---
  const handleToggle = (agent: Agent) => {
    if (agent.status === 'ACTIVE') {
      setConfirmTarget(agent) // desactivar requiere confirmación
    } else {
      void applyToggle(agent) // activar es directo
    }
  }

  const applyToggle = async (agent: Agent) => {
    setTogglingId(agent.id)
    try {
      const next = agent.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
      const updated = await setAgentStatus(agent.id, next)
      setAgents(prev => prev.map(a => (a.id === updated.id ? { ...a, ...updated } : a)))
    } catch (e: unknown) {
      setLoadError((e as { message?: string })?.message || 'No se pudo cambiar el estado.')
    } finally {
      setTogglingId(null)
      setConfirmTarget(null)
    }
  }

  // --- Probar agente ---
  const openTest = (agent: Agent) => {
    setTestTarget(agent)
    setTestMessage(SAMPLE_TEST_MESSAGE)
    setTestCustomerName('Cliente de prueba')
    setTestResult(null)
    setTestError('')
  }

  const runTest = async () => {
    if (!testTarget || !testMessage.trim()) return
    setTestLoading(true)
    setTestError('')
    setTestResult(null)
    try {
      const result = await testAgent(testTarget.id, {
        message: testMessage.trim(),
        customerName: testCustomerName.trim() || undefined,
        context: { source: 'manual_test' },
      })
      setTestResult(result)
    } catch (e: unknown) {
      setTestError((e as { message?: string })?.message || 'No se pudo probar el agente.')
    } finally {
      setTestLoading(false)
    }
  }

  const atLimit = planLimit ? planLimit.usedAgents >= planLimit.maxAgents : false

  return (
    <div className="p-6 max-w-screen-xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Agentes IA</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Crea y configura agentes para responder clientes por WhatsApp.
          </p>
          {planLimit && (
            <p className="text-xs text-slate-400 mt-1">
              {planLimit.usedAgents} de {planLimit.maxAgents} agentes usados
            </p>
          )}
        </div>
        <Button
          icon={<Plus className="h-4 w-4" />}
          onClick={openCreate}
          disabled={atLimit}
          title={atLimit ? 'Límite de agentes alcanzado' : undefined}
        >
          Crear agente
        </Button>
      </div>

      {loadError && <Alert variant="danger">{loadError}</Alert>}

      {atLimit && (
        <Alert variant="warning" title="Límite de agentes alcanzado">
          Tu plan actual permite {planLimit?.maxAgents} agentes. Para crear más, actualiza tu plan en la sección Cuenta.
        </Alert>
      )}

      {/* Contenido */}
      {loading ? (
        <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
      ) : agents.length === 0 ? (
        <EmptyState
          icon={<Bot className="h-10 w-10" />}
          title="Aún no tienes agentes"
          description="Crea tu primer agente IA para responder clientes por WhatsApp."
          action={<Button icon={<Plus className="h-4 w-4" />} onClick={openCreate}>Crear primer agente</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map(agent => (
            <Card key={agent.id} className="flex flex-col">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
                    <Bot className="h-5 w-5 text-primary-600" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-900 truncate">{agent.name}</h3>
                    <p className="text-xs text-slate-500">{typeLabels[agent.type]}</p>
                  </div>
                </div>
                <Badge variant={agent.status === 'ACTIVE' ? 'success' : 'default'}>
                  {agent.status === 'ACTIVE' ? 'Activo' : 'Desactivado'}
                </Badge>
              </div>

              {agent.description && (
                <p className="text-xs text-slate-500 mb-3 line-clamp-2">{agent.description}</p>
              )}

              <dl className="space-y-1.5 text-xs mb-3">
                <div className="flex items-center gap-2 text-slate-600">
                  <Sparkles className="h-3.5 w-3.5 text-slate-400" />
                  <span>Tono: {toneLabel(agent.tone)}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600">
                  <Cpu className="h-3.5 w-3.5 text-slate-400" />
                  <span>Modelo: {agent.aiModel}</span>
                </div>
                {agent.whatsappNumber && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <Phone className="h-3.5 w-3.5 text-slate-400" />
                    <span>WhatsApp: {agent.whatsappNumber}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-slate-600">
                  <Hash className="h-3.5 w-3.5 text-slate-400" />
                  <span>
                    Phone ID:{' '}
                    {agent.whatsappPhoneNumberId ? (
                      <span className="font-mono text-[11px]">{agent.whatsappPhoneNumberId}</span>
                    ) : (
                      <span className="text-amber-600">sin asignar</span>
                    )}
                  </span>
                </div>
              </dl>

              <div className="flex flex-wrap gap-1.5 mb-3">
                <Badge variant={agent.allowHumanIntervention ? 'purple' : 'default'}>
                  <UserCog className="h-3 w-3 mr-1" />
                  {agent.allowHumanIntervention ? 'Intervención humana' : 'Sin intervención'}
                </Badge>
                <Badge variant={agent.allowAudio ? 'info' : 'default'}>
                  <Mic className="h-3 w-3 mr-1" />
                  {agent.allowAudio ? 'Audio' : 'Sin audio'}
                </Badge>
              </div>

              <p className="text-[11px] text-slate-400 mb-3">
                Actualizado: {formatDate(agent.updatedAt)}
              </p>

              <div className="flex gap-2 pt-3 border-t border-slate-100 mt-auto">
                <Button variant="secondary" size="sm" icon={<Edit className="h-3.5 w-3.5" />} onClick={() => openEdit(agent)} className="flex-1">
                  Editar
                </Button>
                <Button variant="outline" size="sm" icon={<Play className="h-3.5 w-3.5" />} onClick={() => openTest(agent)} className="flex-1">
                  Probar
                </Button>
                <Button
                  variant={agent.status === 'ACTIVE' ? 'ghost' : 'primary'}
                  size="sm"
                  loading={togglingId === agent.id}
                  icon={agent.status === 'ACTIVE' ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                  onClick={() => handleToggle(agent)}
                  title={agent.status === 'ACTIVE' ? 'Desactivar' : 'Activar'}
                />
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal crear / editar */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editTarget ? `Editar agente: ${editTarget.name}` : 'Crear nuevo agente'}
        size="xl"
      >
        <div className="space-y-4">
          {formError && <Alert variant="danger">{formError}</Alert>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Nombre del agente *</label>
              <input
                className="input"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ej: Agente de Ventas"
              />
            </div>
            <div>
              <label className="label">Tipo *</label>
              <select className="input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as AgentType }))}>
                {Object.entries(typeLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Tono *</label>
              <select className="input" value={form.tone} onChange={e => setForm(f => ({ ...f, tone: e.target.value }))}>
                {toneOptions.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Modelo OpenAI *</label>
              <select className="input" value={form.aiModel} onChange={e => setForm(f => ({ ...f, aiModel: e.target.value }))}>
                {modelOptions.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Número de WhatsApp visible</label>
              <input className="input" value={form.whatsappNumber} onChange={e => setForm(f => ({ ...f, whatsappNumber: e.target.value }))} placeholder="Opcional · +1809..." />
            </div>
            <div>
              <label className="label">Phone Number ID de Meta</label>
              <input
                className="input"
                value={form.whatsappPhoneNumberId || ''}
                onChange={e => setForm(f => ({ ...f, whatsappPhoneNumberId: e.target.value }))}
                placeholder="Ej: 123456789012345"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                ID del número en WhatsApp Cloud API. Necesario para que el webhook enrute los mensajes a este agente.
              </p>
            </div>
            <div>
              <label className="label">Departamento</label>
              <input className="input" value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} placeholder="Opcional · Ej: Ventas" />
            </div>
          </div>

          <div>
            <label className="label">Descripción</label>
            <textarea className="input resize-none" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Responde clientes por WhatsApp" />
          </div>

          <div>
            <label className="label">Prompt base / instrucciones del agente</label>
            <textarea className="input resize-none" rows={5} value={form.basePrompt} onChange={e => setForm(f => ({ ...f, basePrompt: e.target.value }))} placeholder={DEFAULT_PROMPT} />
          </div>

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.allowHumanIntervention} onChange={e => setForm(f => ({ ...f, allowHumanIntervention: e.target.checked }))} className="rounded" />
              <span className="text-sm font-medium text-slate-700">Permitir intervención humana</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.allowAudio} onChange={e => setForm(f => ({ ...f, allowAudio: e.target.checked }))} className="rounded" />
              <span className="text-sm font-medium text-slate-700">Permitir audio (próximamente)</span>
            </label>
          </div>

          <Alert variant="info">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 flex-shrink-0" />
              La clave de OpenAI se configura de forma segura en el backend. Nunca debe pegarse aquí.
            </span>
          </Alert>

          <div className="flex gap-3 pt-1">
            <Button variant="secondary" onClick={() => setModalOpen(false)} className="flex-1">Cancelar</Button>
            <Button loading={saving} onClick={handleSave} className="flex-1">
              {editTarget ? 'Guardar cambios' : 'Crear agente'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirmar desactivación */}
      <Modal
        open={!!confirmTarget}
        onClose={() => setConfirmTarget(null)}
        title="Desactivar agente"
        size="sm"
      >
        <p className="text-sm text-slate-600">
          ¿Seguro que deseas desactivar <span className="font-medium text-slate-900">{confirmTarget?.name}</span>?
          Dejará de responder clientes por WhatsApp hasta que lo actives de nuevo.
        </p>
        <div className="flex gap-3 pt-5">
          <Button variant="secondary" onClick={() => setConfirmTarget(null)} className="flex-1">Cancelar</Button>
          <Button
            variant="danger"
            loading={togglingId === confirmTarget?.id}
            onClick={() => confirmTarget && applyToggle(confirmTarget)}
            className="flex-1"
          >
            Desactivar
          </Button>
        </div>
      </Modal>

      {/* Panel de prueba */}
      <Modal
        open={!!testTarget}
        onClose={() => setTestTarget(null)}
        title={testTarget ? `Probar agente: ${testTarget.name}` : 'Probar agente'}
        description="Envía un mensaje de prueba. La respuesta la genera OpenAI vía backend; no se envía nada por WhatsApp."
        size="xl"
      >
        <div className="space-y-4">
          {testTarget?.status === 'INACTIVE' && (
            <Alert variant="warning">
              Este agente está desactivado. Puedes probarlo igualmente, pero no responderá clientes reales hasta activarlo.
            </Alert>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="label">Mensaje de prueba</label>
              <textarea
                className="input resize-none"
                rows={2}
                value={testMessage}
                onChange={e => setTestMessage(e.target.value)}
                placeholder={SAMPLE_TEST_MESSAGE}
              />
            </div>
            <div>
              <label className="label">Nombre del cliente</label>
              <input className="input" value={testCustomerName} onChange={e => setTestCustomerName(e.target.value)} placeholder="Cliente de prueba" />
            </div>
          </div>

          <Button
            icon={<Send className="h-4 w-4" />}
            loading={testLoading}
            disabled={!testMessage.trim()}
            onClick={runTest}
          >
            Probar agente
          </Button>

          {testError && <Alert variant="danger">{testError}</Alert>}

          {testLoading && (
            <div className="flex items-center gap-3 text-sm text-slate-500 py-4">
              <LoadingSpinner /> Generando respuesta con OpenAI...
            </div>
          )}

          {testResult && <TestResultView result={testResult} />}
        </div>
      </Modal>
    </div>
  )
}

// --- Vista del resultado de prueba ---
function TestResultView({ result }: { result: AgentTestResult }) {
  const d = result.decision
  const quoteSuggested =
    d.productRequests.length > 0 ||
    d.intent === 'ADD_TO_QUOTE' ||
    d.intent === 'GENERATE_QUOTE'
  const handoffSuggested = d.requiresHuman || d.intent === 'HUMAN_HANDOFF'

  return (
    <div className="space-y-4 border-t border-slate-100 pt-4">
      {/* Respuesta del agente */}
      <div>
        <p className="label flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5" />Respuesta del agente</p>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-sm text-slate-800 whitespace-pre-wrap">
          {result.reply}
        </div>
      </div>

      {/* Señales estructuradas */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="info">Intención: {intentLabels[d.intent] || d.intent}</Badge>
        <Badge variant="default">Confianza: {(d.confidence * 100).toFixed(0)}%</Badge>
        <Badge variant={quoteSuggested ? 'success' : 'default'}>
          {quoteSuggested ? 'Sugiere cotización' : 'Sin cotización'}
        </Badge>
        <Badge variant={handoffSuggested ? 'warning' : 'default'}>
          {handoffSuggested ? 'Sugiere intervención humana' : 'Sin intervención'}
        </Badge>
      </div>

      {/* Items extraídos */}
      {d.productRequests.length > 0 && (
        <div>
          <p className="label flex items-center gap-1.5"><Hash className="h-3.5 w-3.5" />Items detectados</p>
          <div className="space-y-1.5">
            {d.productRequests.map((item, i) => (
              <div key={i} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm">
                <span className="text-slate-800">{item.normalizedText || item.originalText}</span>
                <span className="text-slate-500 text-xs">
                  {item.quantity}{item.unit ? ` ${item.unit}` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modelo y tokens */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="bg-slate-50 rounded-lg p-2.5">
          <p className="text-slate-500">Modelo</p>
          <p className="font-semibold text-slate-800 mt-0.5 truncate">{result.model}</p>
        </div>
        <div className="bg-slate-50 rounded-lg p-2.5">
          <p className="text-slate-500">Tokens entrada</p>
          <p className="font-semibold text-slate-800 mt-0.5">{result.usage.inputTokens}</p>
        </div>
        <div className="bg-slate-50 rounded-lg p-2.5">
          <p className="text-slate-500">Tokens salida</p>
          <p className="font-semibold text-slate-800 mt-0.5">{result.usage.outputTokens}</p>
        </div>
        <div className="bg-slate-50 rounded-lg p-2.5">
          <p className="text-slate-500">Tokens total</p>
          <p className="font-semibold text-slate-800 mt-0.5">{result.usage.totalTokens}</p>
        </div>
      </div>
    </div>
  )
}
