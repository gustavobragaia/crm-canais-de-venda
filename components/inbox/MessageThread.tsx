'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { Send, Loader2, Paperclip, X, Bot, User } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { AudioMessage } from './AudioMessage'
import { MediaMessage } from './MediaMessage'

interface Message {
  id: string
  direction: 'INBOUND' | 'OUTBOUND'
  content: string
  createdAt: string
  isSystem: boolean
  senderName?: string | null
  sentBy: { id: string; name: string } | null
  mediaType?: string | null
  mediaUrl?: string | null
  mediaMime?: string | null
  mediaName?: string | null
  transcription?: string | null
}

interface MessageThreadProps {
  conversationId: string | null
  contactName?: string
  isGroup?: boolean
  aiSalesEnabled?: boolean
  aiSalesMessageCount?: number
  qualificationScore?: number | null
  onToggleAi?: () => void
}

interface BriefingData {
  score: number | null
  notes: string | null
  needCategory: string | null
  urgency: string | null
  briefing: string | null
  assignedTo: string | null
  reason: string
}

function BriefingCard({ content }: { content: string }) {
  try {
    const data: BriefingData = JSON.parse(content.replace('[BRIEFING_JSON]', ''))
    const scoreColor = data.score != null
      ? data.score >= 7 ? 'text-emerald-700 bg-emerald-50' : data.score >= 4 ? 'text-amber-700 bg-amber-50' : 'text-red-700 bg-red-50'
      : 'text-gray-600 bg-gray-100'
    return (
      <div className="border border-violet-200 bg-violet-50 rounded-2xl p-4 max-w-sm text-left shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Bot size={14} className="text-violet-600" />
          <span className="text-xs font-semibold text-violet-800">Handoff — AI Vendedor</span>
        </div>
        {data.score != null && (
          <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full mb-2 ${scoreColor}`}>
            Score: {data.score}/10
          </span>
        )}
        {data.needCategory && (
          <p className="text-xs text-violet-700 mb-1"><span className="font-medium">Área:</span> {data.needCategory}</p>
        )}
        {data.urgency && (
          <p className="text-xs text-violet-700 mb-1"><span className="font-medium">Urgência:</span> {data.urgency}</p>
        )}
        {data.briefing && (
          <p className="text-xs text-gray-700 mt-2 leading-relaxed">{data.briefing}</p>
        )}
        {data.assignedTo && (
          <p className="text-xs text-violet-700 mt-2 flex items-center gap-1">
            <User size={11} />
            <span className="font-medium">Atribuído a:</span> {data.assignedTo}
          </p>
        )}
      </div>
    )
  } catch {
    return (
      <span className="text-xs text-gray-400 italic bg-gray-100 px-3 py-1 rounded-full">
        {content}
      </span>
    )
  }
}

export function MessageThread({ conversationId, contactName, isGroup, aiSalesEnabled, aiSalesMessageCount, qualificationScore, onToggleAi }: MessageThreadProps) {
  const { data: session } = useSession()
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [input, setInput] = useState('')
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!conversationId) return
    setMessages([])
    setLoading(true)
    fetch(`/api/conversations/${conversationId}/messages`)
      .then((r) => r.json())
      .then((data) => setMessages(data.messages ?? []))
      .finally(() => setLoading(false))
  }, [conversationId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!conversationId || !session) return

    const handleNewMessage = (e: Event) => {
      const { conversationId: cid, message } = (e as CustomEvent<{ conversationId: string; message: Message }>).detail
      if (cid === conversationId) {
        setMessages(prev => {
          if (prev.find(m => m.id === message.id)) return prev
          return [...prev, message]
        })
      }
    }

    const handleMessageUpdated = (e: Event) => {
      const { messageId, transcription, mediaUrl } = (e as CustomEvent<{ messageId: string; transcription?: string; mediaUrl?: string }>).detail
      setMessages(prev => prev.map(m => {
        if (m.id !== messageId) return m
        return {
          ...m,
          ...(transcription !== undefined ? { transcription } : {}),
          ...(mediaUrl !== undefined ? { mediaUrl } : {}),
        }
      }))
    }

    window.addEventListener('new-message', handleNewMessage)
    window.addEventListener('message-sent', handleNewMessage)
    window.addEventListener('message-updated', handleMessageUpdated)
    return () => {
      window.removeEventListener('new-message', handleNewMessage)
      window.removeEventListener('message-sent', handleNewMessage)
      window.removeEventListener('message-updated', handleMessageUpdated)
    }
  }, [conversationId, session])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if ((!input.trim() && !pendingFile) || !conversationId) return

    setSending(true)
    const content = input
    const file = pendingFile
    setInput('')
    setPendingFile(null)

    try {
      let res: Response
      if (file) {
        const form = new FormData()
        form.append('file', file)
        if (content.trim()) form.append('content', content)
        res = await fetch(`/api/conversations/${conversationId}/messages`, {
          method: 'POST',
          body: form,
        })
      } else {
        res = await fetch(`/api/conversations/${conversationId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        })
      }

      if (res.ok) {
        const msg = await res.json()
        setMessages((m) => {
          if (m.find(x => x.id === msg.id)) return m
          return [...m, msg]
        })
      }
    } finally {
      setSending(false)
    }
  }

  if (!conversationId) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <div className="text-center">
          <p className="text-lg font-medium mb-1">Selecione uma conversa</p>
          <p className="text-sm">Escolha uma conversa na lista ao lado</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="h-16 px-6 border-b border-gray-200 flex items-center bg-white gap-3">
        <h2 className="font-semibold text-gray-900">{contactName ?? 'Conversa'}</h2>
        {isGroup && (
          <span className="text-xs bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded-full">
            Grupo
          </span>
        )}
        {aiSalesEnabled ? (
          <div className="flex items-center gap-2 px-3 py-1 bg-violet-50 border border-violet-200 rounded-full">
            <Bot size={13} className="text-violet-600" />
            <span className="text-xs text-violet-700 font-medium">
              AI Vendedor
              {aiSalesMessageCount != null && ` · ${aiSalesMessageCount} msgs`}
              {qualificationScore != null && ` · ${qualificationScore}/10`}
            </span>
            {onToggleAi && (
              <button
                onClick={onToggleAi}
                className="text-xs text-violet-400 hover:text-violet-700 transition-colors ml-0.5"
                title="Desativar AI"
              >
                Desativar
              </button>
            )}
          </div>
        ) : onToggleAi && (
          <button
            onClick={onToggleAi}
            className="flex items-center gap-1.5 text-xs bg-violet-100 text-violet-700 hover:bg-violet-200 px-3 py-1 rounded-full transition-colors"
          >
            <Bot size={12} /> Ativar AI
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-gray-50">
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <Loader2 size={24} className="animate-spin" />
          </div>
        ) : (
          messages.map((msg) => {
            if (msg.isSystem) {
              const isBriefing = msg.content?.startsWith('[BRIEFING_JSON]')
              const isQualification = msg.content?.startsWith('IA atualizou qualificação')
              return (
                <div key={msg.id} className={`flex my-1 ${isBriefing ? 'justify-start' : 'justify-center'}`}>
                  {isBriefing ? (
                    <BriefingCard content={msg.content} />
                  ) : isQualification ? (
                    <span className="text-xs text-violet-600 italic bg-violet-50 border border-violet-100 px-3 py-1 rounded-full flex items-center gap-1.5">
                      <Bot size={11} /> {msg.content}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400 italic bg-gray-100 px-3 py-1 rounded-full">
                      {msg.content}
                    </span>
                  )}
                </div>
              )
            }
            const isOutbound = msg.direction === 'OUTBOUND'
            const mediaType = msg.mediaType as 'audio' | 'image' | 'video' | 'document' | null | undefined

            return (
              <div key={msg.id} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-sm lg:max-w-md ${isOutbound ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                  {!isOutbound && isGroup && msg.senderName && (
                    <span className="text-xs font-semibold text-blue-500 px-1 mb-0.5">
                      {msg.senderName}
                    </span>
                  )}

                  <div
                    className={`px-4 py-2.5 rounded-2xl text-sm ${
                      isOutbound
                        ? 'bg-blue-500 text-white rounded-br-sm'
                        : 'bg-white text-gray-900 border border-gray-200 rounded-bl-sm'
                    }`}
                  >
                    {mediaType === 'audio' ? (
                      <AudioMessage
                        messageId={msg.id}
                        mediaUrl={msg.mediaUrl ?? null}
                        transcription={msg.transcription ?? null}
                      />
                    ) : mediaType === 'image' || mediaType === 'video' || mediaType === 'document' ? (
                      <MediaMessage
                        mediaType={mediaType}
                        mediaUrl={msg.mediaUrl ?? null}
                        mediaName={msg.mediaName ?? null}
                        mediaMime={msg.mediaMime ?? null}
                        caption={msg.content || undefined}
                        messageId={msg.id}
                      />
                    ) : (
                      msg.content
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 px-1">
                    <span className="text-xs text-gray-400">
                      {isOutbound && msg.sentBy ? `${msg.sentBy.name} · ` : ''}
                      {format(new Date(msg.createdAt), 'HH:mm', { locale: ptBR })}
                    </span>
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="px-6 py-4 bg-white border-t border-gray-200">
        {/* File preview */}
        {pendingFile && (
          <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700">
            <Paperclip size={14} className="text-gray-400 flex-shrink-0" />
            <span className="flex-1 truncate">{pendingFile.name}</span>
            <button
              type="button"
              onClick={() => setPendingFile(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          </div>
        )}
        <form onSubmit={handleSend} className="flex gap-3 items-end">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null
              setPendingFile(f)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl flex-shrink-0 transition-colors"
            title="Anexar arquivo"
          >
            <Paperclip size={18} />
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void handleSend(e)
              }
            }}
            placeholder={pendingFile ? 'Legenda (opcional)...' : 'Digite sua mensagem...'}
            rows={1}
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none transition-all"
            style={{ minHeight: '42px', maxHeight: '120px' }}
          />
          <button
            type="submit"
            disabled={sending || (!input.trim() && !pendingFile)}
            className="w-10 h-10 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white rounded-xl flex items-center justify-center flex-shrink-0 transition-colors"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </form>
      </div>
    </div>
  )
}
