'use client'

import { useState, useEffect } from 'react'
import { X, User, Tag, FileText, MessageSquare, Phone, Mail, Check, Bot, Loader2, Sparkles, UserCheck, ArrowRight, Circle, Activity } from 'lucide-react'
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
  aiEnabled: boolean
  aiMessageCount: number
  assignedTo: { id: string; name: string } | null
  channel: { type: string; name: string }
}

interface Message {
  id: string
  direction: 'INBOUND' | 'OUTBOUND'
  content: string
  createdAt: string
  isSystem: boolean
  aiGenerated?: boolean
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

function Toggle({ enabled, onToggle, disabled }: { enabled: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-1 disabled:opacity-50 ${
        enabled ? 'bg-violet-500' : 'bg-gray-300'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ${
          enabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
        }`}
      />
    </button>
  )
}

export function LeadDrawer({ conversationId, onClose }: LeadDrawerProps) {
  const [conversation, setConversation] = useState<ConversationDetail | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [notes, setNotes] = useState('')
  const [newTag, setNewTag] = useState('')
  const [loading, setLoading] = useState(false)

  // AI state
  const [aiEnabled, setAiEnabled] = useState(true)
  const [aiToggling, setAiToggling] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

  // Activity log
  const [activities, setActivities] = useState<Array<{ id: string; type: string; description: string; createdAt: string; user?: { name: string } | null }>>([])


  useEffect(() => {
    if (!conversationId) return

    setLoading(true)
    setConversation(null)
    setMessages([])
    setSummary(null)
    setActivities([])

    Promise.all([
      fetch(`/api/conversations/${conversationId}`).then((r) => r.json()),
      fetch(`/api/conversations/${conversationId}/messages`).then((r) => r.json()),
      fetch('/api/pipeline/stages').then((r) => r.json()),
      fetch(`/api/conversations/${conversationId}/activities`).then((r) => r.json()),
    ]).then(([conv, msgs, stagesData, acts]) => {
      setConversation(conv)
      setNotes(conv.internalNotes ?? '')
      setAiEnabled(conv.aiEnabled ?? true)
      setMessages((msgs.messages ?? []).slice(-10))
      setStages(stagesData.stages ?? [])
      setActivities(Array.isArray(acts) ? acts : [])
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

  async function toggleAi() {
    if (!conversationId || aiToggling) return
    setAiToggling(true)
    const newValue = !aiEnabled
    setAiEnabled(newValue) // optimistic
    try {
      await fetch(`/api/conversations/${conversationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiEnabled: newValue }),
      })
    } catch {
      setAiEnabled(!newValue) // revert on error
    } finally {
      setAiToggling(false)
    }
  }

  async function generateSummary() {
    if (!conversationId || summaryLoading) return
    setSummaryLoading(true)
    setSummary(null)
    try {
      const res = await fetch(`/api/ai/summary/${conversationId}`, { method: 'POST' })
      const data = await res.json()
      setSummary(data.summary ?? 'Não foi possível gerar o resumo.')
    } catch {
      setSummary('Erro ao gerar resumo. Tente novamente.')
    } finally {
      setSummaryLoading(false)
    }
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
            <img src={conversation.contactPhotoUrl} alt={conversation.contactName}
              className="w-11 h-11 rounded-full object-cover flex-shrink-0" />
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
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 p-5 space-y-4 animate-pulse">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded-lg" />)}
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
                    <Phone size={13} className="text-gray-400" />{conversation.contactPhone}
                  </div>
                )}
                {conversation.contactEmail && (
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Mail size={13} className="text-gray-400" />{conversation.contactEmail}
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
                <select value={conversation.pipelineStage ?? ''}
                  onChange={(e) => patchConversation({ pipelineStage: e.target.value || null })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Sem etapa</option>
                  {stages.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
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
                  <span key={tag}
                    className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                      tag === 'QUALIFICADO'
                        ? 'bg-violet-100 text-violet-700'
                        : tag === 'TRANSFERIDO_HUMANO'
                        ? 'bg-orange-100 text-orange-700'
                        : 'bg-blue-50 text-blue-700'
                    }`}>
                    {tag}
                    <button onClick={() => removeTag(tag)} className="hover:opacity-70 ml-0.5">
                      <X size={10} />
                    </button>
                  </span>
                ))}
                {conversation.tags.length === 0 && <span className="text-xs text-gray-400">Nenhuma tag</span>}
              </div>
              <div className="flex gap-1">
                <input type="text" value={newTag} onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addTag()} placeholder="Nova tag..."
                  className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <button onClick={addTag} className="px-2 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-xs">
                  <Check size={12} />
                </button>
              </div>
            </div>

            {/* AI Agent section */}
            <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot size={14} className={aiEnabled ? 'text-violet-600' : 'text-gray-400'} />
                  <span className="text-xs font-medium text-gray-700">Agente de IA</span>
                  {conversation.aiMessageCount > 0 && (
                    <span className="text-[10px] bg-violet-100 text-violet-600 rounded px-1.5 py-0.5">
                      {conversation.aiMessageCount} msgs
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${aiEnabled ? 'text-violet-600 font-medium' : 'text-gray-400'}`}>
                    {aiEnabled ? 'Ativa' : 'Inativa'}
                  </span>
                  <Toggle enabled={aiEnabled} onToggle={toggleAi} disabled={aiToggling} />
                </div>
              </div>

              {/* Qualificado badge */}
              {conversation.tags.includes('QUALIFICADO') && (
                <div className="flex items-center gap-1.5 text-xs text-violet-700 bg-violet-100 rounded-lg px-2.5 py-1.5">
                  <Sparkles size={11} />
                  Lead qualificado pela IA
                </div>
              )}

              {/* Generate summary button */}
              <button
                onClick={generateSummary}
                disabled={summaryLoading}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-violet-200 bg-white hover:bg-violet-50 text-violet-700 text-xs font-medium transition-colors disabled:opacity-60"
              >
                {summaryLoading ? (
                  <><Loader2 size={12} className="animate-spin" /> Gerando resumo...</>
                ) : (
                  <><Sparkles size={12} /> Gerar resumo da conversa</>
                )}
              </button>

              {/* Summary result */}
              {summary && (
                <div className="bg-white border border-violet-200 rounded-lg p-3">
                  <p className="text-xs font-medium text-violet-700 mb-2 flex items-center gap-1">
                    <Bot size={11} /> Resumo da IA
                  </p>
                  <div className="text-xs text-gray-700 whitespace-pre-line leading-relaxed">
                    {summary}
                  </div>
                </div>
              )}
            </div>

            {/* Internal Notes */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <FileText size={13} className="text-gray-400" />
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Notas internas</span>
              </div>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes}
                placeholder="Adicionar notas privadas..." rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>

            {/* Activity timeline */}
            {activities.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Activity size={13} className="text-gray-400" />
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Atividades</span>
                </div>
                <div className="space-y-2">
                  {activities.map((act) => {
                    const iconMap: Record<string, { icon: React.ReactNode; color: string }> = {
                      ASSIGNED: { icon: <UserCheck size={11} />, color: 'text-blue-500 bg-blue-50' },
                      UNASSIGNED: { icon: <UserCheck size={11} />, color: 'text-gray-400 bg-gray-100' },
                      AI_ON: { icon: <Bot size={11} />, color: 'text-violet-500 bg-violet-50' },
                      AI_OFF: { icon: <Bot size={11} />, color: 'text-gray-400 bg-gray-100' },
                      AI_QUALIFIED: { icon: <Sparkles size={11} />, color: 'text-green-500 bg-green-50' },
                      TAG_ADDED: { icon: <Tag size={11} />, color: 'text-amber-500 bg-amber-50' },
                      TAG_REMOVED: { icon: <Tag size={11} />, color: 'text-gray-400 bg-gray-100' },
                      STAGE_CHANGED: { icon: <ArrowRight size={11} />, color: 'text-gray-500 bg-gray-100' },
                      STATUS_CHANGED: { icon: <Circle size={11} />, color: 'text-gray-500 bg-gray-100' },
                    }
                    const { icon, color } = iconMap[act.type] ?? { icon: <Circle size={11} />, color: 'text-gray-400 bg-gray-100' }
                    return (
                      <div key={act.id} className="flex items-start gap-2.5">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${color}`}>
                          {icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-700">{act.description}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {act.user?.name && `${act.user.name} · `}
                            {format(new Date(act.createdAt), "dd/MM 'às' HH:mm", { locale: ptBR })}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

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
                        <div className={`max-w-[80%] px-3 py-1.5 rounded-xl text-xs ${
                          isOutbound
                            ? msg.aiGenerated
                              ? 'bg-violet-50 text-violet-900 border border-dashed border-violet-300'
                              : 'bg-blue-500 text-white'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          <p className="break-words">{msg.content}</p>
                          <p className={`text-[10px] mt-0.5 ${isOutbound && !msg.aiGenerated ? 'text-blue-200' : 'text-gray-400'}`}>
                            {msg.aiGenerated && <span className="mr-1">IA ·</span>}
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
