'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Search, Filter } from 'lucide-react'
import { ConversationList } from '@/components/inbox/ConversationList'
import { MessageThread } from '@/components/inbox/MessageThread'
import { LeadDetails } from '@/components/inbox/LeadDetails'
import { usePusherChannel } from '@/hooks/usePusher'

type FilterStatus = 'all' | 'UNASSIGNED' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED'

const STATUS_FILTERS: Array<{ value: FilterStatus; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'UNASSIGNED', label: 'Não atribuídas' },
  { value: 'ASSIGNED', label: 'Atribuídas' },
  { value: 'IN_PROGRESS', label: 'Em andamento' },
  { value: 'RESOLVED', label: 'Resolvidas' },
]

interface Conversation {
  id: string
  contactName: string
  lastMessagePreview: string | null
  lastMessageAt: string | null
  unreadCount: number
  status: string
  channel: { type: 'WHATSAPP' | 'INSTAGRAM' | 'FACEBOOK' }
  assignedTo: { name: string } | null
}

export default function InboxPage() {
  const { data: session } = useSession()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [search, setSearch] = useState('')
  const [assignedToMe, setAssignedToMe] = useState(false)

  const workspaceId = session?.user.workspaceId

  const fetchConversations = useCallback(async () => {
    const params = new URLSearchParams()
    if (filter !== 'all') params.set('status', filter)
    if (assignedToMe) params.set('assignedTo', 'me')

    const res = await fetch(`/api/conversations?${params}`)
    const data = await res.json()
    setConversations(data.conversations ?? [])
    setLoading(false)
  }, [filter, assignedToMe])

  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  // Real-time updates via Pusher
  usePusherChannel(`workspace-${workspaceId}`, {
    'new-message': (data: unknown) => {
      const { conversationId } = data as { conversationId: string }
      // Refresh conversations to update preview and unread count
      fetchConversations()
    },
    'message-sent': () => {
      fetchConversations()
    },
    'conversation-assigned': () => {
      fetchConversations()
    },
  })

  const selectedConversation = conversations.find((c) => c.id === selectedId)

  const filteredConversations = conversations.filter((c) =>
    search
      ? c.contactName.toLowerCase().includes(search.toLowerCase()) ||
        c.lastMessagePreview?.toLowerCase().includes(search.toLowerCase())
      : true
  )

  return (
    <div className="h-screen flex overflow-hidden">
      {/* Column 1: Conversation List (320px) */}
      <div className="w-80 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h1 className="font-semibold text-gray-900">Caixa de Entrada</h1>
            <button
              onClick={() => setAssignedToMe((v) => !v)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                assignedToMe
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              Meus
            </button>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar conversa..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Status filters */}
          <div className="flex gap-1 overflow-x-auto pb-1">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-full transition-colors ${
                  filter === f.value
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <ConversationList
          conversations={filteredConversations as Parameters<typeof ConversationList>[0]['conversations']}
          selectedId={selectedId}
          onSelect={setSelectedId}
          loading={loading}
        />
      </div>

      {/* Column 2: Message Thread */}
      <div className="flex-1 flex flex-col min-w-0">
        <MessageThread
          conversationId={selectedId}
          contactName={selectedConversation?.contactName}
        />
      </div>

      {/* Column 3: Lead Details */}
      <LeadDetails conversationId={selectedId} />
    </div>
  )
}
