import { useEffect, useState, useRef, useCallback } from 'react'
import {
  Search, Send, Bot, User, Mic, Image, FileText,
  ChevronLeft, PhoneCall, XCircle, AlertCircle, MessageSquare,
} from 'lucide-react'
import { Conversation, Message, ConversationStatus } from '../types'
import {
  listConversations,
  getConversationMessages,
  replyToConversation,
  takeoverConversation,
  releaseConversationToAgent,
  closeConversation as closeConversationApi,
} from '../services/conversationsApi'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'

type FilterType = 'ALL' | 'BOT_ACTIVE' | 'HUMAN_ACTIVE' | 'CLOSED' | 'UNRESOLVED' | 'WITH_QUOTE' | 'WITH_AUDIO'

const filters: { label: string; value: FilterType }[] = [
  { label: 'Todas', value: 'ALL' },
  { label: 'Bot activo', value: 'BOT_ACTIVE' },
  { label: 'Intervenidas', value: 'HUMAN_ACTIVE' },
  { label: 'Cerradas', value: 'CLOSED' },
  { label: 'Sin responder', value: 'UNRESOLVED' },
  { label: 'Con cotización', value: 'WITH_QUOTE' },
  { label: 'Con audio', value: 'WITH_AUDIO' },
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

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [filtered, setFiltered] = useState<Conversation[]>([])
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [filter, setFilter] = useState<FilterType>('ALL')
  const [search, setSearch] = useState('')
  const [reply, setReply] = useState('')
  const [loading, setLoading] = useState(true)
  const [msgLoading, setMsgLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const loadConversations = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listConversations()
      setConversations(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadConversations() }, [loadConversations])

  useEffect(() => {
    let list = conversations
    if (filter !== 'ALL') {
      if (filter === 'WITH_QUOTE') list = list.filter(c => c.hasQuote)
      else if (filter === 'WITH_AUDIO') list = list.filter(c => c.hasAudio)
      else list = list.filter(c => c.status === filter)
    }
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
    setActionLoading(true)
    try {
      await releaseConversationToAgent(selected.id)
      await loadConversations()
      setSelected(prev => prev ? { ...prev, status: 'BOT_ACTIVE' } : prev)
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
              <div className="flex items-center gap-2">
                <Mic className={`h-4 w-4 ${isOut ? 'text-primary-200' : 'text-slate-400'}`} />
                <span className={isOut ? 'text-primary-100' : 'text-slate-500'}>
                  {msg.transcription ? (
                    <span className="italic text-sm">{msg.transcription}</span>
                  ) : msg.transcriptionStatus === 'FAILED' ? (
                    <span className="flex items-center gap-1 text-red-500">
                      <AlertCircle className="h-3.5 w-3.5" />Audio no disponible
                    </span>
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
          <span className="text-xs text-slate-400 mt-1 px-1">{formatTime(msg.sentAt)}</span>
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
                <div className="h-10 w-10 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0 font-medium text-slate-600 text-sm">
                  {(conv.contactName || conv.contactPhone).charAt(0).toUpperCase()}
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
                  <div className="flex items-center gap-1.5 mt-1">
                    {statusBadge(conv.status)}
                    {conv.agentName && (
                      <span className="text-xs text-slate-400 truncate">{conv.agentName}</span>
                    )}
                  </div>
                </div>
                {(conv.unreadCount ?? 0) > 0 && (
                  <span className="flex-shrink-0 h-5 min-w-5 px-1 rounded-full bg-primary-600 text-white text-xs flex items-center justify-center">
                    {conv.unreadCount}
                  </span>
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
              <div className="flex items-center gap-2">
                {selected.status === 'BOT_ACTIVE' && (
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<PhoneCall className="h-3.5 w-3.5" />}
                    loading={actionLoading}
                    onClick={takeOver}
                  >
                    Tomar
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
                {selected.status !== 'CLOSED' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<XCircle className="h-3.5 w-3.5" />}
                    loading={actionLoading}
                    onClick={closeConv}
                  >
                    Cerrar
                  </Button>
                )}
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
    </div>
  )
}
