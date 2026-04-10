'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { User, Tag, FileText, GitBranch, Bot, ShieldOff } from 'lucide-react'
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
  status: string
  pipelineStage: string | null
  conversationTags: Array<{ tag: TagItem }>
  assignedTo: { id: string; name: string } | null
  channel: { type: string; name: string } | null
  aiSalesEnabled?: boolean
  aiSalesMessageCount?: number
  qualificationScore?: number | null
  qualificationNotes?: string | null
  handoffBriefing?: string | null
}

interface UserItem {
  id: string
  name: string
  role: string
}

interface LeadDetailsProps {
  conversationId: string | null
}

const CHANNEL_COLORS: Record<string, string> = {
  WHATSAPP: 'bg-green-100 text-green-700',
  INSTAGRAM: 'bg-pink-50 text-pink-700',
  FACEBOOK: 'bg-blue-50 text-blue-700',
}

export function LeadDetails({ conversationId }: LeadDetailsProps) {
  const { data: session } = useSession()
  const [conversation, setConversation] = useState<ConversationDetail | null>(null)
  const [users, setUsers] = useState<UserItem[]>([])
  const [stages, setStages] = useState<Array<{ id: string; name: string; color: string }>>([])
  const [aiToggling, setAiToggling] = useState(false)
  const [aiUnblocking, setAiUnblocking] = useState(false)

  const isAdmin = session?.user.role === 'ADMIN'

  useEffect(() => {
    if (!conversationId) return
    setConversation(null)
    fetch(`/api/conversations/${conversationId}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: ConversationDetail | null) => { if (data) setConversation(data) })
  }, [conversationId])

  useEffect(() => {
    Promise.all([
      isAdmin ? fetch('/api/users').then(r => r.ok ? r.json() : { users: [] }) : Promise.resolve({ users: [] }),
      fetch('/api/pipeline/stages').then(r => r.ok ? r.json() : { stages: [] }),
    ]).then(([u, s]) => {
      setUsers(u.users ?? [])
      setStages(s.stages ?? [])
    }).catch(() => {})
  }, [isAdmin])

  // Real-time updates — re-fetch full conversation to get all fields
  useEffect(() => {
    if (!conversationId) return
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      const cid = detail?.conversationId
      if (cid === conversationId) {
        fetch(`/api/conversations/${conversationId}`)
          .then(r => r.ok ? r.json() : null)
          .then((data: ConversationDetail | null) => { if (data) setConversation(data) })
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

  async function assignTo(userId: string | null) {
    if (!conversationId) return
    await fetch(`/api/conversations/${conversationId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    setConversation(c =>
      c ? { ...c, assignedTo: users.find(u => u.id === userId) ?? null } : c
    )
  }

  async function toggleAiSales(enabled: boolean) {
    if (!conversationId) return
    setAiToggling(true)
    try {
      const res = await fetch('/api/agents/vendedor/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, enabled }),
      })
      if (res.ok) {
        setConversation(c => c ? { ...c, aiSalesEnabled: enabled } : c)
      }
    } catch (err) {
      console.error('Failed to toggle AI:', err)
    } finally {
      setAiToggling(false)
    }
  }

  async function unblockAi() {
    if (!conversationId) return
    setAiUnblocking(true)
    try {
      await fetch('/api/agents/vendedor/unblock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId }),
      })
    } catch (err) {
      console.error('Failed to unblock AI:', err)
    } finally {
      setAiUnblocking(false)
    }
  }

  if (!conversationId || !conversation) {
    return (
      <div className="w-80 border-l border-gray-100 bg-white flex items-center justify-center text-gray-400 text-sm">
        Selecione uma conversa
      </div>
    )
  }

  const initialTags = conversation.conversationTags?.map(ct => ct.tag) ?? []

  return (
    <div className="w-80 border-l border-gray-100 bg-white overflow-y-auto flex-shrink-0">
      {/* Header */}
      <div className="p-5 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900 text-sm">Detalhes do contato</h3>
      </div>

      <div className="p-5 space-y-5">
        {/* Contact Info */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4 space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <User size={13} className="text-gray-400" />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Contato</span>
          </div>
          <p className="font-semibold text-gray-900 text-sm">{conversation.contactName}</p>
          {conversation.contactPhone && (
            <p className="text-xs text-gray-500">{conversation.contactPhone}</p>
          )}
          {conversation.contactEmail && (
            <p className="text-xs text-gray-500">{conversation.contactEmail}</p>
          )}
          {conversation.channel && (
            <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${CHANNEL_COLORS[conversation.channel.type] ?? 'bg-gray-100 text-gray-600'}`}>
              {conversation.channel.name}
            </span>
          )}
        </div>

        {/* Assignment (admin only) */}
        {isAdmin && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Atribuído a</label>
            <select
              value={conversation.assignedTo?.id ?? ''}
              onChange={e => assignTo(e.target.value || null)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
            >
              <option value="">Não atribuído</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        )}

        {/* Pipeline Stage */}
        {stages.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Etapa</label>
            <select
              value={conversation.pipelineStage ?? ''}
              onChange={e => {
                const v = e.target.value
                if (!v) return // prevent selecting the disabled placeholder
                patchConversation({ pipelineStage: v })
              }}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
            >
              <option value="" disabled>Selecione uma etapa</option>
              {stages.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          </div>
        )}

        {/* Stage History */}
        {conversation.pipelineStage && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <GitBranch size={13} className="text-gray-400" />
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Histórico de etapas</span>
            </div>
            <StageHistoryTimeline conversationId={conversationId} />
          </div>
        )}

        {/* AI Vendedor */}
        {isAdmin && (
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot size={13} className="text-violet-500" />
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Sora</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={conversation.aiSalesEnabled ?? false}
                  onChange={e => toggleAiSales(e.target.checked)}
                  disabled={aiToggling}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 rounded-full peer-checked:bg-violet-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
              </label>
            </div>

            {/* Message count */}
            {(conversation.aiSalesMessageCount ?? 0) > 0 && (
              <p className="text-xs text-gray-500">
                {conversation.aiSalesMessageCount} msgs enviadas
              </p>
            )}

            {/* Qualification score */}
            {conversation.qualificationScore != null && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Score:</span>
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                  conversation.qualificationScore >= 7
                    ? 'bg-green-100 text-green-700'
                    : conversation.qualificationScore >= 4
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-red-100 text-red-700'
                }`}>
                  {conversation.qualificationScore}/10
                </span>
              </div>
            )}

            {/* Qualification notes */}
            {conversation.qualificationNotes && (
              <div className="space-y-1">
                <span className="text-xs font-medium text-gray-500">Observações da Sora</span>
                <p className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2 leading-relaxed">
                  {conversation.qualificationNotes}
                </p>
              </div>
            )}

            {/* Handoff briefing */}
            {conversation.handoffBriefing && (
              <div className="space-y-1">
                <span className="text-xs font-medium text-violet-600">Briefing</span>
                <p className="text-xs text-gray-600 bg-violet-50 rounded-lg p-2 leading-relaxed">
                  {conversation.handoffBriefing}
                </p>
              </div>
            )}

            {/* Unblock button (only when AI is active) */}
            {conversation.aiSalesEnabled && (
              <button
                onClick={unblockAi}
                disabled={aiUnblocking}
                className="flex items-center gap-1.5 text-xs text-violet-600 hover:text-violet-700 disabled:opacity-50"
              >
                <ShieldOff size={12} />
                {aiUnblocking ? 'Desbloqueando...' : 'Reativar Sora (se bloqueada)'}
              </button>
            )}
          </div>
        )}

        {/* Tags */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Tag size={13} className="text-gray-400" />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tags</span>
          </div>
          <TagSelector
            conversationId={conversationId}
            initialTags={initialTags}
          />
        </div>

        {/* Notes */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <FileText size={13} className="text-gray-400" />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Notas internas</span>
          </div>
          <NotesList conversationId={conversationId} />
        </div>
      </div>
    </div>
  )
}
