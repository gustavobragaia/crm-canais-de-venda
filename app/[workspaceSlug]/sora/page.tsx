'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useSearchParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Loader2, TrendingUp, MessageSquare, Users, RefreshCw,
  Plus, Trash2, ChevronDown, ChevronRight, Check, Save,
  Upload, FileText,
} from 'lucide-react'

// ─── Brand icons ───

function WhatsAppIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="6" fill="#25D366"/>
      <path d="M12 4C7.58 4 4 7.58 4 12c0 1.42.37 2.75 1.02 3.91L4 20l4.2-1.01A7.94 7.94 0 0012 20c4.42 0 8-3.58 8-8s-3.58-8-8-8zm3.9 11.1c-.16.45--.93.87-1.28.92-.35.05-.66.23-2.23-.47-1.85-.82-3.04-2.68-3.13-2.81-.09-.12-.74--.98-.74-1.87s.47-1.33.64-1.51c.16-.18.36-.22.47-.22l.34.01c.11 0 .26-.04.4.3.15.35.51 1.24.56 1.33.05.09.08.2.02.32-.06.12-.09.19-.18.3-.09.1-.19.22-.27.3-.09.09-.19.19-.08.37.11.18.5.82 1.07 1.33.74.65 1.36.85 1.54.94.18.09.29.07.4-.04.11-.12.47-.54.59-.73.12-.18.24-.15.4-.09.16.06 1.02.48 1.2.57.18.09.3.13.34.2.04.08.04.45-.12.9z" fill="white"/>
    </svg>
  )
}

function InstagramIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="igGrad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f09433"/>
          <stop offset="25%" stopColor="#e6683c"/>
          <stop offset="50%" stopColor="#dc2743"/>
          <stop offset="75%" stopColor="#cc2366"/>
          <stop offset="100%" stopColor="#bc1888"/>
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="6" fill="url(#igGrad)"/>
      <rect x="7" y="7" width="10" height="10" rx="3" stroke="white" strokeWidth="1.5" fill="none"/>
      <circle cx="12" cy="12" r="2.5" stroke="white" strokeWidth="1.5" fill="none"/>
      <circle cx="17" cy="7" r="0.8" fill="white"/>
    </svg>
  )
}

function FacebookIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="6" fill="#1877F2"/>
      <path d="M15 8h-1.5C13.1 8 13 8.3 13 9v1.5h2l-.3 2H13V18h-2v-5.5H9.5v-2H11V9c0-1.7 1-2.5 2.5-2.5H15V8z" fill="white"/>
    </svg>
  )
}

function ChannelIcon({ type, size = 20 }: { type: string; size?: number }) {
  if (type === 'WHATSAPP') return <WhatsAppIcon size={size} />
  if (type === 'INSTAGRAM') return <InstagramIcon size={size} />
  if (type === 'FACEBOOK') return <FacebookIcon size={size} />
  return null
}

// ─── Types ───

interface SoraBilling {
  used: number
  limit: number
  extras: number
  resetDate: string | null
  isOverflow: boolean
  hasCapacity: boolean
}

interface SoraConversation {
  id: string
  contactName: string
  channelType: string
  aiSalesMessageCount: number
  qualificationScore: number | null
  pipelineStage: string | null
}

interface AiSalesConfig {
  id?: string
  agentName: string | null
  tone: string
  businessName: string | null
  businessDescription: string | null
  targetAudience: string | null
  differentials: string | null
  productsServices: Array<{ name: string; price: string; description: string }>
  commonObjections: Array<{ objection: string; response: string }>
  objectives: string[]
  calendarUrl: string | null
  systemPrompt: string | null
  useCustomPrompt: boolean
  model: string
  maxMessagesPerConversation: number
  debounceSeconds: number
  blockTtlSeconds: number
  handoffMinScore: number
}

interface TeamUser {
  id: string
  name: string
  email: string
  role: string
  specializations: string[]
  calendarUrl: string | null
}

interface KnowledgeDoc {
  id: string
  name: string
  fileType: string | null
  chunkCount: number
  createdAt: string
}

interface Channel {
  id: string
  type: string
  name: string
  phoneNumber: string | null
  pageName: string | null
  isActive: boolean
  aiAutoActivate: boolean
}

type Tab = 'visao-geral' | 'configurar' | 'equipe' | 'canais'

const TONE_MAP: Record<string, string> = {
  formal: 'Profissional',
  informal: 'Amigável',
  descontraido: 'Direto',
}

// ─── Helpers ───

function TonePreview({ agentName, businessName, tone }: { agentName: string; businessName: string; tone: string }) {
  const toneText: Record<string, string> = {
    formal: `Olá! Sou ${agentName || 'Sora'}, assistente da ${businessName || 'empresa'}. Como posso ajudá-lo?`,
    informal: `Oi! Sou a ${agentName || 'Sora'} da ${businessName || 'empresa'}. Como posso te ajudar? 😊`,
    descontraido: `E aí! Aqui é a ${agentName || 'Sora'}. Em que posso te ajudar?`,
  }
  return (
    <div className="mt-3 p-3 bg-violet-50 border border-violet-100 rounded-xl text-sm text-violet-800 italic">
      "{toneText[tone] ?? toneText.informal}"
    </div>
  )
}

function SectionCard({ title, icon, children, collapsible = false }: {
  title: string
  icon: string
  children: React.ReactNode
  collapsible?: boolean
}) {
  const [open, setOpen] = useState(!collapsible)
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => collapsible && setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-6 py-4 ${collapsible ? 'cursor-pointer hover:bg-gray-50' : 'cursor-default'}`}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-lg">{icon}</span>
          <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
        </div>
        {collapsible && (open ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />)}
      </button>
      {open && <div className="px-6 pb-6 space-y-4 border-t border-gray-100 pt-4">{children}</div>}
    </div>
  )
}

// ─── Main Page ───

export default function SoraPage() {
  const { data: session } = useSession()
  const slug = session?.user?.workspaceSlug ?? ''
  const searchParams = useSearchParams()
  const router = useRouter()

  const tabParam = (searchParams.get('tab') ?? 'visao-geral') as Tab
  const [activeTab, setActiveTab] = useState<Tab>(tabParam)

  // Visão Geral state
  const [billing, setBilling] = useState<SoraBilling | null>(null)
  const [conversations, setConversations] = useState<SoraConversation[]>([])
  const [stats, setStats] = useState<{ activeConversations: number; avgScore: number; handoffs: number; qualificationRate: number } | null>(null)
  const [loadingOverview, setLoadingOverview] = useState(true)

  // Config state
  const [config, setConfig] = useState<AiSalesConfig>({
    agentName: 'Sora',
    tone: 'informal',
    businessName: null,
    businessDescription: null,
    targetAudience: null,
    differentials: null,
    productsServices: [],
    commonObjections: [],
    objectives: ['qualify', 'schedule'],
    calendarUrl: null,
    systemPrompt: null,
    useCustomPrompt: false,
    model: 'gpt-4.1-mini',
    maxMessagesPerConversation: 50,
    debounceSeconds: 15,
    blockTtlSeconds: 2400,
    handoffMinScore: 7,
  })
  const [soraOverflowEnabled, setSoraOverflowEnabled] = useState(true)
  const [soraEnabled, setSoraEnabled] = useState(false)
  const [togglingEnabled, setTogglingEnabled] = useState(false)
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  // Knowledge Base state
  const [docs, setDocs] = useState<KnowledgeDoc[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Team state
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([])
  const [loadingTeam, setLoadingTeam] = useState(true)
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [specInput, setSpecInput] = useState('')

  // Channels state
  const [channels, setChannels] = useState<Channel[]>([])
  const [loadingChannels, setLoadingChannels] = useState(true)
  const [togglingChannelId, setTogglingChannelId] = useState<string | null>(null)

  // Sync tab with URL
  function setTab(t: Tab) {
    setActiveTab(t)
    router.replace(`/${slug}/sora?tab=${t}`, { scroll: false })
  }

  // Load soraEnabled + channels on mount (needed for header)
  useEffect(() => {
    fetch('/api/agents/vendedor/config')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setSoraEnabled(data.soraEnabled ?? false) })
      .catch(() => {})
    fetch('/api/channels')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) { setChannels(data.channels ?? []); setLoadingChannels(false) } })
      .catch(() => {})
  }, [])

  // Load overview data
  useEffect(() => {
    if (activeTab !== 'visao-geral') return
    async function load() {
      setLoadingOverview(true)
      try {
        const [billingRes, convsRes] = await Promise.all([
          fetch('/api/sora/billing'),
          fetch('/api/sora/conversations'),
        ])
        if (billingRes.ok) setBilling(await billingRes.json())
        if (convsRes.ok) {
          const data = await convsRes.json()
          setConversations(data.conversations ?? [])
          setStats(data.stats ?? null)
        }
      } catch (e) { console.error(e) }
      finally { setLoadingOverview(false) }
    }
    load()
  }, [activeTab])

  // Load config
  useEffect(() => {
    if (activeTab !== 'configurar') return
    async function load() {
      setLoadingConfig(true)
      try {
        const [configRes, docsRes] = await Promise.all([
          fetch('/api/agents/vendedor/config'),
          fetch('/api/agents/vendedor/knowledge'),
        ])
        if (configRes.ok) {
          const data = await configRes.json()
          if (data.config) setConfig({ ...config, ...data.config })
          setSoraOverflowEnabled(data.soraOverflowEnabled ?? true)
          setSoraEnabled(data.soraEnabled ?? false)
        }
        if (docsRes.ok) {
          const data = await docsRes.json()
          setDocs(data.documents ?? [])
        }
      } catch (e) { console.error(e) }
      finally { setLoadingConfig(false) }
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  // Load team
  useEffect(() => {
    if (activeTab !== 'equipe') return
    async function load() {
      setLoadingTeam(true)
      try {
        const res = await fetch('/api/users')
        if (res.ok) {
          const data = await res.json()
          setTeamUsers(data.users ?? [])
        }
      } catch (e) { console.error(e) }
      finally { setLoadingTeam(false) }
    }
    load()
  }, [activeTab])

  // Load channels (needed for visao-geral + canais tab)
  useEffect(() => {
    if (activeTab !== 'visao-geral' && activeTab !== 'canais') return
    setLoadingChannels(true)
    fetch('/api/channels')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setChannels(data.channels ?? []) })
      .catch(() => {})
      .finally(() => setLoadingChannels(false))
  }, [activeTab])

  async function toggleChannelAI(channel: Channel) {
    setTogglingChannelId(channel.id)
    const next = !channel.aiAutoActivate
    try {
      const res = await fetch(`/api/channels/${channel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiAutoActivate: next }),
      })
      if (!res.ok) throw new Error()
      setChannels(prev => prev.map(c => c.id === channel.id ? { ...c, aiAutoActivate: next } : c))
      toast.success(next ? 'Sora ativada neste canal' : 'Sora desativada neste canal')
    } catch {
      toast.error('Erro ao atualizar canal.')
    } finally {
      setTogglingChannelId(null)
    }
  }

  async function toggleSoraEnabled() {
    setTogglingEnabled(true)
    const next = !soraEnabled
    try {
      const res = await fetch('/api/agents/vendedor/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ soraEnabled: next }),
      })
      if (!res.ok) throw new Error()
      setSoraEnabled(next)
      toast.success(next ? 'Sora ativada!' : 'Sora desativada.')
    } catch {
      toast.error('Erro ao atualizar status da Sora.')
    } finally {
      setTogglingEnabled(false)
    }
  }

  async function saveConfig() {
    setSaving(true)
    try {
      const res = await fetch('/api/agents/vendedor/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config, soraOverflowEnabled, soraEnabled }),
      })
      if (!res.ok) throw new Error()
      setSavedAt(new Date())
      toast.success('Configuração salva!')
    } catch {
      toast.error('Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  async function uploadFile(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/agents/vendedor/knowledge', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao fazer upload.')
      setDocs(prev => [data.document, ...prev])
      toast.success(`${file.name} adicionado (${data.document.chunkCount} chunks)`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao fazer upload.')
    } finally {
      setUploading(false)
    }
  }

  async function deleteDoc(id: string) {
    try {
      await fetch('/api/agents/vendedor/knowledge', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      setDocs(prev => prev.filter(d => d.id !== id))
    } catch {
      toast.error('Erro ao remover documento.')
    }
  }

  async function updateUserSpec(userId: string, specializations: string[]) {
    await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ specializations }),
    })
    setTeamUsers(prev => prev.map(u => u.id === userId ? { ...u, specializations } : u))
  }

  async function updateUserCalendar(userId: string, calendarUrl: string | null) {
    await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ calendarUrl }),
    })
    setTeamUsers(prev => prev.map(u => u.id === userId ? { ...u, calendarUrl } : u))
  }

  // Billing display helpers
  const usedPct = billing ? Math.min((billing.used / Math.max(billing.limit, 1)) * 100, 100) : 0
  const barColor = usedPct >= 100 ? 'bg-red-500' : usedPct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'
  const daysUntilReset = billing?.resetDate
    ? Math.max(0, Math.ceil((new Date(billing.resetDate).getTime() - Date.now()) / 86400000))
    : null
  const channelLabel: Record<string, string> = { WHATSAPP: 'WhatsApp', INSTAGRAM: 'Instagram', FACEBOOK: 'Facebook' }

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        {/* Avatar + active channel icons */}
        <div className="relative">
          <img src="/ai-avatar.svg" alt="Sora" className="w-12 h-12 rounded-full object-cover animate-pulse-subtle" />
          {/* Active channel icons — overlapping bottom-right */}
          {(() => {
            const active = channels.filter(c => c.aiAutoActivate)
            if (active.length === 0) return null
            return (
              <div className="absolute -bottom-1 -right-1 flex">
                {active.slice(0, 3).map((ch, i) => (
                  <div
                    key={ch.id}
                    style={{ marginLeft: i === 0 ? 0 : -6, zIndex: active.length - i }}
                    className="relative"
                  >
                    <ChannelIcon type={ch.type} size={16} />
                    {i === active.slice(0, 3).length - 1 && (
                      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-pulse border border-white" />
                    )}
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Sora</h1>
          <p className="text-sm text-gray-500">Agente SDR Inteligente</p>
        </div>

        {/* Tabs */}
        <div className="ml-auto flex items-center bg-gray-100 rounded-xl p-1 gap-1">
          {([
            { key: 'visao-geral', label: 'Visão Geral' },
            { key: 'configurar', label: 'Configurar' },
            { key: 'equipe', label: 'Equipe & Handoff' },
            { key: 'canais', label: 'Canais' },
          ] as { key: Tab; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Tab: Visão Geral ─── */}
      {activeTab === 'visao-geral' && (
        <div className="space-y-6">
          {/* Billing */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Atendimentos este mês</p>
                {loadingOverview ? (
                  <Loader2 size={20} className="animate-spin text-gray-300" />
                ) : (
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-gray-900">{billing?.used ?? 0}</span>
                    <span className="text-gray-400">/ {billing?.limit ?? 0}</span>
                  </div>
                )}
              </div>
              {billing && daysUntilReset !== null && (
                <div className="text-right text-xs text-gray-500">
                  <p className="font-medium text-gray-700">Reseta em {daysUntilReset} dias</p>
                  {billing.extras > 0 && <p className="text-amber-600 font-medium mt-0.5">{billing.extras} tokens extras</p>}
                </div>
              )}
            </div>

            {!loadingOverview && billing && (
              <>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
                  <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${usedPct}%` }} />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">
                    {billing.limit === 0 ? 'Sem plano ativo' : `${Math.max(0, billing.limit - billing.used)} restantes`}
                  </p>
                  <button
                    onClick={() => router.push(`/${slug}/settings?tab=tokens`)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 hover:text-amber-700"
                  >
                    <RefreshCw size={11} /> Recarregar
                  </button>
                </div>
                {usedPct >= 100 && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm font-medium text-red-800">
                    Atendimentos esgotados.{' '}
                    {billing.extras > 0 ? `Usando ${billing.extras} tokens extras.` : 'Recarregue para continuar.'}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Conversas ativas', value: stats?.activeConversations ?? conversations.length, Icon: MessageSquare, color: 'text-violet-600 bg-violet-50' },
              { label: 'Score médio', value: stats?.avgScore ? `${stats.avgScore}/10` : '—', Icon: TrendingUp, color: 'text-blue-600 bg-blue-50' },
              { label: 'Handoffs', value: stats?.handoffs ?? '—', Icon: Users, color: 'text-emerald-600 bg-emerald-50' },
              { label: 'Taxa qualificação', value: stats?.qualificationRate ? `${stats.qualificationRate}%` : '—', Icon: TrendingUp, color: 'text-amber-600 bg-amber-50' },
            ].map(({ label, value, Icon, color }) => (
              <div key={label} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${color}`}>
                  <Icon size={18} />
                </div>
                <p className="text-2xl font-bold text-gray-900">{loadingOverview ? '—' : value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Active conversations */}
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900 text-sm">Conversas com Sora ativa</h2>
                <p className="text-xs text-gray-400 mt-0.5">Clique para abrir no inbox</p>
              </div>
              {conversations.length === 0 && !loadingOverview && (
                <button
                  onClick={() => setTab('configurar')}
                  className="text-xs font-medium text-violet-600 hover:text-violet-800"
                >
                  Configurar Sora →
                </button>
              )}
            </div>

            {loadingOverview ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-gray-300" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-6">
                <img src="/ai-avatar.svg" alt="Sora" className="w-10 h-10 rounded-full opacity-30 mb-3" />
                <p className="text-sm font-medium text-gray-500">Nenhuma conversa ativa com a Sora</p>
                <p className="text-xs text-gray-400 mt-1">Ative a Sora em uma conversa pelo toggle na caixa de entrada</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {conversations.map(conv => (
                  <a
                    key={conv.id}
                    href={`/${slug}/inbox`}
                    className="flex items-center gap-4 px-6 py-3.5 hover:bg-gray-50 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center text-sm font-semibold text-violet-700 shrink-0">
                      {conv.contactName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{conv.contactName}</p>
                      <p className="text-xs text-gray-500">
                        {channelLabel[conv.channelType] ?? conv.channelType} · {conv.aiSalesMessageCount} msgs
                      </p>
                    </div>
                    {conv.qualificationScore !== null && (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold shrink-0 ${
                        conv.qualificationScore >= 7 ? 'bg-emerald-50 text-emerald-700' :
                        conv.qualificationScore >= 4 ? 'bg-amber-50 text-amber-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {conv.qualificationScore}/10
                      </span>
                    )}
                    <p className="text-xs text-gray-400 truncate max-w-[100px] shrink-0">{conv.pipelineStage ?? '—'}</p>
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Canais */}
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 flex items-center justify-between border-b border-gray-100">
              <h3 className="font-semibold text-gray-900 text-sm">Canais</h3>
              <button
                onClick={() => setTab('canais')}
                className="text-xs text-violet-600 hover:text-violet-800 font-medium"
              >
                Gerenciar →
              </button>
            </div>
            {loadingChannels ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={20} className="animate-spin text-gray-300" />
              </div>
            ) : channels.length === 0 ? (
              <div className="px-6 py-6 text-sm text-gray-400 text-center">Nenhum canal conectado</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {channels.map(ch => {
                  const label = ch.type === 'WHATSAPP'
                    ? (ch.phoneNumber ? `+${ch.phoneNumber}` : ch.name)
                    : (ch.pageName ?? ch.name)
                  return (
                    <div key={ch.id} className="flex items-center justify-between px-6 py-3">
                      <div className="flex items-center gap-2.5">
                        <ChannelIcon type={ch.type} size={20} />
                        <span className="text-sm text-gray-700">{label}</span>
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        ch.aiAutoActivate
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-gray-100 text-gray-400'
                      }`}>
                        {ch.aiAutoActivate ? 'Sora ativa' : 'Inativa'}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Tab: Configurar ─── */}
      {activeTab === 'configurar' && (
        <div className="space-y-4">
          {loadingConfig ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={24} className="animate-spin text-gray-300" />
            </div>
          ) : (
            <>
              {/* Bloco 1: Comportamento */}
              <SectionCard title="Como a Sora deve atuar?" icon="🧠">
                <div className="space-y-3">
                  {[
                    { key: 'qualify', label: 'Qualificar leads antes de transferir', desc: 'Sora coleta informações BANT e avalia o potencial do lead' },
                    { key: 'schedule', label: 'Agendar reuniões', desc: 'Sora pode sugerir e facilitar agendamentos' },
                  ].map(({ key, label, desc }) => (
                    <label key={key} className="flex items-start gap-3 cursor-pointer">
                      <div
                        className={`w-5 h-5 rounded flex items-center justify-center border shrink-0 mt-0.5 transition-colors ${
                          config.objectives.includes(key) ? 'bg-violet-600 border-violet-600' : 'border-gray-300'
                        }`}
                        onClick={() => {
                          const has = config.objectives.includes(key)
                          setConfig(c => ({ ...c, objectives: has ? c.objectives.filter(o => o !== key) : [...c.objectives, key] }))
                        }}
                      >
                        {config.objectives.includes(key) && <Check size={12} className="text-white" strokeWidth={3} />}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{label}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                      </div>
                    </label>
                  ))}

                  {config.objectives.includes('schedule') && (
                    <div className="ml-8 mt-2">
                      <label className="block text-xs font-medium text-gray-700 mb-1.5">Link do Calendário</label>
                      <input
                        type="url"
                        placeholder="https://cal.com/seu-nome"
                        value={config.calendarUrl ?? ''}
                        onChange={e => setConfig(c => ({ ...c, calendarUrl: e.target.value || null }))}
                        className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    </div>
                  )}
                </div>
              </SectionCard>

              {/* Bloco 2: Handoff */}
              <SectionCard title="Quando transferir para um humano?" icon="🎯">
                <div className="space-y-5">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-gray-700">Score mínimo para transferência</label>
                      <span className="text-sm font-bold text-violet-700 bg-violet-50 px-2.5 py-0.5 rounded-full">
                        {config.handoffMinScore}/10
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1} max={10} step={1}
                      value={config.handoffMinScore}
                      onChange={e => setConfig(c => ({ ...c, handoffMinScore: parseInt(e.target.value) }))}
                      className="w-full accent-violet-600"
                    />
                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                      <span>1 — Transfere logo</span>
                      <span>10 — Só os mais quentes</span>
                    </div>
                  </div>

                  <div className="p-3 bg-violet-50 rounded-xl text-xs text-violet-700">
                    Leads com score abaixo de {config.handoffMinScore} continuam sendo nutridos pela Sora.{' '}
                    <button type="button" onClick={() => setTab('equipe')} className="font-semibold underline">
                      Configure a equipe →
                    </button>
                  </div>
                </div>
              </SectionCard>

              {/* Bloco 3: Billing */}
              <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg">💰</span>
                    <h3 className="font-semibold text-gray-900 text-sm">Uso do plano</h3>
                  </div>
                </div>
                <div className="px-6 pb-6 pt-4 space-y-4">
                  {billing && (
                    <>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 font-medium">{billing.used} / {billing.limit} atendimentos</span>
                        {daysUntilReset !== null && <span className="text-xs text-gray-400">Reseta em {daysUntilReset} dias</span>}
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${usedPct}%` }} />
                      </div>
                    </>
                  )}

                  <div className="space-y-2 pt-1">
                    <p className="text-sm font-medium text-gray-700">Quando os atendimentos acabarem:</p>
                    {[
                      { value: true, label: 'Continuar usando créditos extras (tokens)', desc: `Você tem ${billing?.extras ?? 0} tokens disponíveis` },
                      { value: false, label: 'Parar automaticamente', desc: 'Sora não responde ao atingir o limite' },
                    ].map(({ value, label, desc }) => (
                      <label key={String(value)} className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border hover:bg-gray-50 transition-colors" style={{ borderColor: soraOverflowEnabled === value ? '#7c3aed' : '#e5e7eb' }}>
                        <div className={`w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center ${soraOverflowEnabled === value ? 'border-violet-600' : 'border-gray-300'}`}>
                          {soraOverflowEnabled === value && <div className="w-2 h-2 rounded-full bg-violet-600" />}
                        </div>
                        <div onClick={() => setSoraOverflowEnabled(value)}>
                          <p className="text-sm font-medium text-gray-900">{label}</p>
                          <p className="text-xs text-gray-500">{desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => router.push(`/${slug}/settings?tab=tokens`)}
                    className="flex items-center gap-2 text-xs font-semibold text-amber-600 hover:text-amber-700"
                  >
                    <RefreshCw size={12} /> Recarregar atendimentos
                  </button>
                </div>
              </div>

              {/* Bloco 4: Identidade */}
              <SectionCard title="Personalidade da Sora" icon="🧑‍💼">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Nome do agente</label>
                    <input
                      type="text"
                      placeholder="Sora"
                      value={config.agentName ?? ''}
                      onChange={e => setConfig(c => ({ ...c, agentName: e.target.value || null }))}
                      className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Nome da empresa</label>
                    <input
                      type="text"
                      placeholder="Sua empresa"
                      value={config.businessName ?? ''}
                      onChange={e => setConfig(c => ({ ...c, businessName: e.target.value || null }))}
                      className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">Tom de voz</label>
                  <div className="flex gap-2">
                    {Object.entries(TONE_MAP).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setConfig(c => ({ ...c, tone: key }))}
                        className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                          config.tone === key
                            ? 'bg-violet-600 text-white border-violet-600'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-violet-300'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <TonePreview
                  agentName={config.agentName ?? 'Sora'}
                  businessName={config.businessName ?? 'empresa'}
                  tone={config.tone}
                />
              </SectionCard>

              {/* Bloco 5: Negócio */}
              <SectionCard title="Sobre seu negócio" icon="🏢">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">O que você vende</label>
                  <textarea
                    rows={3}
                    placeholder="Ex: Consultoria jurídica empresarial. Planos mensais de R$500 a R$2.000/mês. Especialistas em contratos, trabalhista e tributário."
                    value={config.businessDescription ?? ''}
                    onChange={e => setConfig(c => ({ ...c, businessDescription: e.target.value || null }))}
                    className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                  />
                  <p className="text-xs text-gray-400 mt-1">Inclua produtos, serviços e preços. Sora usará isso para responder perguntas dos leads.</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Público-alvo</label>
                  <textarea
                    rows={2}
                    placeholder="Ex: Pequenas e médias empresas com 5-50 funcionários, donos e sócios-administradores"
                    value={config.targetAudience ?? ''}
                    onChange={e => setConfig(c => ({ ...c, targetAudience: e.target.value || null }))}
                    className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Diferenciais</label>
                  <textarea
                    rows={2}
                    placeholder="Ex: Atendimento em até 2h, preços fixos sem surpresa, equipe com 15+ anos de experiência"
                    value={config.differentials ?? ''}
                    onChange={e => setConfig(c => ({ ...c, differentials: e.target.value || null }))}
                    className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                  />
                </div>
              </SectionCard>

              {/* Bloco 6: Knowledge Base */}
              <SectionCard title="Base de Conhecimento" icon="📚">
                <p className="text-xs text-gray-500">
                  Faça upload de documentos para a Sora usar ao responder perguntas específicas (tabela de preços, FAQs, catálogo, etc).
                </p>

                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.txt,.docx"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) { uploadFile(file); e.target.value = '' }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-600 hover:border-violet-400 hover:text-violet-600 transition-colors w-full justify-center"
                  >
                    {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                    {uploading ? 'Processando...' : 'Adicionar arquivo (PDF, TXT, DOCX)'}
                  </button>
                </div>

                {docs.length > 0 && (
                  <div className="space-y-2">
                    {docs.map(doc => (
                      <div key={doc.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                        <FileText size={15} className="text-violet-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{doc.name}</p>
                          <p className="text-xs text-gray-400">{doc.chunkCount} chunks</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteDoc(doc.id)}
                          className="text-gray-400 hover:text-red-500 transition-colors shrink-0"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              {/* Bloco 7: Avançado (colapsado) */}
              <SectionCard title="Avançado" icon="⚙️" collapsible>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Modelo AI</label>
                    <select
                      value={config.model}
                      onChange={e => setConfig(c => ({ ...c, model: e.target.value }))}
                      className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500"
                    >
                      <option value="gpt-4.1-mini">gpt-4.1-mini (padrão)</option>
                      <option value="gpt-4o-mini">gpt-4o-mini</option>
                      <option value="gpt-4o">gpt-4o (mais capaz)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Máx. mensagens por conversa</label>
                    <input
                      type="number"
                      min={10} max={200} step={5}
                      value={config.maxMessagesPerConversation}
                      onChange={e => setConfig(c => ({ ...c, maxMessagesPerConversation: parseInt(e.target.value) }))}
                      className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Debounce (segundos)</label>
                    <input
                      type="number"
                      min={5} max={60} step={5}
                      value={config.debounceSeconds}
                      onChange={e => setConfig(c => ({ ...c, debounceSeconds: parseInt(e.target.value) }))}
                      className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">Espera antes de responder (agrupa mensagens rápidas)</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Bloqueio após humano (min)</label>
                    <input
                      type="number"
                      min={5} max={120} step={5}
                      value={Math.round(config.blockTtlSeconds / 60)}
                      onChange={e => setConfig(c => ({ ...c, blockTtlSeconds: parseInt(e.target.value) * 60 }))}
                      className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">Minutos sem Sora após intervenção manual</p>
                  </div>
                </div>

                {/* Objeções comuns */}
                <div className="pt-2 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-medium text-gray-700">Objeções comuns (opcional)</label>
                    <button
                      type="button"
                      onClick={() => setConfig(c => ({ ...c, commonObjections: [...c.commonObjections, { objection: '', response: '' }] }))}
                      className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800"
                    >
                      <Plus size={12} /> Adicionar
                    </button>
                  </div>
                  {config.commonObjections.length === 0 && (
                    <p className="text-xs text-gray-400">Nenhuma objeção cadastrada. Adicione se quiser que a Sora tenha respostas específicas.</p>
                  )}
                  {config.commonObjections.map((obj, i) => (
                    <div key={i} className="grid grid-cols-2 gap-2 mb-2">
                      <input
                        type="text"
                        placeholder="Objeção"
                        value={obj.objection}
                        onChange={e => setConfig(c => ({
                          ...c, commonObjections: c.commonObjections.map((o, j) => j === i ? { ...o, objection: e.target.value } : o)
                        }))}
                        className="text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-violet-500"
                      />
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          placeholder="Resposta sugerida"
                          value={obj.response}
                          onChange={e => setConfig(c => ({
                            ...c, commonObjections: c.commonObjections.map((o, j) => j === i ? { ...o, response: e.target.value } : o)
                          }))}
                          className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-violet-500"
                        />
                        <button
                          type="button"
                          onClick={() => setConfig(c => ({ ...c, commonObjections: c.commonObjections.filter((_, j) => j !== i) }))}
                          className="text-gray-400 hover:text-red-500 px-1.5"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Custom prompt */}
                <div className="pt-2 border-t border-gray-100">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <div
                      className={`w-10 h-6 rounded-full transition-colors relative ${config.useCustomPrompt ? 'bg-violet-600' : 'bg-gray-200'}`}
                      onClick={() => setConfig(c => ({ ...c, useCustomPrompt: !c.useCustomPrompt }))}
                    >
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${config.useCustomPrompt ? 'left-5' : 'left-1'}`} />
                    </div>
                    <span className="text-sm font-medium text-gray-700">Usar prompt personalizado</span>
                  </label>
                  {config.useCustomPrompt && (
                    <textarea
                      rows={8}
                      placeholder="Digite seu prompt customizado aqui..."
                      value={config.systemPrompt ?? ''}
                      onChange={e => setConfig(c => ({ ...c, systemPrompt: e.target.value || null }))}
                      className="mt-3 w-full text-sm font-mono px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                    />
                  )}
                </div>
              </SectionCard>

              {/* Save button */}
              <div className="flex items-center justify-between pt-2">
                {savedAt && (
                  <p className="text-xs text-gray-400">Salvo às {savedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                )}
                <button
                  type="button"
                  onClick={saveConfig}
                  disabled={saving}
                  className="ml-auto flex items-center gap-2 px-6 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {saving ? 'Salvando...' : 'Salvar configuração'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── Tab: Equipe & Handoff ─── */}
      {activeTab === 'equipe' && (
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Equipe & Handoff</h2>
              <p className="text-sm text-gray-500 mt-1">
                Configure para quem a Sora transfere os leads qualificados.
                A Sora escolhe o atendente com especialização mais próxima da necessidade do lead.
              </p>
            </div>

            {loadingTeam ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-gray-300" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Nome</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Cargo</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Especializações</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Link Calendário</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {teamUsers.map(u => (
                      <tr key={u.id}>
                        <td className="px-5 py-4">
                          <p className="font-medium text-gray-900">{u.name}</p>
                          <p className="text-xs text-gray-400">{u.email}</p>
                        </td>
                        <td className="px-5 py-4">
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{u.role}</span>
                        </td>
                        <td className="px-5 py-4">
                          {editingUserId === u.id ? (
                            <div className="space-y-1.5">
                              <div className="flex flex-wrap gap-1">
                                {u.specializations.map(s => (
                                  <span key={s} className="inline-flex items-center gap-1 text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">
                                    {s}
                                    <button
                                      onClick={() => updateUserSpec(u.id, u.specializations.filter(x => x !== s))}
                                      className="text-violet-400 hover:text-violet-700"
                                    >×</button>
                                  </span>
                                ))}
                              </div>
                              <input
                                type="text"
                                placeholder="Adicionar (Enter)"
                                value={specInput}
                                onChange={e => setSpecInput(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' && specInput.trim()) {
                                    e.preventDefault()
                                    const tag = specInput.trim().toLowerCase()
                                    if (!u.specializations.includes(tag)) {
                                      updateUserSpec(u.id, [...u.specializations, tag])
                                    }
                                    setSpecInput('')
                                  }
                                  if (e.key === 'Escape') setEditingUserId(null)
                                }}
                                onBlur={() => setEditingUserId(null)}
                                autoFocus
                                className="text-xs px-2 py-1 border border-violet-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-500 w-36"
                              />
                            </div>
                          ) : (
                            <button
                              onClick={() => { setEditingUserId(u.id); setSpecInput('') }}
                              className="text-left"
                            >
                              {u.specializations.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {u.specializations.map(s => (
                                    <span key={s} className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">{s}</span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400 hover:text-violet-600">+ Adicionar especialização</span>
                              )}
                            </button>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <input
                            type="url"
                            placeholder="https://cal.com/..."
                            defaultValue={u.calendarUrl ?? ''}
                            onBlur={e => {
                              const val = e.target.value.trim() || null
                              if (val !== (u.calendarUrl ?? null)) updateUserCalendar(u.id, val)
                            }}
                            className="text-xs px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-500 w-44"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
              <p className="text-xs text-gray-500">
                ℹ️ A Sora transfere para o atendente cuja especialização mais se aproxima da necessidade do lead.
                Se nenhum match, transfere para um admin.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ─── Tab: Ativar nos canais ─── */}
      {activeTab === 'canais' && (
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Ativar nos canais</h2>
              <p className="text-sm text-gray-500 mt-1">
                Quando ativada em um canal, a Sora responde automaticamente qualquer novo lead que entrar por ele.
                Conversas existentes não são afetadas.
              </p>
            </div>

            {loadingChannels ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-gray-300" />
              </div>
            ) : channels.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-gray-400">
                Nenhum canal conectado. Conecte um canal em <strong>Configurações → Canais</strong>.
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {channels.map(ch => {
                  const isToggling = togglingChannelId === ch.id
                  const channelName = ch.type === 'WHATSAPP'
                    ? (ch.phoneNumber ? `+${ch.phoneNumber}` : ch.name)
                    : (ch.pageName ?? ch.name)

                  return (
                    <div key={ch.id} className="flex items-center justify-between px-6 py-4">
                      <div className="flex items-center gap-3">
                        <ChannelIcon type={ch.type} size={32} />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{channelName}</p>
                          {!ch.isActive && (
                            <p className="text-xs text-amber-500">Canal desconectado</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-medium ${ch.aiAutoActivate ? 'text-emerald-600' : 'text-gray-400'}`}>
                          {ch.aiAutoActivate ? 'Sora ativa' : 'Inativa'}
                        </span>
                        <button
                          onClick={() => toggleChannelAI(ch)}
                          disabled={isToggling || !ch.isActive}
                          title={!ch.isActive ? 'Canal desconectado' : undefined}
                          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:opacity-40 ${
                            ch.aiAutoActivate ? 'bg-emerald-500' : 'bg-gray-200'
                          }`}
                        >
                          <span
                            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                              ch.aiAutoActivate ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="px-6 py-4 border-t border-gray-100 bg-amber-50">
              <p className="text-xs text-amber-700">
                ⚠️ Novos leads que entrarem por um canal ativo serão atendidos automaticamente pela Sora.
                Canais desconectados não podem ser ativados.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
