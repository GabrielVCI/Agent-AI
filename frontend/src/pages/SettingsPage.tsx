import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Trash2, RefreshCw, Wifi, WifiOff, Plus, Play, Send } from 'lucide-react'
import KnowledgeTab from '../components/settings/KnowledgeTab'
import { Card, CardHeader } from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import api from '../lib/api'
import { WhatsAppConnection, Agent, AgentTestResult } from '../types'
import {
  getTraining,
  saveTraining as saveTrainingApi,
  emptyTraining,
  TrainingConfig,
  TrainingPolicies,
} from '../services/trainingApi'
import { listAgents, testAgent } from '../services/agentsApi'

type Tab = 'integrations' | 'knowledge' | 'training' | 'whatsapp'

const tabs: { id: Tab; label: string }[] = [
  { id: 'integrations', label: 'Integraciones' },
  { id: 'knowledge', label: 'Conocimiento' },
  { id: 'training', label: 'Entrenamiento' },
  { id: 'whatsapp', label: 'WhatsApp' },
]

const SAMPLE_TEST_MESSAGE = 'Hola, ¿qué servicios ofrecen y hasta qué hora trabajan?'

const isValidTab = (v: string | null): v is Tab => tabs.some(t => t.id === v)

export default function SettingsPage() {
  // Deep-link: /settings?tab=training abre directo la pestaña (la usa el sidebar)
  const [searchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState<Tab>(
    isValidTab(requestedTab) ? requestedTab : 'integrations'
  )

  useEffect(() => {
    if (isValidTab(requestedTab)) setActiveTab(requestedTab)
  }, [requestedTab])
  const [connections, setConnections] = useState<WhatsAppConnection[]>([])
  const [training, setTraining] = useState<TrainingConfig>(emptyTraining)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Probar agente con el contexto guardado
  const [agents, setAgents] = useState<Agent[]>([])
  const [testAgentId, setTestAgentId] = useState('')
  const [testMessage, setTestMessage] = useState(SAMPLE_TEST_MESSAGE)
  const [testLoading, setTestLoading] = useState(false)
  const [testResult, setTestResult] = useState<AgentTestResult | null>(null)
  const [testError, setTestError] = useState('')

  useEffect(() => {
    if (activeTab === 'whatsapp') loadConnections()
    if (activeTab === 'training') { loadTraining(); loadAgents() }
  }, [activeTab])

  const loadConnections = async () => {
    setLoading(true)
    try {
      const data = await api.get<WhatsAppConnection[]>('/api/settings/integrations')
      setConnections(Array.isArray(data) ? data : [])
    } catch {
      setConnections([])
    } finally { setLoading(false) }
  }

  const loadTraining = async () => {
    setLoading(true)
    try {
      setTraining(await getTraining())
    } catch {
      setTraining(emptyTraining)
    } finally { setLoading(false) }
  }

  const loadAgents = async () => {
    try {
      const data = await listAgents()
      setAgents(data)
      // Por defecto, el primer agente activo (o el primero disponible).
      const preferred = data.find(a => a.status === 'ACTIVE') ?? data[0]
      if (preferred) setTestAgentId(prev => prev || preferred.id)
    } catch {
      setAgents([])
    }
  }

  const saveTraining = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const saved = await saveTrainingApi(training)
      setTraining(saved)
      setMessage({ type: 'success', text: 'Configuración guardada. El agente ya usa este contexto.' })
    } catch (err: unknown) {
      const er = err as { message?: string }
      setMessage({ type: 'error', text: er?.message || 'Error al guardar' })
    } finally { setSaving(false) }
  }

  const runTest = async () => {
    if (!testAgentId || !testMessage.trim()) return
    setTestLoading(true)
    setTestError('')
    setTestResult(null)
    try {
      const result = await testAgent(testAgentId, { message: testMessage.trim() })
      setTestResult(result)
    } catch (err: unknown) {
      setTestError((err as { message?: string })?.message || 'No se pudo probar el agente.')
    } finally {
      setTestLoading(false)
    }
  }

  // --- Helpers de edición ---
  type StringKey =
    | 'businessDescription' | 'customInstructions' | 'communicationTone'
    | 'schedule' | 'address' | 'serviceAreas' | 'escalationRules'
    | 'welcomeMessage' | 'outOfHoursMessage' | 'fallbackMessage' | 'forbiddenTopics'

  const tf = (key: StringKey, label: string, rows = 2, placeholder = '') => (
    <div>
      <label className="label">{label}</label>
      <textarea
        className="input resize-none"
        rows={rows}
        placeholder={placeholder}
        value={training[key] || ''}
        onChange={e => setTraining(p => ({ ...p, [key]: e.target.value }))}
      />
    </div>
  )

  const pf = (key: keyof TrainingPolicies, label: string) => (
    <div>
      <label className="label">{label}</label>
      <textarea
        className="input resize-none"
        rows={2}
        value={training.policies[key] || ''}
        onChange={e => setTraining(p => ({ ...p, policies: { ...p.policies, [key]: e.target.value } }))}
      />
    </div>
  )

  const addService = () =>
    setTraining(p => ({ ...p, services: [...p.services, { name: '' }] }))
  const removeService = (i: number) =>
    setTraining(p => ({ ...p, services: p.services.filter((_, idx) => idx !== i) }))
  const updateService = (i: number, field: 'name' | 'description' | 'price' | 'notes', value: string) =>
    setTraining(p => {
      const services = [...p.services]
      services[i] = { ...services[i], [field]: value }
      return { ...p, services }
    })

  const addFaq = () =>
    setTraining(p => ({ ...p, faqs: [...p.faqs, { question: '' }] }))
  const removeFaq = (i: number) =>
    setTraining(p => ({ ...p, faqs: p.faqs.filter((_, idx) => idx !== i) }))
  const updateFaq = (i: number, field: 'question' | 'answer', value: string) =>
    setTraining(p => {
      const faqs = [...p.faqs]
      faqs[i] = { ...faqs[i], [field]: value }
      return { ...p, faqs }
    })

  return (
    <div className="p-4 lg:p-6 max-w-screen-xl mx-auto w-full space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Configuración</h2>
        <p className="text-sm text-slate-500">Gestiona integraciones, documentos y entrenamiento de agentes</p>
      </div>

      {message && (
        <Alert variant={message.type === 'success' ? 'success' : 'danger'}>
          {message.text}
        </Alert>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === t.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Integrations tab */}
      {activeTab === 'integrations' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { name: 'WhatsApp', desc: 'Conexión con la API de WhatsApp Business', icon: '📱', status: 'Conectado', color: 'success' as const },
            { name: 'OpenAI', desc: 'Modelo de lenguaje para agentes de IA', icon: '🤖', status: 'Activo', color: 'success' as const },
            { name: 'Almacenamiento', desc: 'Almacenamiento de archivos y documentos', icon: '☁️', status: 'Activo', color: 'success' as const },
            { name: 'Pagos', desc: 'Integración con pasarela de pagos', icon: '💳', status: 'Próximamente', color: 'default' as const },
          ].map(int => (
            <Card key={int.name}>
              <div className="flex items-center gap-3">
                <span className="text-2xl">{int.icon}</span>
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900 text-sm">{int.name}</h3>
                  <p className="text-xs text-slate-500">{int.desc}</p>
                </div>
                <Badge variant={int.color}>{int.status}</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Knowledge tab: base de conocimiento consultada por el runtime IA */}
      {activeTab === 'knowledge' && <KnowledgeTab />}

      {/* Training tab */}
      {activeTab === 'training' && (
        <div className="space-y-4">
          <Alert variant="info">
            Este contexto se inyecta en el prompt de <strong>todos los agentes</strong> de tu empresa,
            tanto en la prueba interna como en WhatsApp real. La clave de OpenAI nunca se expone aquí.
          </Alert>

          {loading ? (
            <div className="flex justify-center py-10"><LoadingSpinner /></div>
          ) : (
            <>
              {/* 1. Información general */}
              <Card>
                <CardHeader title="Información general" description="Quién es el negocio y cómo debe comunicarse" />
                <div className="space-y-4">
                  {tf('businessDescription', 'Descripción del negocio', 3, 'Ej: Salón de belleza en Santo Domingo especializado en uñas y cuidado del cabello.')}
                  {tf('customInstructions', 'Instrucciones personalizadas para el agente', 3, 'Ej: Siempre saluda por el nombre. Ofrece agendar cita al final.')}
                  {tf('communicationTone', 'Tono de respuesta', 2, 'Ej: Cercano, amable y breve. Estilo WhatsApp.')}
                </div>
              </Card>

              {/* 2. Servicios y precios */}
              <Card>
                <CardHeader title="Servicios y precios" description="El agente NO inventará precios fuera de esta lista" />
                <div className="space-y-3">
                  {training.services.length === 0 && (
                    <p className="text-sm text-slate-400">Aún no has agregado servicios.</p>
                  )}
                  {training.services.map((srv, i) => (
                    <div key={i} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-start border border-slate-100 rounded-xl p-3">
                      <input
                        className="input sm:col-span-3"
                        placeholder="Nombre"
                        value={srv.name}
                        onChange={e => updateService(i, 'name', e.target.value)}
                      />
                      <input
                        className="input sm:col-span-4"
                        placeholder="Descripción (opcional)"
                        value={srv.description || ''}
                        onChange={e => updateService(i, 'description', e.target.value)}
                      />
                      <input
                        className="input sm:col-span-2"
                        placeholder="Precio / rango"
                        value={srv.price || ''}
                        onChange={e => updateService(i, 'price', e.target.value)}
                      />
                      <input
                        className="input sm:col-span-2"
                        placeholder="Notas"
                        value={srv.notes || ''}
                        onChange={e => updateService(i, 'notes', e.target.value)}
                      />
                      <button
                        onClick={() => removeService(i)}
                        className="sm:col-span-1 flex justify-center p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                        title="Quitar servicio"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={addService}>
                    Agregar servicio
                  </Button>
                </div>
              </Card>

              {/* 3. Preguntas frecuentes */}
              <Card>
                <CardHeader title="Preguntas frecuentes" description="Respuestas que el agente puede usar directamente" />
                <div className="space-y-3">
                  {training.faqs.length === 0 && (
                    <p className="text-sm text-slate-400">Aún no has agregado preguntas frecuentes.</p>
                  )}
                  {training.faqs.map((faq, i) => (
                    <div key={i} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-start border border-slate-100 rounded-xl p-3">
                      <input
                        className="input sm:col-span-5"
                        placeholder="Pregunta"
                        value={faq.question}
                        onChange={e => updateFaq(i, 'question', e.target.value)}
                      />
                      <input
                        className="input sm:col-span-6"
                        placeholder="Respuesta"
                        value={faq.answer || ''}
                        onChange={e => updateFaq(i, 'answer', e.target.value)}
                      />
                      <button
                        onClick={() => removeFaq(i)}
                        className="sm:col-span-1 flex justify-center p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                        title="Quitar pregunta"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={addFaq}>
                    Agregar pregunta
                  </Button>
                </div>
              </Card>

              {/* 4. Horarios y ubicación */}
              <Card>
                <CardHeader title="Horarios y ubicación" />
                <div className="space-y-4">
                  {tf('schedule', 'Horario de atención', 2, 'Ej: Lunes a sábado de 9:00 AM a 7:00 PM.')}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {tf('address', 'Dirección')}
                    {tf('serviceAreas', 'Zonas de servicio (si aplica)')}
                  </div>
                </div>
              </Card>

              {/* 5. Políticas */}
              <Card>
                <CardHeader title="Políticas" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {pf('appointments', 'Citas')}
                  {pf('cancellations', 'Cancelaciones')}
                  {pf('deliveries', 'Entregas')}
                  {pf('returns', 'Devoluciones')}
                  {pf('warranties', 'Garantías')}
                </div>
              </Card>

              {/* 6. Escalamiento a humano */}
              <Card>
                <CardHeader title="Escalamiento a humano" description="Cuándo el agente debe pasar la conversación a una persona" />
                <div className="space-y-4">
                  {tf('escalationRules', 'Reglas de escalamiento', 3, 'Ej: Si el cliente pide un precio no configurado, insiste en hablar con alguien, o expresa urgencia.')}
                  {tf('forbiddenTopics', 'Temas o palabras a evitar', 2)}
                </div>
              </Card>

              {/* 7. Mensajes */}
              <Card>
                <CardHeader title="Mensajes" />
                <div className="space-y-4">
                  {tf('welcomeMessage', 'Mensaje de bienvenida')}
                  {tf('outOfHoursMessage', 'Mensaje fuera de horario')}
                  {tf('fallbackMessage', 'Cuando no entiende la consulta')}
                </div>
              </Card>

              <div className="flex justify-end">
                <Button loading={saving} onClick={saveTraining}>
                  Guardar configuración
                </Button>
              </div>

              {/* Probar agente con este contexto */}
              <Card>
                <CardHeader
                  title="Probar agente con este contexto"
                  description="Guarda primero para que el agente use la configuración actual."
                />
                {agents.length === 0 ? (
                  <EmptyState
                    icon={<Play className="h-8 w-8" />}
                    title="No hay agentes para probar"
                    description="Crea un agente en la sección Agentes."
                  />
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="label">Agente</label>
                        <select
                          className="input"
                          value={testAgentId}
                          onChange={e => setTestAgentId(e.target.value)}
                        >
                          {agents.map(a => (
                            <option key={a.id} value={a.id}>
                              {a.name}{a.status !== 'ACTIVE' ? ' (inactivo)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <label className="label">Mensaje de prueba</label>
                        <input
                          className="input"
                          value={testMessage}
                          onChange={e => setTestMessage(e.target.value)}
                          placeholder={SAMPLE_TEST_MESSAGE}
                        />
                      </div>
                    </div>

                    <Button
                      icon={<Send className="h-4 w-4" />}
                      loading={testLoading}
                      disabled={!testAgentId || !testMessage.trim()}
                      onClick={runTest}
                    >
                      Probar
                    </Button>

                    {testError && <Alert variant="danger">{testError}</Alert>}

                    {testResult && (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-sm text-slate-800 whitespace-pre-wrap">
                        {testResult.reply}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      )}

      {/* WhatsApp tab */}
      {activeTab === 'whatsapp' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-700">Números conectados</h3>
            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              onClick={loadConnections}
            >
              Actualizar
            </Button>
          </div>
          {loading ? (
            <div className="flex justify-center py-10"><LoadingSpinner /></div>
          ) : connections.length === 0 ? (
            <EmptyState icon={<Wifi className="h-8 w-8" />} title="Sin números conectados" />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {connections.map(conn => (
                <Card key={conn.id}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-slate-900">{conn.phone}</p>
                      {conn.displayName && <p className="text-xs text-slate-500">{conn.displayName}</p>}
                    </div>
                    <Badge variant={conn.status === 'CONNECTED' ? 'success' : conn.status === 'PENDING' ? 'warning' : 'danger'}>
                      {conn.status === 'CONNECTED' ? (
                        <span className="flex items-center gap-1"><Wifi className="h-3 w-3" />Conectado</span>
                      ) : conn.status === 'PENDING' ? 'Pendiente' : (
                        <span className="flex items-center gap-1"><WifiOff className="h-3 w-3" />Desconectado</span>
                      )}
                    </Badge>
                  </div>
                  {conn.agentName && (
                    <p className="text-xs text-slate-500 mb-2">Agente: {conn.agentName}</p>
                  )}
                  <div className="flex gap-1.5">
                    {conn.allowAudio && <Badge variant="info">Audio</Badge>}
                    {conn.autoReply && <Badge variant="success">Respuesta automática</Badge>}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
