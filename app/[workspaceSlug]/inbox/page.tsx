'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Search, AlertTriangle, ChevronDown } from 'lucide-react'
import Link from 'next/link'
import { ConversationList } from '@/components/inbox/ConversationList'
import { MessageThread } from '@/components/inbox/MessageThread'
import { LeadDetails } from '@/components/inbox/LeadDetails'
import { usePusherChannel } from '@/hooks/usePusher'

type FilterStatus = 'all' | 'UNASSIGNED' | 'ASSIGNED' | 'IN_PROGRESS' | 'WAITING_CLIENT' | 'RESOLVED'

const STATUS_FILTERS: Array<{ value: FilterStatus; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'UNASSIGNED', label: 'Não atribuídas' },
  { value: 'ASSIGNED', label: 'Atribuídas' },
  { value: 'IN_PROGRESS', label: 'Em andamento' },
  { value: 'WAITING_CLIENT', label: 'Aguardando' },
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
  aiSalesEnabled?: boolean
  source?: string | null
  pipelineStage?: string | null
  qualificationScore?: number | null
  aiSalesMessageCount?: number
  dispatchListId?: string | null
}

interface DispatchList {
  id: string
  name: string
}

interface BillingData {
  subscriptionStatus: string
  conversationsThisMonth: number
  maxConversationsPerMonth: number
}

export default function InboxPage() {
  const { data: session } = useSession()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [assignedToMe, setAssignedToMe] = useState(false)
  const [billing, setBilling] = useState<BillingData | null>(null)
  const [sourceFilter, setSourceFilter] = useState<'all' | 'organic' | string>('organic') // 'all' | 'organic' | listId
  const [lists, setLists] = useState<DispatchList[]>([])
  const [pipelineFilter, setPipelineFilter] = useState('')

  const workspaceId = session?.user.workspaceId
  const workspaceSlug = session?.user.workspaceSlug ?? ''

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchInput), 400)
    return () => clearTimeout(t)
  }, [searchInput])

  const buildParams = useCallback((p: number) => {
    const params = new URLSearchParams()
    params.set('page', String(p))
    if (filter !== 'all') params.set('status', filter)
    if (assignedToMe) params.set('assignedTo', 'me')
    if (searchQuery) params.set('search', searchQuery)
    if (sourceFilter === 'organic') params.set('source', 'organic')
    else if (sourceFilter !== 'all') {
      params.set('source', 'dispatch')
      params.set('dispatchListId', sourceFilter)
    }
    if (pipelineFilter) params.set('pipelineStage', pipelineFilter)
    return params
  }, [filter, assignedToMe, searchQuery, sourceFilter, pipelineFilter])

  const resetAndFetch = useCallback(async () => {
    setLoading(true)
    setPage(1)
    setHasMore(true)
    const res = await fetch(`/api/conversations?${buildParams(1)}`)
    const data = await res.json()
    setConversations(data.conversations ?? [])
    setHasMore(data.hasMore ?? false)
    setLoading(false)
  }, [buildParams])

  // Silent refresh: updates conversations without showing skeleton loader
  const silentRefresh = useCallback(async () => {
    const res = await fetch(`/api/conversations?${buildParams(1)}`)
    const data = await res.json()
    setConversations(data.conversations ?? [])
    setHasMore(data.hasMore ?? false)
    setPage(1)
  }, [buildParams])

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    const nextPage = page + 1
    const res = await fetch(`/api/conversations?${buildParams(nextPage)}`)
    const data = await res.json()
    setConversations(prev => [...prev, ...(data.conversations ?? [])])
    setHasMore(data.hasMore ?? false)
    setPage(nextPage)
    setLoadingMore(false)
  }, [loadingMore, hasMore, page, buildParams])

  useEffect(() => {
    resetAndFetch()
  }, [resetAndFetch])

  useEffect(() => {
    if (!session) return
    fetch('/api/billing')
      .then(r => r.json())
      .then((data: BillingData) => setBilling(data))
      .catch(() => null)
    fetch('/api/agents/listas')
      .then(r => r.ok ? r.json() : { lists: [] })
      .then((data: { lists?: DispatchList[] }) => setLists(data.lists ?? []))
      .catch(() => null)
  }, [session])

  // Real-time updates via Pusher (workspace-level events)
  usePusherChannel(workspaceId ? `workspace-${workspaceId}` : '', {
    'new-message': () => { silentRefresh() },
    'history-message': () => { silentRefresh() },
    'message-sent': () => { silentRefresh() },
    'conversation-assigned': () => { silentRefresh() },
    'conversation-updated': () => { silentRefresh() },
  })

  const selectedConversation = conversations.find((c) => c.id === selectedId)

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
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Origin + Pipeline filters */}
          <div className="flex gap-2 mb-2">
            <div className="relative flex-1">
              <select
                value={sourceFilter}
                onChange={e => setSourceFilter(e.target.value)}
                className="w-full appearance-none text-xs px-2.5 py-1.5 pr-7 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-700 cursor-pointer"
              >
                <option value="all">Todas as origens</option>
                <option value="organic">Caixa de entrada</option>
                {lists.length > 0 && (
                  <optgroup label="Disparos">
                    {lists.map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            <div className="relative flex-1">
              <select
                value={pipelineFilter}
                onChange={e => setPipelineFilter(e.target.value)}
                className="w-full appearance-none text-xs px-2.5 py-1.5 pr-7 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-700 cursor-pointer"
              >
                <option value="">Todas etapas</option>
                <optgroup label="Agente SDR de IA">
                  <option value="Disparo Enviado">Disparo Enviado</option>
                  <option value="Disparo Respondido">Disparo Respondido</option>
                  <option value="SDR Ativo">SDR Ativo</option>
                </optgroup>
                <optgroup label="Etapas Padrão">
                  <option value="Não Atribuído">Não Atribuído</option>
                  <option value="Aguardando">Aguardando</option>
                  <option value="Em Atendimento">Em Atendimento</option>
                  <option value="Reunião Marcada">Reunião Marcada</option>
                  <option value="Contrato Fechado">Contrato Fechado</option>
                </optgroup>
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
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

        {billing?.subscriptionStatus === 'TRIAL' &&
          billing.conversationsThisMonth >= billing.maxConversationsPerMonth && (
          <div className="mx-2 my-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex items-start gap-2">
            <AlertTriangle size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-amber-800">Limite de conversas atingido</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Novas conversas estão bloqueadas.{' '}
                <Link
                  href={`/${workspaceSlug}/settings?tab=billing`}
                  className="underline font-medium hover:text-amber-900"
                >
                  Fazer upgrade →
                </Link>
              </p>
            </div>
          </div>
        )}

        <ConversationList
          conversations={conversations as Parameters<typeof ConversationList>[0]['conversations']}
          selectedId={selectedId}
          onSelect={setSelectedId}
          loading={loading}
          loadingMore={loadingMore}
          onSentinelVisible={loadMore}
        />
      </div>

      {/* Column 2: Message Thread */}
      <div className="flex-1 flex flex-col min-w-0">
        <MessageThread
          conversationId={selectedId}
          contactName={selectedConversation?.contactName}
          aiSalesEnabled={selectedConversation?.aiSalesEnabled}
          aiSalesMessageCount={selectedConversation?.aiSalesMessageCount}
          qualificationScore={selectedConversation?.qualificationScore}
          isDispatch={!!selectedConversation?.dispatchListId}
          onToggleAi={selectedId && !!selectedConversation?.dispatchListId ? async () => {
            const current = selectedConversation?.aiSalesEnabled ?? false
            await fetch('/api/agents/vendedor/toggle', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ conversationId: selectedId, enabled: !current }),
            })
            resetAndFetch()
          } : undefined}
        />
      </div>

      {/* Column 3: Lead Details */}
      <LeadDetails conversationId={selectedId} />
    </div>
  )
}
