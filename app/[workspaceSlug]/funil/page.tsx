'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { LeadDrawer } from '@/components/LeadDrawer'
import { usePusherChannel } from '@/hooks/usePusher'

const FUNNEL_STAGES = [
  { name: 'Não Atribuído',   color: '#6B7280', auto: true  },
  { name: 'Aguardando',      color: '#F59E0B', auto: true  },
  { name: 'Em Atendimento',  color: '#3B82F6', auto: true  },
  { name: 'Reunião Marcada', color: '#8B5CF6', auto: false },
  { name: 'Contrato Fechado',color: '#10B981', auto: false },
]

interface Conversation {
  id: string
  contactName: string
  lastMessagePreview: string | null
  lastMessageAt: string | null
  pipelineStage: string | null
  assignedToId: string | null
  contactPhotoUrl: string | null
  channel: { type: string }
}

const CHANNEL_COLORS: Record<string, string> = {
  WHATSAPP: '#25D366',
  INSTAGRAM: '#E4405F',
  FACEBOOK: '#1877F2',
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

const AVATAR_COLORS = [
  '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#EC4899',
  '#06B6D4', '#6366F1', '#84CC16', '#F97316',
]

function getAvatarColor(name: string): string {
  const code = name.charCodeAt(0) % AVATAR_COLORS.length
  return AVATAR_COLORS[code]
}

export default function FunilPage() {
  const { data: session } = useSession()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const workspaceId = session?.user.workspaceId

  // Real-time updates via Pusher (workspace-level)
  usePusherChannel(`workspace-${workspaceId}`, {
    'conversation-updated': (data: unknown) => {
      const { conversationId, conversation } = (data as { conversationId: string; conversation: Partial<Conversation> })
      setConversations(cs => cs.map(c => c.id === conversationId ? { ...c, ...conversation } : c))
      window.dispatchEvent(new CustomEvent('conversation-updated', { detail: data }))
    },
  })

  // Real-time updates for the selected conversation
  usePusherChannel(selectedId ? `conversation-${selectedId}` : '', {
    'note-added': (data: unknown) => {
      window.dispatchEvent(new CustomEvent('note-added', { detail: data }))
    },
    'message-updated': (data: unknown) => {
      window.dispatchEvent(new CustomEvent('message-updated', { detail: data }))
    },
  })

  useEffect(() => {
    fetch('/api/conversations?limit=200')
      .then((r) => r.json())
      .then((data) => setConversations(data.conversations ?? []))
      .finally(() => setLoading(false))
  }, [])

  function getConversationsForStage(stageName: string) {
    if (stageName === 'Não Atribuído') {
      return conversations.filter(
        (c) => !c.pipelineStage || c.pipelineStage === 'Não Atribuído'
      )
    }
    return conversations.filter((c) => c.pipelineStage === stageName)
  }

  async function moveToStage(conversationId: string, stageName: string) {
    await fetch(`/api/conversations/${conversationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pipelineStage: stageName }),
    })
    setConversations((cs) =>
      cs.map((c) => (c.id === conversationId ? { ...c, pipelineStage: stageName } : c))
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        Carregando funil...
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col">
      <div className="h-16 px-6 border-b border-gray-200 bg-white flex items-center">
        <h1 className="font-semibold text-gray-900">Funil de Conversas</h1>
      </div>

      <div className="flex-1 overflow-x-auto p-6">
        <div className="flex gap-4 h-full min-w-max">
          {FUNNEL_STAGES.map((stage) => {
            const stageConvs = getConversationsForStage(stage.name)
            const isAutoStage = stage.auto

            return (
              <div
                key={stage.name}
                className="w-64 flex flex-col"
                onDragOver={(e) => {
                  if (!isAutoStage) e.preventDefault()
                }}
                onDrop={(e) => {
                  if (!isAutoStage) {
                    e.preventDefault()
                    if (draggedId) moveToStage(draggedId, stage.name)
                    setDraggedId(null)
                  }
                }}
              >
                {/* Stage Header */}
                <div
                  className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg"
                  style={{ backgroundColor: `${stage.color}18` }}
                >
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: stage.color }}
                  />
                  <span className="font-medium text-gray-900 text-sm flex-1">{stage.name}</span>
                  <span className="text-xs text-gray-500 bg-white px-1.5 py-0.5 rounded-full">
                    {stageConvs.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex-1 space-y-2 overflow-y-auto">
                  {stageConvs.map((conv) => (
                    <div
                      key={conv.id}
                      draggable={!isAutoStage}
                      onDragStart={() => {
                        if (!isAutoStage) setDraggedId(conv.id)
                      }}
                      onClick={() => setSelectedId(conv.id)}
                      className={`bg-white border border-gray-200 rounded-xl p-3 hover:shadow-sm transition-shadow ${
                        !isAutoStage ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                      }`}
                    >
                      <div className="flex items-start gap-2 mb-2">
                        <div className="flex-shrink-0">
                          {conv.contactPhotoUrl ? (
                            <img
                              src={conv.contactPhotoUrl}
                              alt={conv.contactName}
                              className="w-10 h-10 rounded-full object-cover"
                            />
                          ) : (
                            <div
                              className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white"
                              style={{ backgroundColor: getAvatarColor(conv.contactName) }}
                            >
                              {getInitials(conv.contactName)}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <p className="font-medium text-gray-900 text-sm truncate">
                              {conv.contactName}
                            </p>
                            <span className="text-xs text-gray-400 flex-shrink-0">
                              {timeAgo(conv.lastMessageAt)}
                            </span>
                          </div>
                          {conv.lastMessagePreview && (
                            <p className="text-xs text-gray-500 truncate mt-0.5">
                              {conv.lastMessagePreview.slice(0, 60)}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-end">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{
                            backgroundColor: CHANNEL_COLORS[conv.channel.type] ?? '#9CA3AF',
                          }}
                          title={conv.channel.type}
                        />
                      </div>
                    </div>
                  ))}

                  {stageConvs.length === 0 && (
                    <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center text-gray-400 text-xs">
                      {isAutoStage ? 'Arraste de etapas manuais' : 'Arraste conversas aqui'}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <LeadDrawer conversationId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  )
}
