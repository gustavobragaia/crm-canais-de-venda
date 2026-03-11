'use client'

import { useState, useEffect } from 'react'
import { LeadDrawer } from '@/components/LeadDrawer'

interface WorkspaceUser {
  id: string
  name: string
  email: string
  role: string
  avatarUrl: string | null
  agentRole: string | null
  isActive: boolean
}

interface Conversation {
  id: string
  contactName: string
  lastMessagePreview: string | null
  lastMessageAt: string | null
  pipelineStage: string | null
  assignedToId: string | null
  aiEnabled: boolean
  contactPhotoUrl: string | null
  channel: { type: string }
}

const CHANNEL_COLORS: Record<string, string> = {
  WHATSAPP: '#25D366',
  INSTAGRAM: '#E4405F',
  FACEBOOK: '#1877F2',
}

const AVATAR_COLORS = [
  '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#EC4899',
  '#06B6D4', '#6366F1', '#84CC16', '#F97316',
]

function getAvatarColor(name: string): string {
  const code = name.charCodeAt(0) % AVATAR_COLORS.length
  return AVATAR_COLORS[code]
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
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

export default function PipelinePage() {
  const [users, setUsers] = useState<WorkspaceUser[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/users').then((r) => r.ok ? r.json() : { users: [] }),
      fetch('/api/conversations?limit=200').then((r) => r.ok ? r.json() : { conversations: [] }),
    ]).then(([usersData, convsData]) => {
      setUsers(usersData.users ?? [])
      setConversations(convsData.conversations ?? [])
      setLoading(false)
    })
  }, [])

  function getConversationsForUser(userId: string | null) {
    if (userId === null) {
      return conversations.filter((c) => !c.assignedToId)
    }
    return conversations.filter((c) => c.assignedToId === userId)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        Carregando atendimentos...
      </div>
    )
  }

  // Columns: unassigned + each user
  const columns = [
    { id: null as string | null, name: 'Não Atribuído', color: '#6B7280' },
    ...users.map((u) => ({ id: u.id, name: u.name, color: getAvatarColor(u.name) })),
  ]

  return (
    <div className="h-screen flex flex-col">
      <div className="h-16 px-6 border-b border-gray-200 bg-white flex items-center">
        <h1 className="font-semibold text-gray-900">Atendimento por Membro</h1>
      </div>

      <div className="flex-1 overflow-x-auto p-6">
        <div className="flex gap-4 h-full min-w-max">
          {columns.map((col) => {
            const colConvs = getConversationsForUser(col.id)
            const user = col.id ? users.find((u) => u.id === col.id) : null

            return (
              <div key={col.id ?? 'unassigned'} className="w-64 flex flex-col">
                {/* Column Header */}
                <div
                  className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg"
                  style={{ backgroundColor: `${col.color}18` }}
                >
                  {/* Avatar */}
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                    style={{ backgroundColor: col.color }}
                  >
                    {getInitials(col.name)}
                  </div>
                  <span className="font-medium text-gray-900 text-sm flex-1 truncate">
                    {col.name}
                  </span>
                  <span className="text-xs text-gray-500 bg-white px-1.5 py-0.5 rounded-full flex-shrink-0">
                    {colConvs.length}
                  </span>
                </div>

                {/* User role badge */}
                {user?.agentRole && (
                  <p className="text-xs text-gray-400 px-1 mb-2 truncate">{user.agentRole}</p>
                )}

                {/* Cards */}
                <div className="flex-1 space-y-2 overflow-y-auto">
                  {colConvs.map((conv) => (
                    <div
                      key={conv.id}
                      onClick={() => setSelectedId(conv.id)}
                      className="bg-white border border-gray-200 rounded-xl p-3 cursor-pointer hover:shadow-sm transition-shadow"
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

                  {colConvs.length === 0 && (
                    <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center text-gray-400 text-xs">
                      Nenhuma conversa
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
