import { useEffect, useState, useRef, useCallback } from 'react'
import {
  Search, Send, Bot, User, Mic, Image, FileText,
  ChevronLeft, PhoneCall, XCircle, AlertCircle, MessageSquare,
  UserPlus, PanelRight,
} from 'lucide-react'
import { Conversation, Message, ConversationStatus, Agent } from '../types'
import {
  listConversations,
  getConversationMessages,
  replyToConversation,
  takeoverConversation,
  releaseConversationToAgent,
  closeConversation as closeConversationApi,
  labelsApi,
  assignConversation,
  unassignConversation,
  listTenantUsers,
  InboxLabel,
  TenantUser,
} from '../services/conversationsApi'
import { listAgents } from '../services/agentsApi'
import { useAuth } from '../contexts/AuthContext'
import { useAutoRefresh } from '../hooks/useAutoRefresh'
import ContactPanel, { LabelChip } from '../components/inbox/ContactPanel'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'

/**
 * Filtros rápidos del inbox (estilo respond.io). Los marcados como `server`
 * recargan desde el backend; el resto filtra la lista ya cargada.
 */
type FilterType =
  | 'ALL'
  | 'AWAITING'
  | 'NEEDS_HUMAN'
  | 'MINE'
  | 'UNASSIGNED'
  | 'BOT_ACTIVE'
  | 'HUMAN_ACTIVE'
  | 'CLOSED'
  | 'WITH_QUOTE'

const filters: { label: string; value: FilterType; server?: boolean }[] = [
  { label: 'Todas', value: 'ALL' },
  { label: 'Por responder', value: 'AWAITING', server: true },
  { label: 'Requieren humano', value: 'NEEDS_HUMAN', server: true },
  { label: 'Asignadas a mí', value: 'MINE', server: true },
  { label: 'Sin asignar', value: 'UNASSIGNED', server: true },
  { label: 'Modo IA', value: 'BOT_ACTIVE', server: true },
  { label: 'Intervenidas', value: 'HUMAN_ACTIVE' },
  { label: 'Cerradas', value: 'CLOSED', server: true },
  { label: 'Con cotización', value: 'WITH_QUOTE' },
]

function statusBadge(status: ConversationStatus) {
  switch (status) {
    case 'BOT_ACTIVE': return <Badge variant="info">Bot</Badge>
    case 'HUMAN_ACTIVE': return <Badge variant="warning">Humano</Badge>
    case 'CLOSED': return <Badge variant="default">Cerrada</Badge>
    case 'UNRESOLVED': return <Badge variant="danger">Sin responder</Badge>
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 86400000) return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('es', { day: '2-digit', month: 'short' })
}

/** Log de demo: solo en desarrollo, nunca en producción. */
function clog(...args: unknown[]): void {
  if (import.meta.env.DEV) console.log('[CONVERSATIONS]', ...args)
}

/** Etiqueta del remitente de un mensaje saliente (IA / asesor / sistema). */
function outboundSenderLabel(msg: Message): string | null {
  if (msg.direction !== 'OUTBOUND') return null
  switch (msg.senderType) {
    case 'HUMAN': return 'Asesor'
    case 'SYSTEM': return 'Sistema'
    case 'AGENT': return 'IA'
    default: return msg.isFromBot ? 'IA' : null
  }
}

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [filtered, setFiltered] = useState<Conversation[]>([])
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [filter, setFilter] = useState<FilterType>('ALL')
  const [search, setSearch] = useState('')
  const { user } = useAuth()
  const [agents, setAgents] = useState<Agent[]>([])
  const [agentFilter, setAgentFilter] = useState('')
  const [labels, setLabels] = useState<InboxLabel[]>([])
  const [labelFilter, setLabelFilter] = useState('')
  const [users, setUsers] = useState<TenantUser[]>([])
  const [showProfile, setShowProfile] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [reply, setReply] = useState('')
  const [loading, setLoading] = useState(true)
  const [msgLoading, setMsgLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const loadLabels = useCallback(() => {
    labelsApi
      .list()
      .then(list => setLabels(Array.isArray(list) ? list : []))
      .catch(() => setLabels([]))
  }, [])

  // silent=true refresca sin parpadeo de loading (polling de fondo)
  const loadConversations = useCallback(async (silent = false) => {
    clog('loading conversations')
    if (!silent) setLoading(true)
    try {
      const data = await listConversations({
        agentId: agentFilter || undefined,
        labelId: labelFilter || undefined,
        awaiting: filter === 'AWAITING' || undefined,
        pendingHuman: filter === 'NEEDS_HUMAN' || undefined,
        assignedToMe: filter === 'MINE' || undefined,
        unassigned: filter === 'UNASSIGNED' || undefined,
        status: filter === 'BOT_ACTIVE' ? 'BOT_ACTIVE' : filter === 'CLOSED' ? 'CLOSED' : undefined,
      })
      setConversations(data)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [agentFilter, labelFilter, filter])

  useEffect(() => { loadConversations() }, [loadConversations])

  // Inbox casi en tiempo real (Parte I): lista cada 10s y, si hay un hilo
  // abierto, sus mensajes; solo se re-renderiza si llegó algo nuevo.
  useAutoRefresh(async () => {
    try {
      await loadConversations(true)
      if (selected) {
        const data = await getConversationMessages(selected.id)
        setMessages(prev => {
          const lastPrev = prev[prev.length - 1]?.id
          const lastNew = data[data.length - 1]?.id
          return prev.length === data.length && lastPrev === lastNew ? prev : data
        })
      }
    } catch {
      // fallo transitorio: el próximo tick reintenta
    }
  }, 10_000)

  useEffect(() => {
    // Catálogos auxiliares del inbox: si alguno falla, el inbox sigue operativo.
    listAgents()
      .then(list => setAgents(Array.isArray(list) ? list : []))
      .catch(() => setAgents([]))
    listTenantUsers()
      .then(list => setUsers(Array.isArray(list) ? list : []))
      .catch(() => setUsers([]))
    loadLabels()
  }, [loadLabels])

  useEffect(() => {
    let list = conversations
    // Los filtros `server` ya llegan filtrados del backend; aquí solo los locales
    if (filter === 'WITH_QUOTE') list = list.filter(c => c.hasQuote)
    else if (filter === 'HUMAN_ACTIVE') list = list.filter(c => c.status === 'HUMAN_ACTIVE')
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        c.contactPhone.includes(q) ||
        (c.contactName?.toLowerCase().includes(q)) ||
        (c.lastMessage?.toLowerCase().includes(q))
      )
    }
    setFiltered(list)
  }, [conversations, filter, search])

  const selectConversation = async (conv: Conversation) => {
    clog('selected conversation', conv.id)
    setSelected(conv)
    setShowChat(true)
    setMsgLoading(true)
    try {
      const data = await getConversationMessages(conv.id)
      setMessages(data)
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    } finally {
      setMsgLoading(false)
    }
  }

  const sendReply = async () => {
    if (!reply.trim() || !selected) return
    setSending(true)
    try {
      await replyToConversation(selected.id, reply)
      clog('manual reply sent', selected.id)
      setReply('')
      const data = await getConversationMessages(selected.id)
      setMessages(data)
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    } finally {
      setSending(false)
    }
  }

  const takeOver = async () => {
    if (!selected) return
    clog('takeover requested', selected.id)
    setActionLoading(true)
    try {
      await takeoverConversation(selected.id)
      await loadConversations()
      setSelected(prev => prev ? { ...prev, status: 'HUMAN_ACTIVE' } : prev)
    } finally {
      setActionLoading(false)
    }
  }

  const releaseToAgent = async () => {
    if (!selected) return
    clog('release to agent requested', selected.id)
    setActionLoading(true)
    try {
      await releaseConversationToAgent(selected.id)
      await loadConversations()
      setSelected(prev => prev ? { ...prev, status: 'BOT_ACTIVE' } : prev)
    } finally {
      setActionLoading(false)
    }
  }

  const assignTo = async (userId: string | null) => {
    if (!selected) return
    setAssignOpen(false)
    setActionLoading(true)
    try {
      if (userId) {
        await assignConversation(selected.id, userId)
      } else {
        await unassignConversation(selected.id)
      }
      await loadConversations()
      const target = users.find(u => u.id === userId)
      setSelected(prev =>
        prev
          ? {
              ...prev,
              assignedToId: userId ?? undefined,
              operatorName: target?.name,
              status: userId ? 'HUMAN_ACTIVE' : prev.status,
            }
          : prev
      )
    } finally {
      setActionLoading(false)
    }
  }

  const closeConv = async () => {
    if (!selected) return
    setActionLoading(true)
    try {
      await closeConversationApi(selected.id)
      await loadConversations()
      setSelected(prev => prev ? { ...prev, status: 'CLOSED' } : prev)
    } finally {
      setActionLoading(false)
    }
  }

  const renderMessage = (msg: Message) => {
    const isOut = msg.direction === 'OUTBOUND'
    return (
      <div key={msg.id} className={`flex ${isOut ? 'justify-end' : 'justify-start'} mb-2`}>
        {!isOut && (
          <div className="flex-shrink-0 h-7 w-7 rounded-full bg-slate-200 flex items-center justify-center mr-2 mt-1">
            {msg.isFromBot ? <Bot className="h-3.5 w-3.5 text-primary-600" /> : <User className="h-3.5 w-3.5 text-slate-500" />}
          </div>
        )}
        <div className={`max-w-[75%] ${isOut ? 'items-end' : 'items-start'} flex flex-col`}>
          <div
            className={`px-3.5 py-2.5 rounded-2xl text-sm ${
              isOut
                ? 'bg-primary-600 text-white rounded-tr-sm'
                : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm'
            }`}
          >
            {msg.type === 'AUDIO' ? (
              <div className="flex items-start gap-2">
                <Mic className={`h-4 w-4 mt-0.5 flex-shrink-0 ${isOut ? 'text-primary-200' : 'text-slate-400'}`} />
                <span className={isOut ? 'text-primary-100' : 'text-slate-500'}>
                  {msg.transcription ? (
                    <span className="flex flex-col gap-0.5">
                      <span className="italic text-sm">{msg.transcription}</span>
                      <span className={`text-[11px] ${isOut ? 'text-primary-200' : 'text-slate-400'}`}>
                        {msg.transcriptionProvider === 'elevenlabs'
                          ? 'Transcrito con ElevenLabs'
                          : 'Transcrito automáticamente'}
                      </span>
                    </span>
                  ) : msg.transcriptionStatus === 'FAILED' ? (
                    <span className="flex items-center gap-1 text-red-500">
                      <AlertCircle className="h-3.5 w-3.5" />No se pudo transcribir el audio.
                    </span>
                  ) : msg.transcriptionStatus === 'SKIPPED' || msg.transcriptionStatus === 'DISABLED' ? (
                    <span>Audio recibido (sin transcripción)</span>
                  ) : (
                    <span>Audio procesando...</span>
                  )}
                </span>
              </div>
            ) : msg.type === 'IMAGE' ? (
              <div className="flex items-center gap-2">
                <Image className={`h-4 w-4 ${isOut ? 'text-primary-200' : 'text-slate-400'}`} />
                <span>Imagen</span>
              </div>
            ) : msg.type === 'DOCUMENT' ? (
              <div className="flex items-center gap-2">
                <FileText className={`h-4 w-4 ${isOut ? 'text-primary-200' : 'text-slate-400'}`} />
                <span>{msg.content || 'Documento'}</span>
              </div>
            ) : (
              msg.content
            )}
          </div>
          <span className="text-xs text-slate-400 mt-1 px-1">
            {(() => {
              const label = outboundSenderLabel(msg)
              return label ? `${label} · ` : ''
            })()}
            {formatTime(msg.sentAt)}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full bg-slate-50">
      {/* Conversations list */}
      <div
        className={`flex flex-col w-full md:w-80 lg:w-96 flex-shrink-0 bg-white border-r border-slate-200 ${
          showChat ? 'hidden md:flex' : 'flex'
        }`}
      >
        <div className="p-4 border-b border-slate-100">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar conversación..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {filters.map(f => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  filter === f.value
                    ? 'bg-primary-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-1.5">
            {agents.length > 0 && (
              <select
                value={agentFilter}
                onChange={e => setAgentFilter(e.target.value)}
                className="flex-1 min-w-0 px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-600"
              >
                <option value="">Todos los agentes</option>
                {agents.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
            {labels.length > 0 && (
              <select
                value={labelFilter}
                onChange={e => setLabelFilter(e.target.value)}
                className="flex-1 min-w-0 px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-600"
              >
                <option value="">Todas las etiquetas</option>
                {labels.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-12"><LoadingSpinner /></div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={<MessageSquare className="h-10 w-10" />} title="Sin conversaciones" />
          ) : (
            filtered.map(conv => (
              <button
                key={conv.id}
                onClick={() => selectConversation(conv)}
                className={`w-full flex items-start gap-3 px-4 py-3.5 text-left hover:bg-slate-50 transition-colors border-b border-slate-50 ${
                  selected?.id === conv.id ? 'bg-primary-50' : ''
                }`}
              >
                <div
                  className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 font-medium text-sm ${
                    conv.channel === 'VOICE'
                      ? 'bg-primary-100 text-primary-600'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                  title={conv.channel === 'VOICE' ? 'Llamada IA' : 'WhatsApp'}
                >
                  {conv.channel === 'VOICE' ? (
                    <PhoneCall className="h-4 w-4" />
                  ) : (
                    (conv.contactName || conv.contactPhone).charAt(0).toUpperCase()
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-900 text-sm truncate">
                      {conv.contactName || conv.contactPhone}
                    </span>
                    {conv.lastMessageAt && (
                      <span className="text-xs text-slate-400 flex-shrink-0">
                        {formatTime(conv.lastMessageAt)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 truncate mt-0.5">{conv.lastMessage || 'Sin mensajes'}</p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {statusBadge(conv.status)}
                    {conv.needsHuman && (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                        Requiere humano
                      </span>
                    )}
                    {(conv.labels ?? []).slice(0, 2).map(label => (
                      <LabelChip key={label.id} label={label} />
                    ))}
                    {(conv.labels ?? []).length > 2 && (
                      <span className="text-[10px] text-slate-400">+{conv.labels!.length - 2}</span>
                    )}
                    {conv.operatorName && (
                      <span
                        className="ml-auto h-5 w-5 rounded-full bg-primary-100 text-primary-700 text-[10px] font-semibold flex items-center justify-center flex-shrink-0"
                        title={`Asignada a ${conv.operatorName}`}
                      >
                        {conv.operatorName.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>
                {conv.awaitingReply && conv.status !== 'CLOSED' && (
                  <span
                    className="flex-shrink-0 h-2.5 w-2.5 mt-1.5 rounded-full bg-primary-500"
                    title="El cliente espera respuesta"
                  />
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat panel */}
      <div className={`flex flex-col flex-1 min-w-0 ${!showChat ? 'hidden md:flex' : 'flex'}`}>
        {selected ? (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200 flex-shrink-0">
              <button
                onClick={() => setShowChat(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 md:hidden"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div className="h-9 w-9 rounded-full bg-slate-200 flex items-center justify-center font-medium text-slate-600 text-sm flex-shrink-0">
                {(selected.contactName || selected.contactPhone).charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900 text-sm truncate">
                  {selected.contactName || selected.contactPhone}
                </p>
                <div className="flex items-center gap-2">
                  {statusBadge(selected.status)}
                  <span className="text-xs text-slate-400">{selected.whatsappNumber}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {(selected.status === 'BOT_ACTIVE' || selected.status === 'CLOSED') && (
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<PhoneCall className="h-3.5 w-3.5" />}
                    loading={actionLoading}
                    onClick={takeOver}
                    title={selected.status === 'CLOSED' ? 'Reabrir y atender' : 'Tomar el control'}
                  >
                    {selected.status === 'CLOSED' ? 'Reabrir' : 'Tomar'}
                  </Button>
                )}
                {selected.status === 'HUMAN_ACTIVE' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Bot className="h-3.5 w-3.5" />}
                    loading={actionLoading}
                    onClick={releaseToAgent}
                  >
                    Devolver a IA
                  </Button>
                )}

                {/* Asignar a usuario del equipo */}
                <div className="relative">
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<UserPlus className="h-3.5 w-3.5" />}
                    onClick={() => setAssignOpen(v => !v)}
                    title={selected.operatorName ? `Asignada a ${selected.operatorName}` : 'Asignar a…'}
                  >
                    <span className="hidden sm:inline">
                      {selected.operatorName ? selected.operatorName.split(' ')[0] : 'Asignar'}
                    </span>
                  </Button>
                  {assignOpen && (
                    <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-xl border border-slate-200 shadow-lg z-50 py-1 max-h-64 overflow-y-auto">
                      {users.map(u => (
                        <button
                          key={u.id}
                          onClick={() => assignTo(u.id)}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 ${
                            selected.assignedToId === u.id ? 'text-primary-700 font-medium' : 'text-slate-600'
                          }`}
                        >
                          <span className="h-6 w-6 rounded-full bg-primary-100 text-primary-700 text-xs font-semibold flex items-center justify-center flex-shrink-0">
                            {u.name.charAt(0).toUpperCase()}
                          </span>
                          <span className="truncate">
                            {u.name}
                            {u.id === user?.id ? ' (yo)' : ''}
                          </span>
                        </button>
                      ))}
                      {selected.assignedToId && (
                        <button
                          onClick={() => assignTo(null)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 border-t border-slate-100"
                        >
                          Quitar asignación
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {selected.status !== 'CLOSED' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<XCircle className="h-3.5 w-3.5" />}
                    loading={actionLoading}
                    onClick={closeConv}
                  >
                    <span className="hidden sm:inline">Cerrar</span>
                  </Button>
                )}

                {/* Panel de perfil del contacto */}
                <button
                  onClick={() => setShowProfile(v => !v)}
                  className={`p-2 rounded-lg transition-colors ${
                    showProfile
                      ? 'bg-primary-50 text-primary-600'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                  title="Perfil del contacto"
                >
                  <PanelRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1 bg-slate-50">
              {selected.status === 'BOT_ACTIVE' && (
                <div className="flex justify-center mb-3">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
                    <Bot className="h-3 w-3" />La IA está respondiendo
                  </span>
                </div>
              )}
              {selected.status === 'HUMAN_ACTIVE' && (
                <div className="flex justify-center mb-3">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium">
                    <User className="h-3 w-3" />Personal tomó el control
                  </span>
                </div>
              )}
              {msgLoading ? (
                <div className="flex justify-center py-10"><LoadingSpinner /></div>
              ) : messages.length === 0 ? (
                <EmptyState icon={<MessageSquare className="h-8 w-8" />} title="Sin mensajes" />
              ) : (
                messages.map(renderMessage)
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply box */}
            {selected.status !== 'CLOSED' && (
              <div className="flex items-end gap-3 p-4 bg-white border-t border-slate-200">
                <textarea
                  rows={1}
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() }
                  }}
                  placeholder={
                    selected.status === 'BOT_ACTIVE'
                      ? 'Toma el control para responder...'
                      : 'Escribe un mensaje...'
                  }
                  disabled={selected.status === 'BOT_ACTIVE'}
                  className="flex-1 resize-none px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-400"
                  style={{ maxHeight: 120, overflowY: 'auto' }}
                />
                <Button
                  onClick={sendReply}
                  loading={sending}
                  disabled={!reply.trim() || selected.status === 'BOT_ACTIVE'}
                  size="md"
                  icon={<Send className="h-4 w-4" />}
                  className="flex-shrink-0"
                >
                  <span className="hidden sm:inline">Enviar</span>
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-slate-50">
            <EmptyState
              icon={<MessageSquare className="h-12 w-12" />}
              title="Selecciona una conversación"
              description="Elige una conversación de la lista para ver los mensajes."
            />
          </div>
        )}
      </div>

      {/* Panel de contacto: tercera columna en pantallas grandes, drawer en el resto */}
      {selected && showProfile && (
        <>
          <aside className="hidden xl:flex flex-col w-80 flex-shrink-0 border-l border-slate-200 bg-white">
            <ContactPanel
              key={selected.id}
              conversationId={selected.id}
              allLabels={labels}
              onLabelsCreated={loadLabels}
              onChanged={loadConversations}
              onClose={() => setShowProfile(false)}
              onCloseConversation={() => {
                setShowProfile(false)
                closeConv()
              }}
            />
          </aside>
          <div className="fixed inset-0 z-40 xl:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowProfile(false)} />
            <div className="absolute inset-y-0 right-0 w-full max-w-sm bg-white shadow-2xl">
              <ContactPanel
                key={selected.id}
                conversationId={selected.id}
                allLabels={labels}
                onLabelsCreated={loadLabels}
                onChanged={loadConversations}
                onClose={() => setShowProfile(false)}
                onCloseConversation={() => {
                  setShowProfile(false)
                  closeConv()
                }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
