'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { Send, Loader2, Bot, CalendarClock, X, ChevronDown, ChevronUp } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface Message {
  id: string
  direction: 'INBOUND' | 'OUTBOUND'
  content: string
  createdAt: string
  isSystem: boolean
  senderName?: string | null
  aiGenerated?: boolean
  sentBy: { id: string; name: string } | null
}

interface ScheduledMessage {
  id: string
  content: string
  scheduledAt: string
}

interface MessageThreadProps {
  conversationId: string | null
  contactName?: string
  isGroup?: boolean
}

export function MessageThread({ conversationId, contactName, isGroup }: MessageThreadProps) {
  const { data: session } = useSession()
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  // Scheduling
  const [showScheduler, setShowScheduler] = useState(false)
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduling, setScheduling] = useState(false)
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessage[]>([])
  const [showScheduledList, setShowScheduledList] = useState(false)

  // Load scheduled messages when conversation changes
  useEffect(() => {
    if (!conversationId) return
    fetch(`/api/scheduled-messages?conversationId=${conversationId}`)
      .then(r => r.json())
      .then(data => setScheduledMessages(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [conversationId])

  useEffect(() => {
    if (!conversationId) return
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
    const handler = (e: Event) => {
      const { conversationId: cid, message } = (e as CustomEvent<{ conversationId: string; message: Message }>).detail
      if (cid === conversationId) {
        setMessages(prev => {
          if (prev.find(m => m.id === message.id)) return prev
          return [...prev, message]
        })
      }
    }
    window.addEventListener('new-message', handler)
    window.addEventListener('message-sent', handler)
    return () => {
      window.removeEventListener('new-message', handler)
      window.removeEventListener('message-sent', handler)
    }
  }, [conversationId, session])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || !conversationId) return

    setSending(true)
    const content = input
    setInput('')

    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })

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

  async function handleSchedule() {
    if (!input.trim() || !conversationId || !scheduleDate) return
    setScheduling(true)
    try {
      const res = await fetch('/api/scheduled-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, content: input.trim(), scheduledAt: scheduleDate }),
      })
      if (res.ok) {
        const sm = await res.json()
        setScheduledMessages(prev => [...prev, sm])
        setInput('')
        setShowScheduler(false)
        setScheduleDate('')
      }
    } finally {
      setScheduling(false)
    }
  }

  async function cancelScheduled(id: string) {
    await fetch(`/api/scheduled-messages/${id}`, { method: 'DELETE' })
    setScheduledMessages(prev => prev.filter(m => m.id !== id))
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
              return (
                <div key={msg.id} className="flex justify-center my-1">
                  <span className="text-xs text-gray-400 italic bg-gray-100 px-3 py-1 rounded-full">
                    {msg.content}
                  </span>
                </div>
              )
            }
            const isOutbound = msg.direction === 'OUTBOUND'
            const isAi = msg.aiGenerated

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
                        ? isAi
                          ? 'bg-violet-50 text-violet-900 border border-dashed border-violet-300 rounded-br-sm'
                          : 'bg-blue-500 text-white rounded-br-sm'
                        : 'bg-white text-gray-900 border border-gray-200 rounded-bl-sm'
                    }`}
                  >
                    {msg.content}
                  </div>

                  <div className="flex items-center gap-1.5 px-1">
                    {isAi && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] bg-violet-100 text-violet-600 rounded px-1 py-0.5">
                        <Bot size={9} />
                        IA
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      {isOutbound && !isAi && msg.sentBy ? `${msg.sentBy.name} · ` : ''}
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

      {/* Scheduled messages badge */}
      {scheduledMessages.length > 0 && (
        <div className="px-6 py-2 bg-amber-50 border-t border-amber-100">
          <button
            onClick={() => setShowScheduledList(v => !v)}
            className="flex items-center gap-2 text-xs text-amber-700 font-medium w-full"
          >
            <CalendarClock size={13} />
            {scheduledMessages.length} mensagem(s) agendada(s)
            {showScheduledList ? <ChevronUp size={12} className="ml-auto" /> : <ChevronDown size={12} className="ml-auto" />}
          </button>

          {showScheduledList && (
            <div className="mt-2 space-y-1.5">
              {scheduledMessages.map(sm => (
                <div key={sm.id} className="flex items-start gap-2 bg-white border border-amber-200 rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-600 truncate">{sm.content}</p>
                    <p className="text-[10px] text-amber-600 mt-0.5">
                      {format(new Date(sm.scheduledAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                  <button
                    onClick={() => cancelScheduled(sm.id)}
                    className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0 mt-0.5"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Input area */}
      <div className="px-6 py-4 bg-white border-t border-gray-200">
        {/* Scheduler popover */}
        {showScheduler && (
          <div className="mb-3 p-3 bg-gray-50 border border-gray-200 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                <CalendarClock size={13} />
                Agendar mensagem
              </p>
              <button onClick={() => setShowScheduler(false)} className="text-gray-400 hover:text-gray-600">
                <X size={14} />
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-2 truncate">
              {input.trim() || <span className="italic">Digite uma mensagem primeiro</span>}
            </p>
            <div className="flex gap-2">
              <input
                type="datetime-local"
                value={scheduleDate}
                onChange={e => setScheduleDate(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                className="flex-1 text-xs border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <button
                onClick={handleSchedule}
                disabled={!scheduleDate || !input.trim() || scheduling}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1"
              >
                {scheduling ? <Loader2 size={11} className="animate-spin" /> : null}
                Agendar
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSend} className="flex gap-3 items-end relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void handleSend(e)
              }
            }}
            placeholder="Digite sua mensagem..."
            rows={1}
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none transition-all"
            style={{ minHeight: '42px', maxHeight: '120px' }}
          />
          <button
            type="button"
            onClick={() => setShowScheduler(v => !v)}
            title="Agendar mensagem"
            className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors border ${
              showScheduler
                ? 'bg-amber-50 border-amber-300 text-amber-600'
                : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
            }`}
          >
            <CalendarClock size={16} />
          </button>
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="w-10 h-10 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white rounded-xl flex items-center justify-center flex-shrink-0 transition-colors"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </form>
      </div>
    </div>
  )
}
