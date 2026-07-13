import { useCallback, useEffect, useState, FormEvent, ChangeEvent } from 'react'
import { BookOpen, Plus, Pencil, Power, Trash2, FileUp, Bot } from 'lucide-react'
import { Card } from '../ui/Card'
import Button from '../ui/Button'
import Badge from '../ui/Badge'
import Alert from '../ui/Alert'
import Modal from '../ui/Modal'
import EmptyState from '../ui/EmptyState'
import LoadingSpinner from '../ui/LoadingSpinner'
import { knowledgeApi, KnowledgeDoc } from '../../services/knowledgeApi'
import { listAgents } from '../../services/agentsApi'
import { Agent } from '../../types'

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder:text-slate-400 transition'

function DocFormModal({
  open,
  onClose,
  onSaved,
  editing,
  agents,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  editing: KnowledgeDoc | null
  agents: Agent[]
}) {
  const [title, setTitle] = useState('')
  const [contentText, setContentText] = useState('')
  const [agentId, setAgentId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setTitle(editing?.title ?? '')
      setContentText(editing?.contentText ?? '')
      setAgentId(editing?.agentId ?? '')
      setError('')
    }
  }, [open, editing])

  // Lectura local de archivos .txt: el contenido viaja como texto plano,
  // nunca se sube el archivo en sí.
  const handleTxtFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.txt') && file.type !== 'text/plain') {
      setError('Por ahora solo se aceptan archivos .txt (o pega el contenido directamente)')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      setContentText(prev => (prev.trim() ? `${prev}\n\n${text}` : text))
      if (!title.trim()) setTitle(file.name.replace(/\.txt$/i, ''))
    }
    reader.onerror = () => setError('No se pudo leer el archivo')
    reader.readAsText(file, 'utf-8')
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const payload = {
        title: title.trim(),
        contentText: contentText.trim(),
        agentId: agentId || null,
      }
      if (editing) {
        await knowledgeApi.update(editing.id, payload)
      } else {
        await knowledgeApi.create(payload)
      }
      onSaved()
      onClose()
    } catch (err: unknown) {
      const er = err as { message?: string }
      setError(er?.message || 'No se pudo guardar el documento')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Editar documento' : 'Nuevo documento de conocimiento'}
      size="xl"
    >
      {error && (
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Título</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
              minLength={2}
              placeholder="Ej: Políticas de garantía"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Disponible para
            </label>
            <select
              value={agentId}
              onChange={e => setAgentId(e.target.value)}
              className={inputClass}
            >
              <option value="">Todos los agentes</option>
              {agents.map(a => (
                <option key={a.id} value={a.id}>
                  Solo: {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-sm font-medium text-slate-700">Contenido</label>
            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:text-primary-700 cursor-pointer">
              <FileUp className="h-3.5 w-3.5" />
              Cargar .txt
              <input type="file" accept=".txt,text/plain" className="hidden" onChange={handleTxtFile} />
            </label>
          </div>
          <textarea
            value={contentText}
            onChange={e => setContentText(e.target.value)}
            required
            minLength={10}
            rows={10}
            placeholder="Pega aquí la información que el agente debe conocer: políticas, preguntas frecuentes, garantías, promociones, procesos…"
            className={`${inputClass} font-mono text-xs leading-relaxed`}
          />
          <p className="text-xs text-slate-400 mt-1">
            {contentText.length.toLocaleString()} caracteres. El agente usará extractos relevantes,
            no el documento completo.
          </p>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving}>
            {editing ? 'Guardar cambios' : 'Crear documento'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/**
 * Base de conocimiento del negocio: documentos de texto que los agentes IA
 * consultan al responder (búsqueda simple por relevancia, sin RAG avanzado).
 */
export default function KnowledgeTab() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<KnowledgeDoc | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<KnowledgeDoc | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      const data = await knowledgeApi.list()
      setDocs(Array.isArray(data) ? data : [])
    } catch (err: unknown) {
      const er = err as { message?: string }
      setError(er?.message || 'No se pudieron cargar los documentos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    listAgents()
      .then(list => setAgents(Array.isArray(list) ? list : []))
      .catch(() => setAgents([]))
  }, [load])

  const flash = (msg: string) => {
    setNotice(msg)
    window.setTimeout(() => setNotice(''), 3500)
  }

  const agentName = (id: string | null) =>
    id ? agents.find(a => a.id === id)?.name ?? 'Agente' : null

  const toggleActive = async (doc: KnowledgeDoc) => {
    try {
      await knowledgeApi.update(doc.id, { isActive: !doc.isActive })
      flash(doc.isActive ? 'Documento desactivado' : 'Documento activado')
      await load()
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'No se pudo cambiar el estado')
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    setBusy(true)
    try {
      await knowledgeApi.remove(confirmDelete.id)
      setConfirmDelete(null)
      flash('Documento eliminado')
      await load()
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'No se pudo eliminar')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Alert variant="info">
        Los agentes consultan estos documentos al responder: políticas, garantías, preguntas
        frecuentes, promociones… Solo usan extractos relevantes y nunca inventan lo que no esté
        aquí, en el entrenamiento o en el catálogo.
      </Alert>

      {error && <Alert variant="danger">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      <div className="flex justify-end">
        <Button
          icon={<Plus className="h-4 w-4" />}
          onClick={() => {
            setEditing(null)
            setModalOpen(true)
          }}
        >
          Nuevo documento
        </Button>
      </div>

      <Card padding="none">
        {docs.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="h-10 w-10" />}
            title="Sin documentos de conocimiento"
            description="Crea un documento con las políticas, garantías o preguntas frecuentes de tu negocio para que los agentes respondan con información real."
            action={
              <Button
                icon={<Plus className="h-4 w-4" />}
                onClick={() => {
                  setEditing(null)
                  setModalOpen(true)
                }}
              >
                Crear el primero
              </Button>
            }
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {docs.map(doc => (
              <div key={doc.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-[200px]">
                  <p className="text-sm font-medium text-slate-900 truncate">{doc.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {doc.contentLength.toLocaleString()} caracteres
                    {agentName(doc.agentId) && (
                      <span className="inline-flex items-center gap-1 ml-2 text-primary-600">
                        <Bot className="h-3 w-3" />
                        {agentName(doc.agentId)}
                      </span>
                    )}
                  </p>
                </div>
                <Badge variant={doc.isActive ? 'success' : 'default'}>
                  {doc.isActive ? 'Activo' : 'Inactivo'}
                </Badge>
                <div className="flex items-center gap-1">
                  <button
                    title="Editar"
                    onClick={() => {
                      setEditing(doc)
                      setModalOpen(true)
                    }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    title={doc.isActive ? 'Desactivar' : 'Activar'}
                    onClick={() => toggleActive(doc)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                  >
                    <Power className="h-4 w-4" />
                  </button>
                  <button
                    title="Eliminar"
                    onClick={() => setConfirmDelete(doc)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <DocFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          flash(editing ? 'Documento actualizado' : 'Documento creado')
          load()
        }}
        editing={editing}
        agents={agents}
      />

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Eliminar documento"
        size="sm"
      >
        <p className="text-sm text-slate-600">
          ¿Eliminar <strong>{confirmDelete?.title}</strong>? Los agentes dejarán de usar esta
          información de inmediato.
        </p>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="secondary" onClick={() => setConfirmDelete(null)} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={handleDelete} loading={busy}>
            Eliminar
          </Button>
        </div>
      </Modal>
    </div>
  )
}
