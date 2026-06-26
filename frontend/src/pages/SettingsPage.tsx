import { useEffect, useState } from 'react'
import { Upload, Trash2, RefreshCw, Wifi, WifiOff } from 'lucide-react'
import { Card, CardHeader } from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import api from '../lib/api'
import { KnowledgeDocument, WhatsAppConnection } from '../types'

type Tab = 'integrations' | 'knowledge' | 'training' | 'whatsapp'

const tabs: { id: Tab; label: string }[] = [
  { id: 'integrations', label: 'Integraciones' },
  { id: 'knowledge', label: 'Documentos y RAG' },
  { id: 'training', label: 'Entrenamiento' },
  { id: 'whatsapp', label: 'WhatsApp' },
]

interface TrainingData {
  generalInstructions?: string
  communicationTone?: string
  avoidWords?: string
  faq?: string
  deliveryPolicy?: string
  returnPolicy?: string
  schedule?: string
  locations?: string
  escalationRules?: string
  welcomeMessage?: string
  unknownMessage?: string
  offHoursMessage?: string
}

function docStatusBadge(status: KnowledgeDocument['status']) {
  switch (status) {
    case 'READY': return <Badge variant="success">Listo</Badge>
    case 'PROCESSING': return <Badge variant="info">Procesando</Badge>
    case 'ERROR': return <Badge variant="danger">Error</Badge>
    case 'UPLOADED': return <Badge variant="default">Subido</Badge>
  }
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('integrations')
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([])
  const [connections, setConnections] = useState<WhatsAppConnection[]>([])
  const [training, setTraining] = useState<TrainingData>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (activeTab === 'knowledge') loadDocuments()
    if (activeTab === 'whatsapp') loadConnections()
    if (activeTab === 'training') loadTraining()
  }, [activeTab])

  const loadDocuments = async () => {
    setLoading(true)
    try {
      const data = await api.get<KnowledgeDocument[]>('/api/settings/knowledge-documents')
      setDocuments(Array.isArray(data) ? data : [])
    } catch {
      setDocuments([])
    } finally { setLoading(false) }
  }

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
      const data = await api.get<TrainingData>('/api/settings/agent-training')
      setTraining(data && typeof data === 'object' ? data : {})
    } catch {
      setTraining({})
    } finally { setLoading(false) }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      await api.upload('/api/settings/knowledge-documents', fd)
      await loadDocuments()
      setMessage({ type: 'success', text: 'Documento subido correctamente' })
    } catch (err: unknown) {
      const er = err as { message?: string }
      setMessage({ type: 'error', text: er?.message || 'Error al subir el documento' })
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const deleteDocument = async (id: string) => {
    try {
      await api.delete(`/api/settings/knowledge-documents/${id}`)
      setDocuments(prev => prev.filter(d => d.id !== id))
    } catch {}
  }

  const saveTraining = async () => {
    setSaving(true)
    try {
      await api.put('/api/settings/agent-training', training)
      setMessage({ type: 'success', text: 'Configuración guardada' })
    } catch {
      setMessage({ type: 'error', text: 'Error al guardar' })
    } finally { setSaving(false) }
  }

  const tf = (key: keyof TrainingData, label: string, rows = 2) => (
    <div>
      <label className="label">{label}</label>
      <textarea
        className="input resize-none"
        rows={rows}
        value={training[key] || ''}
        onChange={e => setTraining(p => ({ ...p, [key]: e.target.value }))}
      />
    </div>
  )

  return (
    <div className="p-6 max-w-screen-xl space-y-6">
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

      {/* Knowledge / RAG tab */}
      {activeTab === 'knowledge' && (
        <div className="space-y-4">
          <Alert variant="info">
            Los documentos que subas aquí serán usados como contexto de conocimiento para tus agentes de IA.
          </Alert>

          <Card>
            <CardHeader title="Subir documento" description="PDF, TXT, DOCX, CSV" />
            <div className="flex items-center gap-4">
              <label className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors ${uploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.txt,.docx,.csv"
                  onChange={handleFileUpload}
                  disabled={uploading}
                />
                {!uploading && <Upload className="h-4 w-4" />}
                {uploading ? 'Subiendo...' : 'Seleccionar archivo'}
              </label>
            </div>
          </Card>

          <Card padding="none">
            <div className="p-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900 text-sm">Documentos subidos</h3>
            </div>
            {loading ? (
              <div className="flex justify-center py-10"><LoadingSpinner /></div>
            ) : documents.length === 0 ? (
              <EmptyState
                icon={<Upload className="h-8 w-8" />}
                title="Sin documentos"
                description="Sube documentos para enriquecer el conocimiento de tus agentes."
              />
            ) : (
              <div className="divide-y divide-slate-100">
                {documents.map(doc => (
                  <div key={doc.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{doc.fileName}</p>
                      <p className="text-xs text-slate-500">{doc.fileType} · {Number(doc.fileSizeMb ?? 0).toFixed(2)} MB</p>
                    </div>
                    {docStatusBadge(doc.status)}
                    <button
                      onClick={() => deleteDocument(doc.id)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Training tab */}
      {activeTab === 'training' && (
        <Card>
          <CardHeader title="Entrenamiento del agente" description="Define el comportamiento de tus agentes" />
          {loading ? (
            <div className="flex justify-center py-10"><LoadingSpinner /></div>
          ) : (
            <div className="space-y-4">
              {tf('generalInstructions', 'Instrucciones generales de la empresa', 3)}
              {tf('communicationTone', 'Tono de comunicación')}
              {tf('avoidWords', 'Palabras/frases a evitar')}
              {tf('faq', 'Preguntas frecuentes', 4)}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>{tf('deliveryPolicy', 'Políticas de entrega')}</div>
                <div>{tf('returnPolicy', 'Políticas de devolución')}</div>
                <div>{tf('schedule', 'Horarios de atención')}</div>
                <div>{tf('locations', 'Ubicaciones')}</div>
              </div>
              {tf('escalationRules', 'Reglas de escalamiento a humano')}
              {tf('welcomeMessage', 'Mensaje de bienvenida')}
              {tf('unknownMessage', 'Cuando no entiende la consulta')}
              {tf('offHoursMessage', 'Mensaje fuera de horario')}
              <Button loading={saving} onClick={saveTraining} className="mt-2">
                Guardar configuración
              </Button>
            </div>
          )}
        </Card>
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
