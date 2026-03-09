'use client'

import { useState, useEffect } from 'react'
import { X, User, Tag, FileText, MessageSquare, Phone, Mail, Check } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface ConversationDetail {
  id: string
  contactName: string
  contactPhone: string | null
  contactEmail: string | null
  contactPhotoUrl: string | null
  status: string
  pipelineStage: string | null
  tags: string[]
  internalNotes: string | null
  assignedTo: { id: string; name: string } | null
  channel: { type: string; name: string }
}

interface Message {
  id: string
  direction: 'INBOUND' | 'OUTBOUND'
  content: string
  createdAt: string
  isSystem: boolean
}

interface Stage {
  id: string
  name: string
  color: string
}

const STATUS_LABELS: Record<string, string> = {
  UNASSIGNED: 'Não atribuído',
  ASSIGNED: 'Atribuído',
  IN_PROGRESS: 'Em andamento',
  WAITING_CLIENT: 'Aguardando',
  RESOLVED: 'Resolvido',
  ARCHIVED: 'Arquivado',
}

const STATUS_COLORS: Record<string, string> = {
  UNASSIGNED: 'bg-gray-100 text-gray-600',
  ASSIGNED: 'bg-blue-50 text-blue-700',
  IN_PROGRESS: 'bg-yellow-50 text-yellow-700',
  WAITING_CLIENT: 'bg-orange-50 text-orange-700',
  RESOLVED: 'bg-green-50 text-green-700',
  ARCHIVED: 'bg-red-50 text-red-600',
}

const CHANNEL_COLORS: Record<string, string> = {
  WHATSAPP: 'bg-green-50 text-green-700',
  INSTAGRAM: 'bg-pink-50 text-pink-700',
  FACEBOOK: 'bg-blue-50 text-blue-700',
}

interface LeadDrawerProps {
  conversationId: string | null
  onClose: () => void
}

export function LeadDrawer({ conversationId, onClose }: LeadDrawerProps) {
  const [conversation, setConversation] = useState<ConversationDetail | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [notes, setNotes] = useState('')
  const [newTag, setNewTag] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!conversationId) return

    setLoading(true)
    setConversation(null)
    setMessages([])

    Promise.all([
      fetch(`/api/conversations/${conversationId}`).then((r) => r.json()),
      fetch(`/api/conversations/${conversationId}/messages`).then((r) => r.json()),
      fetch('/api/pipeline/stages').then((r) => r.json()),
    ]).then(([conv, msgs, stagesData]) => {
      setConversation(conv)
      setNotes(conv.internalNotes ?? '')
      setMessages((msgs.messages ?? []).slice(-10))
      setStages(stagesData.stages ?? [])
      setLoading(false)
    })
  }, [conversationId])

  async function patchConversation(data: Record<string, unknown>) {
    if (!conversationId) return
    const res = await fetch(`/api/conversations/${conversationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      const updated = await res.json()
      setConversation((c) => (c ? { ...c, ...updated } : c))
    }
  }

  async function saveNotes() {
    await patchConversation({ internalNotes: notes })
  }

  async function addTag() {
    if (!newTag.trim() || !conversation) return
    const tags = [...conversation.tags, newTag.trim()]
    await patchConversation({ tags })
    setConversation((c) => (c ? { ...c, tags } : c))
    setNewTag('')
  }

  async function removeTag(tag: string) {
    if (!conversation) return
    const tags = conversation.tags.filter((t) => t !== tag)
    await patchConversation({ tags })
    setConversation((c) => (c ? { ...c, tags } : c))
  }

  if (!conversationId) return null

  const initials = conversation?.contactName
    ? conversation.contactName.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div
        className="relative w-[440px] h-full bg-white shadow-2xl flex flex-col overflow-y-auto"
        style={{ animation: 'slideInFromRight 0.2s ease-out' }}
      >
        {/* Header */}
        <div className="flex items-center gap-4 px-5 py-4 border-b border-gray-200 bg-white sticky top-0 z-10">
          {conversation?.contactPhotoUrl ? (
            <img
              src={conversation.contactPhotoUrl}
              alt={conversation.contactName}
              className="w-11 h-11 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-11 h-11 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-semibold text-sm flex-shrink-0">
              {initials}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 truncate">
              {loading ? '...' : (conversation?.contactName ?? '—')}
            </p>
            {conversation && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${CHANNEL_COLORS[conversation.channel.type] ?? 'bg-gray-100 text-gray-600'}`}>
                {conversation.channel.name}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 p-5 space-y-4 animate-pulse">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 rounded-lg" />
            ))}
          </div>
        ) : conversation ? (
          <div className="flex-1 p-5 space-y-6">
            {/* Status */}
            <div>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLORS[conversation.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {STATUS_LABELS[conversation.status] ?? conversation.status}
              </span>
            </div>

            {/* Contact info */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <User size={13} className="text-gray-400" />
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Contato</span>
              </div>
              <div className="space-y-1">
                {conversation.contactPhone && (
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Phone size={13} className="text-gray-400" />
                    {conversation.contactPhone}
                  </div>
                )}
                {conversation.contactEmail && (
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Mail size={13} className="text-gray-400" />
                    {conversation.contactEmail}
                  </div>
                )}
                {!conversation.contactPhone && !conversation.contactEmail && (
                  <p className="text-sm text-gray-400">Sem informações de contato</p>
                )}
              </div>
            </div>

            {/* Pipeline Stage */}
            {stages.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Etapa do pipeline</span>
                </div>
                <select
                  value={conversation.pipelineStage ?? ''}
                  onChange={(e) => patchConversation({ pipelineStage: e.target.value || null })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Sem etapa</option>
                  {stages.map((s) => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Tags */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Tag size={13} className="text-gray-400" />
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tags</span>
              </div>
              <div className="flex flex-wrap gap-1 mb-2">
                {conversation.tags.map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full"
                  >
                    {tag}
                    <button onClick={() => removeTag(tag)} className="hover:text-blue-900 ml-0.5">
                      <X size={10} />
                    </button>
                  </span>
                ))}
                {conversation.tags.length === 0 && (
                  <span className="text-xs text-gray-400">Nenhuma tag</span>
                )}
              </div>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addTag()}
                  placeholder="Nova tag..."
                  className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={addTag}
                  className="px-2 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-xs"
                >
                  <Check size={12} />
                </button>
              </div>
            </div>

            {/* Internal Notes */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <FileText size={13} className="text-gray-400" />
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Notas internas</span>
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={saveNotes}
                placeholder="Adicionar notas privadas..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            {/* Recent messages */}
            {messages.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <MessageSquare size={13} className="text-gray-400" />
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Últimas mensagens</span>
                </div>
                <div className="space-y-2">
                  {messages.filter((m) => !m.isSystem).map((msg) => {
                    const isOutbound = msg.direction === 'OUTBOUND'
                    return (
                      <div key={msg.id} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[80%] px-3 py-1.5 rounded-xl text-xs ${
                            isOutbound
                              ? 'bg-blue-500 text-white'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          <p className="break-words">{msg.content}</p>
                          <p className={`text-[10px] mt-0.5 ${isOutbound ? 'text-blue-200' : 'text-gray-400'}`}>
                            {format(new Date(msg.createdAt), 'dd/MM HH:mm', { locale: ptBR })}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>

      <style jsx>{`
        @keyframes slideInFromRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}
