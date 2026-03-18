'use client'

import { useState, useEffect } from 'react'
import { X, Tag, FileText, MessageSquare, Phone, Mail, UserCheck, ArrowRight, Circle, Activity, GitBranch } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { TagSelector } from '@/components/ui/TagSelector'
import { NotesList } from '@/components/ui/NotesList'
import { StageHistoryTimeline } from '@/components/ui/StageHistoryTimeline'

interface TagItem {
  id: string
  name: string
  color: string
}

interface ConversationDetail {
  id: string
  contactName: string
  contactPhone: string | null
  contactEmail: string | null
  contactPhotoUrl: string | null
  status: string
  pipelineStage: string | null
  conversationTags: Array<{ tag: TagItem }>
  assignedTo: { id: string; name: string } | null
  channel: { type: string; name: string } | null
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
  WHATSAPP: 'bg-green-100 text-green-700',
  INSTAGRAM: 'bg-pink-50 text-pink-700',
  FACEBOOK: 'bg-blue-50 text-blue-700',
}

const AVATAR_COLORS = [
  '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444',
  '#EC4899', '#06B6D4', '#6366F1', '#84CC16', '#F97316',
]
function getAvatarColor(name: string) {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]
}
function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
}

interface LeadDrawerProps {
  conversationId: string | null
  onClose: () => void
}

export function LeadDrawer({ conversationId, onClose }: LeadDrawerProps) {
  const [conversation, setConversation] = useState<ConversationDetail | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [loading, setLoading] = useState(false)

  const [activities, setActivities] = useState<Array<{ id: string; type: string; description: string; createdAt: string; user?: { name: string } | null }>>([])

  useEffect(() => {
    if (!conversationId) return

    setLoading(true)
    setConversation(null)
    setMessages([])
    setActivities([])

    Promise.all([
      fetch(`/api/conversations/${conversationId}`).then(r => r.json()),
      fetch(`/api/conversations/${conversationId}/messages`).then(r => r.json()),
      fetch('/api/pipeline/stages').then(r => r.json()),
      fetch(`/api/conversations/${conversationId}/activities`).then(r => r.json()),
    ]).then(([conv, msgs, stagesData, acts]) => {
      setConversation(conv)
      setMessages((msgs.messages ?? []).slice(-10))
      setStages(stagesData.stages ?? [])
      setActivities(Array.isArray(acts) ? acts : [])
      setLoading(false)
    })
  }, [conversationId])

  useEffect(() => {
    if (!conversationId) return
    const handler = (e: Event) => {
      const { conversationId: cid, conversation: updated } = (e as CustomEvent<{ conversationId: string; conversation: Partial<ConversationDetail> }>).detail
      if (cid === conversationId && updated) {
        setConversation(prev => prev ? { ...prev, ...updated } : prev)
      }
    }
    window.addEventListener('conversation-updated', handler)
    return () => window.removeEventListener('conversation-updated', handler)
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
      setConversation(c => c ? { ...c, ...updated } : c)
    }
  }

  if (!conversationId) return null

  const initials = conversation?.contactName ? getInitials(conversation.contactName) : '?'
  const avatarBg = conversation?.contactName ? getAvatarColor(conversation.contactName) : '#3B82F6'
  const initialTags = conversation?.conversationTags?.map(ct => ct.tag) ?? []

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      <div
        className="relative w-[440px] h-full bg-white shadow-2xl flex flex-col overflow-y-auto"
        style={{ animation: 'slideInFromRight 0.2s ease-out' }}
      >
        {/* Header */}
        <div className="flex items-center gap-4 px-5 py-4 border-b border-gray-100 bg-white sticky top-0 z-10">
          {conversation?.contactPhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={conversation.contactPhotoUrl} alt={conversation.contactName}
              className="w-11 h-11 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center font-semibold text-sm text-white flex-shrink-0"
              style={{ backgroundColor: avatarBg }}
            >
              {initials}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 truncate text-sm">
              {loading ? '...' : (conversation?.contactName ?? '—')}
            </p>
            {conversation?.channel && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CHANNEL_COLORS[conversation.channel.type] ?? 'bg-gray-100 text-gray-600'}`}>
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
          <div className="flex-1 divide-y divide-gray-100">

            {/* Status + Contact */}
            <div className="px-5 py-4 space-y-3">
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLORS[conversation.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {STATUS_LABELS[conversation.status] ?? conversation.status}
              </span>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {conversation.contactPhone && (
                  <div className="flex items-center gap-1.5">
                    <Phone size={12} className="text-gray-400 flex-shrink-0" />
                    <span className="text-xs text-gray-700 truncate">{conversation.contactPhone}</span>
                  </div>
                )}
                {conversation.contactEmail && (
                  <div className="flex items-center gap-1.5">
                    <Mail size={12} className="text-gray-400 flex-shrink-0" />
                    <span className="text-xs text-gray-700 truncate">{conversation.contactEmail}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Pipeline Stage */}
            {stages.length > 0 && (
              <div className="px-5 py-4 space-y-3">
                <label className="block text-xs font-medium text-gray-600">Etapa do pipeline</label>
                <select
                  value={conversation.pipelineStage ?? ''}
                  onChange={e => {
                    const v = e.target.value
                    if (!v) return
                    patchConversation({ pipelineStage: v })
                  }}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                >
                  <option value="" disabled>Selecione uma etapa</option>
                  {stages.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <GitBranch size={12} className="text-gray-400" />
                    <span className="text-xs text-gray-500">Histórico</span>
                  </div>
                  <StageHistoryTimeline conversationId={conversationId} />
                </div>
              </div>
            )}

            {/* Tags */}
            <div className="px-5 py-4">
              <div className="flex items-center gap-2 mb-2">
                <Tag size={13} className="text-gray-400" />
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tags</span>
              </div>
              <TagSelector
                conversationId={conversationId}
                initialTags={initialTags}
                onChange={tags => setConversation(c => c ? {
                  ...c,
                  conversationTags: tags.map(t => ({ tag: t }))
                } : c)}
              />
            </div>

            {/* Notes */}
            <div className="px-5 py-4">
              <div className="flex items-center gap-2 mb-3">
                <FileText size={13} className="text-gray-400" />
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Notas internas</span>
              </div>
              <NotesList conversationId={conversationId} />
            </div>

            {/* Activity timeline */}
            {activities.length > 0 && (
              <div className="px-5 py-4">
                <div className="flex items-center gap-2 mb-3">
                  <Activity size={13} className="text-gray-400" />
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Atividades</span>
                </div>
                <div className="space-y-2">
                  {activities.map((act) => {
                    const iconMap: Record<string, { icon: React.ReactNode; color: string }> = {
                      ASSIGNED: { icon: <UserCheck size={11} />, color: 'text-blue-500 bg-blue-50' },
                      UNASSIGNED: { icon: <UserCheck size={11} />, color: 'text-gray-400 bg-gray-100' },
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
              <div className="px-5 py-4">
                <div className="flex items-center gap-2 mb-3">
                  <MessageSquare size={13} className="text-gray-400" />
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Últimas mensagens</span>
                </div>
                <div className="space-y-2">
                  {messages.filter(m => !m.isSystem).map((msg) => {
                    const isOutbound = msg.direction === 'OUTBOUND'
                    return (
                      <div key={msg.id} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] px-3 py-1.5 rounded-xl text-xs ${
                          isOutbound ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-800'
                        }`}>
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
