'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { Send, Loader2, Bot } from 'lucide-react'
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

      {/* Input area */}
      <div className="px-6 py-4 bg-white border-t border-gray-200">
        <form onSubmit={handleSend} className="flex gap-3 items-end">
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
