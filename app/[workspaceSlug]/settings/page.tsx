'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { getPusherClient } from '@/lib/pusher'
import {
  Loader2,
  ExternalLink,
  MessageCircle,
  Instagram,
  Facebook,
  CreditCard,
  Users,
  UserPlus,
  X,
  Copy,
  Check,
  CheckCircle2,
  Bot,
  Play,
  Send,
  Trash2,
  RefreshCw,
  ChevronDown,
  User,
  Target,
  Clock,
  GitBranch,
} from 'lucide-react'

const PLANS = [
  {
    name: 'Starter',
    price: 'R$ 197/mês',
    firstMonthPrice: 'R$ 37 no 1º mês',
    checkoutUrl: process.env.NEXT_PUBLIC_KIRVANO_STARTER_URL ?? 'https://pay.kirvano.com/4f4bf484-0113-4257-8199-52f7fa0f5925',
    features: ['1 Admin + 3 Agentes', '1.000 conversas/mês', '3 canais'],
  },
  {
    name: 'Pro',
    price: 'R$ 397/mês',
    firstMonthPrice: 'R$ 37 no 1º mês',
    checkoutUrl: process.env.NEXT_PUBLIC_KIRVANO_PRO_URL ?? 'https://pay.kirvano.com/9ff16802-c829-46e8-a7b1-efc922ff5166',
    features: ['1 Admin + 9 Agentes', '5.000 conversas/mês', 'Canais ilimitados'],
    recommended: true,
  },
  {
    name: 'Enterprise',
    price: 'R$ 697/mês',
    firstMonthPrice: 'R$ 37 no 1º mês',
    checkoutUrl: process.env.NEXT_PUBLIC_KIRVANO_ENTERPRISE_URL ?? 'https://pay.kirvano.com/28bdff0e-b8c0-4c72-ba34-ee8b9828fe0f',
    features: ['Usuários ilimitados', 'Conversas ilimitadas', 'Suporte prioritário'],
  },
]

interface AgentConfig {
  id?: string
  name: string
  objective: string
  tone: string
  knowledgeAreas: string
  isActive: boolean
  businessHoursStart: number | null
  businessHoursEnd: number | null
  maxAiMessages: number
  offHoursMessage: string
  gender: string
  personality: string
  autoAssign: boolean
  handoffInstructions: string
}

interface WorkspaceUser {
  id: string
  name: string
  email: string
  role: string
  avatarUrl: string | null
  agentRole: string | null
  isActive: boolean
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

const DEFAULT_AGENT_CONFIG: AgentConfig = {
  name: 'Claudia',
  objective: '',
  tone: 'humanizado',
  knowledgeAreas: '',
  isActive: false,
  businessHoursStart: null,
  businessHoursEnd: null,
  maxAiMessages: 20,
  offHoursMessage: 'Olá! No momento estamos fora do horário de atendimento. Retornaremos em breve.',
  gender: 'feminino',
  personality: '',
  autoAssign: false,
  handoffInstructions: '',
}

export default function SettingsPage() {
  const { data: session } = useSession()
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<'team' | 'billing' | 'channels' | 'ai'>(
    (searchParams.get('tab') as 'team' | 'billing' | 'channels' | 'ai') ?? 'team'
  )
  const [users, setUsers] = useState<Array<{ id: string; name: string; email: string; role: string }>>([])
  const [showInvite, setShowInvite] = useState(false)
  const [inviteForm, setInviteForm] = useState({ name: '', email: '', role: 'AGENT' as 'ADMIN' | 'AGENT' })
  const [inviteResult, setInviteResult] = useState<{ tempPassword: string; email: string } | null>(null)
  const [inviting, setInviting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [channels, setChannels] = useState<Array<{
    id: string
    type: string
    provider?: string
    name: string
    phoneNumberId?: string | null
    phoneNumber?: string | null
    instanceName?: string | null
    isActive?: boolean
  }>>([])
  const [connectingStatus, setConnectingStatus] = useState<Record<string, 'idle' | 'loading' | 'done'>>({})
  const [uazapiQR, setUazapiQR] = useState<{ base64: string; instanceName: string; channelId: string } | null>(null)
  const uazapiPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // AI Agent state
  const [agentConfig, setAgentConfig] = useState<AgentConfig>(DEFAULT_AGENT_CONFIG)
  const [agentSaving, setAgentSaving] = useState(false)
  const [agentSaved, setAgentSaved] = useState(false)
  const [agentUsers, setAgentUsers] = useState<WorkspaceUser[]>([])
  const [agentRoleSaving, setAgentRoleSaving] = useState<Record<string, boolean>>({})
  const [agentRoleValues, setAgentRoleValues] = useState<Record<string, string>>({})
  const [agentRoleSaved, setAgentRoleSaved] = useState<Record<string, boolean>>({})
  const [openAccordion, setOpenAccordion] = useState<string | null>('identity')

  // Simulation state
  const [simulationStarted, setSimulationStarted] = useState(false)
  const [simMessages, setSimMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const [simInput, setSimInput] = useState('')
  const [simLoading, setSimLoading] = useState(false)
  const simMessagesEndRef = useRef<HTMLDivElement | null>(null)

  const refreshChannels = useCallback(() => {
    fetch('/api/channels').then((r) => r.json()).then((d) => setChannels(d.channels ?? []))
  }, [])

  const stopUazapiPoll = useCallback(() => {
    if (uazapiPollRef.current) {
      clearInterval(uazapiPollRef.current)
      uazapiPollRef.current = null
    }
  }, [])

  const handleUazapiConnect = useCallback(async () => {
    setConnectingStatus((s) => ({ ...s, UAZAPI_WA: 'loading' }))
    try {
      const res = await fetch('/api/uazapi/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelName: 'WhatsApp' }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error ?? 'Erro ao criar instância.')
        setConnectingStatus((s) => ({ ...s, UAZAPI_WA: 'idle' }))
        return
      }
      setUazapiQR({ base64: data.qr.base64, instanceName: data.instanceName, channelId: data.channelId })
      setConnectingStatus((s) => ({ ...s, UAZAPI_WA: 'idle' }))

      uazapiPollRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/uazapi/connect?instanceName=${encodeURIComponent(data.instanceName)}`)
          const pollData = await pollRes.json()
          if (pollData.state === 'connected') {
            stopUazapiPoll()
            setUazapiQR(null)
            setConnectingStatus((s) => ({ ...s, UAZAPI_WA: 'done' }))
            refreshChannels()
            setTimeout(() => setConnectingStatus((s) => ({ ...s, UAZAPI_WA: 'idle' })), 3000)
          } else if (pollData.qr?.base64) {
            setUazapiQR((prev) => prev ? { ...prev, base64: pollData.qr.base64 } : prev)
          }
        } catch { /* ignore poll errors */ }
      }, 3000)
    } catch (e) {
      console.error(e)
      setConnectingStatus((s) => ({ ...s, UAZAPI_WA: 'idle' }))
    }
  }, [stopUazapiPoll, refreshChannels])

  const handleUazapiReconnect = useCallback(async (channelId: string) => {
    setConnectingStatus((s) => ({ ...s, [`RECONNECT_${channelId}`]: 'loading' }))
    try {
      const res = await fetch('/api/uazapi/reconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error ?? 'Erro ao reconectar.')
        setConnectingStatus((s) => ({ ...s, [`RECONNECT_${channelId}`]: 'idle' }))
        return
      }
      setUazapiQR({ base64: data.qr.base64, instanceName: data.instanceName, channelId: data.channelId })
      setConnectingStatus((s) => ({ ...s, [`RECONNECT_${channelId}`]: 'idle' }))

      uazapiPollRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/uazapi/connect?instanceName=${encodeURIComponent(data.instanceName)}`)
          const pollData = await pollRes.json()
          if (pollData.state === 'connected') {
            stopUazapiPoll()
            setUazapiQR(null)
            refreshChannels()
          } else if (pollData.qr?.base64) {
            setUazapiQR((prev) => prev ? { ...prev, base64: pollData.qr.base64 } : prev)
          }
        } catch { /* ignore poll errors */ }
      }, 3000)
    } catch (e) {
      console.error(e)
      setConnectingStatus((s) => ({ ...s, [`RECONNECT_${channelId}`]: 'idle' }))
    }
  }, [stopUazapiPoll, refreshChannels])

  const handleUazapiDelete = useCallback(async (channelId: string) => {
    if (!window.confirm('Tem certeza que deseja remover este canal WhatsApp? Esta ação não pode ser desfeita.')) return
    setConnectingStatus((s) => ({ ...s, [`DELETE_${channelId}`]: 'loading' }))
    try {
      const res = await fetch('/api/uazapi/connect', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error ?? 'Erro ao remover canal.')
        return
      }
      refreshChannels()
    } catch (e) {
      console.error(e)
    } finally {
      setConnectingStatus((s) => ({ ...s, [`DELETE_${channelId}`]: 'idle' }))
    }
  }, [refreshChannels])

  const handleFixWebhook = useCallback(async (channelId: string) => {
    setConnectingStatus((s) => ({ ...s, [`FIX_${channelId}`]: 'loading' }))
    try {
      const res = await fetch('/api/uazapi/fix-webhook', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error ?? 'Erro ao corrigir webhook.')
        return
      }
      alert(`Webhook registrado com sucesso:\n${data.webhookUrl}`)
    } catch (e) {
      console.error(e)
    } finally {
      setConnectingStatus((s) => ({ ...s, [`FIX_${channelId}`]: 'idle' }))
    }
  }, [])

  useEffect(() => () => stopUazapiPoll(), [stopUazapiPoll])

  useEffect(() => {
    if (session?.user.role !== 'ADMIN') return
    fetch('/api/users')
      .then((r) => r.ok ? r.json() : { users: [] })
      .then((data) => setUsers(data.users ?? []))
    fetch('/api/channels')
      .then((r) => r.ok ? r.json() : { channels: [] })
      .then((data) => setChannels(data.channels ?? []))
    // Load AI agent config
    fetch('/api/ai-agent')
      .then((r) => r.json())
      .then((data) => {
        if (data.config) {
          setAgentConfig({
            ...DEFAULT_AGENT_CONFIG,
            ...data.config,
          })
        }
      })
    // Load users with agentRole for the Agents section
    fetch('/api/users')
      .then((r) => r.json())
      .then((data) => {
        const users: WorkspaceUser[] = data.users ?? []
        setAgentUsers(users)
        const initialRoles: Record<string, string> = {}
        users.forEach((u) => { initialRoles[u.id] = u.agentRole ?? '' })
        setAgentRoleValues(initialRoles)
      })
  }, [session])

  // Scroll simulation to bottom
  useEffect(() => {
    simMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [simMessages])

  if (session?.user.role !== 'ADMIN') {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Acesso restrito a administradores.
      </div>
    )
  }

  function handleCheckout(checkoutUrl: string) {
    const workspaceId = session?.user.workspaceId
    const url = workspaceId ? `${checkoutUrl}?utm_content=${workspaceId}` : checkoutUrl
    window.location.href = url
  }

  async function handleInvite() {
    if (!inviteForm.name || !inviteForm.email) return
    setInviting(true)
    const res = await fetch('/api/users/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceSlug: session?.user.workspaceSlug,
        members: [{ name: inviteForm.name, email: inviteForm.email, role: inviteForm.role }],
      }),
    })
    const data = await res.json()
    if (data.results?.[0]) {
      setInviteResult({ email: inviteForm.email, tempPassword: data.results[0].tempPassword })
      setInviteForm({ name: '', email: '', role: 'AGENT' })
      fetch('/api/users').then((r) => r.json()).then((d) => setUsers(d.users ?? []))
    }
    setInviting(false)
  }

  function copyPassword(pwd: string) {
    navigator.clipboard.writeText(pwd)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handlePortal() {
    window.open('https://kirvano.com', '_blank')
  }

  async function handleAgentSave() {
    setAgentSaving(true)
    try {
      const res = await fetch('/api/ai-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agentConfig),
      })
      if (res.ok) {
        setAgentSaved(true)
        setTimeout(() => setAgentSaved(false), 3000)
      }
    } finally {
      setAgentSaving(false)
    }
  }

  async function handleAgentRoleSave(userId: string) {
    const agentRole = agentRoleValues[userId] ?? ''
    setAgentRoleSaving((s) => ({ ...s, [userId]: true }))
    try {
      await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentRole }),
      })
      setAgentRoleSaved((s) => ({ ...s, [userId]: true }))
      setTimeout(() => setAgentRoleSaved((s) => ({ ...s, [userId]: false })), 2000)
    } finally {
      setAgentRoleSaving((s) => ({ ...s, [userId]: false }))
    }
  }

  async function sendSimMessage() {
    if (!simInput.trim() || simLoading) return
    const msg = simInput.trim()
    setSimInput('')
    const newMsg = { role: 'user' as const, content: msg }
    setSimMessages((prev) => [...prev, newMsg])
    setSimLoading(true)
    try {
      const res = await fetch('/api/ai/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, history: simMessages }),
      })
      const data = await res.json()
      setSimMessages((prev) => [...prev, { role: 'assistant' as const, content: data.response ?? 'Erro ao processar resposta.' }])
    } catch {
      setSimMessages((prev) => [...prev, { role: 'assistant' as const, content: 'Erro ao conectar com o agente.' }])
    } finally {
      setSimLoading(false)
    }
  }

  return (
    <div className="h-screen flex flex-col">
      <div className="h-16 px-6 border-b border-gray-200 bg-white flex items-center">
        <h1 className="font-semibold text-gray-900">Configurações</h1>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Tabs */}
        <div className="w-48 border-r border-gray-200 bg-white p-3 flex flex-col gap-1">
          {[
            { key: 'team', label: 'Equipe', icon: Users },
            { key: 'billing', label: 'Billing', icon: CreditCard },
            { key: 'channels', label: 'Canais', icon: MessageCircle },
            { key: 'ai', label: 'Agente de IA', icon: Bot },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as typeof activeTab)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                activeTab === key
                  ? 'bg-gray-100 text-[var(--primary)] font-medium'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Team Tab */}
          {activeTab === 'team' && (
            <div>
              <div className="mb-8 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Equipe</h2>
                  <p className="text-sm text-gray-500 mt-1">Gerencie os membros e permissões do seu workspace</p>
                </div>
                <button
                  onClick={() => { setShowInvite(!showInvite); setInviteResult(null) }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-[var(--primary)] hover:opacity-90 text-white text-sm font-medium rounded-xl transition-colors flex-shrink-0"
                >
                  <UserPlus size={15} />
                  Convidar membro
                </button>
              </div>

              {/* Invite form */}
              {showInvite && !inviteResult && (
                <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-5 mb-4">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm font-semibold text-gray-900">Novo membro</p>
                    <button onClick={() => setShowInvite(false)} className="text-gray-400 hover:text-gray-600">
                      <X size={16} />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <input
                      type="text"
                      placeholder="Nome"
                      value={inviteForm.name}
                      onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                      className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300 bg-white"
                    />
                    <input
                      type="email"
                      placeholder="Email"
                      value={inviteForm.email}
                      onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                      className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300 bg-white"
                    />
                    <select
                      value={inviteForm.role}
                      onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value as 'ADMIN' | 'AGENT' })}
                      className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300 bg-white"
                    >
                      <option value="AGENT">Agente</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </div>
                  <div className="flex justify-end mt-4">
                    <button
                      onClick={handleInvite}
                      disabled={inviting || !inviteForm.name || !inviteForm.email}
                      className="flex items-center gap-2 px-4 py-2.5 bg-[var(--primary)] hover:opacity-90 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
                    >
                      {inviting ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                      Convidar
                    </button>
                  </div>
                </div>
              )}

              {/* Invite result — show temp password */}
              {inviteResult && (
                <div className="bg-white border border-emerald-200 shadow-sm rounded-2xl p-5 mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-emerald-600" />
                      <p className="text-sm font-semibold text-gray-900">Membro convidado com sucesso!</p>
                    </div>
                    <button onClick={() => { setInviteResult(null); setShowInvite(false) }} className="text-gray-400 hover:text-gray-600">
                      <X size={16} />
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mb-3">
                    Compartilhe as credenciais abaixo com <strong className="text-gray-700">{inviteResult.email}</strong>:
                  </p>
                  <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5">
                    <code className="text-sm flex-1 text-gray-800">{inviteResult.tempPassword}</code>
                    <button
                      onClick={() => copyPassword(inviteResult.tempPassword)}
                      className="text-gray-400 hover:text-gray-700 transition-colors"
                      title="Copiar senha"
                    >
                      {copied ? <Check size={15} className="text-emerald-500" /> : <Copy size={15} />}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">Esta senha não será exibida novamente.</p>
                </div>
              )}

              <div className="bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Nome</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Email</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Cargo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-4 text-sm font-medium text-gray-900">{u.name}</td>
                        <td className="px-5 py-4 text-sm text-gray-500">{u.email}</td>
                        <td className="px-5 py-4">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            u.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {u.role === 'ADMIN' ? 'Admin' : 'Agente'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Billing Tab */}
          {activeTab === 'billing' && (
            <div>
              <div className="mb-8 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Planos</h2>
                  <p className="text-sm text-gray-500 mt-1">Escolha o plano ideal para o seu negócio</p>
                </div>
                <button
                  onClick={handlePortal}
                  className="text-sm text-[var(--primary)] hover:underline flex items-center gap-1 flex-shrink-0 mt-1"
                >
                  Gerenciar assinatura <ExternalLink size={12} />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-4">
                {PLANS.map((plan) => (
                  <div
                    key={plan.name}
                    className={`bg-white border rounded-2xl p-5 relative shadow-sm ${
                      plan.recommended ? 'border-[var(--primary)]' : 'border-gray-100'
                    }`}
                  >
                    {plan.recommended && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[var(--primary)] text-white text-xs px-3 py-1 rounded-full font-medium">
                        Recomendado
                      </span>
                    )}
                    <h3 className="font-bold text-gray-900 text-lg">{plan.name}</h3>
                    <p className="text-2xl font-bold text-gray-900 mt-3">{plan.price}</p>
                    <p className="text-xs text-emerald-600 font-medium mb-4">{plan.firstMonthPrice}</p>
                    <ul className="space-y-2 mb-5">
                      {plan.features.map((f) => (
                        <li key={f} className="text-sm text-gray-600 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full flex-shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={() => handleCheckout(plan.checkoutUrl)}
                      className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                        plan.recommended
                          ? 'bg-[var(--primary)] hover:opacity-90 text-white shadow-sm'
                          : 'border border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      Assinar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Channels Tab */}
          {activeTab === 'channels' && (
            <div>
              <div className="mb-8">
                <h2 className="text-xl font-semibold text-gray-900">Canais</h2>
                <p className="text-sm text-gray-500 mt-1">Conecte e gerencie os canais de comunicação do seu workspace</p>
              </div>

              {/* QR Code modal */}
              {uazapiQR && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                  <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm text-center">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-gray-900">Escanear QR Code</h3>
                      <button
                        onClick={() => { stopUazapiPoll(); setUazapiQR(null) }}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <X size={18} />
                      </button>
                    </div>
                    <p className="text-sm text-gray-500 mb-4">
                      Abra o WhatsApp no seu celular, vá em <strong>Dispositivos Conectados</strong> e escaneie o código abaixo.
                    </p>
                    {uazapiQR.base64 ? (
                      <img src={uazapiQR.base64} alt="QR Code WhatsApp" className="mx-auto w-52 h-52 rounded-lg" />
                    ) : (
                      <div className="w-52 h-52 mx-auto flex items-center justify-center bg-gray-100 rounded-lg">
                        <Loader2 size={24} className="animate-spin text-gray-400" />
                      </div>
                    )}
                    <div className="flex items-center gap-2 justify-center mt-4 text-xs text-gray-400">
                      <Loader2 size={12} className="animate-spin" />
                      Aguardando conexão...
                    </div>
                  </div>
                </div>
              )}

              {/* WhatsApp via UazAPI */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-700 mb-3">WhatsApp</h3>
                {channels.filter((c) => c.provider === 'UAZAPI').map((ch) => (
                  <div key={ch.id} className="bg-white border border-gray-100 shadow-sm rounded-2xl p-4 flex items-center gap-4 mb-2">
                    <div className="w-10 h-10 rounded-lg bg-[#25D366] flex items-center justify-center text-white flex-shrink-0">
                      <MessageCircle size={20} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900 text-sm">{ch.name}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${ch.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {ch.isActive ? <><CheckCircle2 size={11} /> Conectado</> : 'Desconectado'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">{ch.phoneNumber ?? ch.instanceName}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {!ch.isActive && (
                        <button
                          onClick={() => handleUazapiReconnect(ch.id)}
                          disabled={connectingStatus[`RECONNECT_${ch.id}`] === 'loading'}
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-[#25D366] hover:opacity-90 disabled:opacity-60 text-white rounded-lg transition-colors font-medium"
                        >
                          {connectingStatus[`RECONNECT_${ch.id}`] === 'loading'
                            ? <><Loader2 size={12} className="animate-spin" /> Conectando...</>
                            : <><MessageCircle size={12} /> Reconectar</>}
                        </button>
                      )}
                      <button
                        onClick={() => handleFixWebhook(ch.id)}
                        disabled={connectingStatus[`FIX_${ch.id}`] === 'loading'}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-50 hover:bg-blue-100 disabled:opacity-60 text-blue-600 rounded-lg transition-colors font-medium"
                        title="Corrigir Webhook"
                      >
                        {connectingStatus[`FIX_${ch.id}`] === 'loading'
                          ? <Loader2 size={12} className="animate-spin" />
                          : <><RefreshCw size={12} /> Webhook</>}
                      </button>
                      <button
                        onClick={() => handleUazapiDelete(ch.id)}
                        disabled={connectingStatus[`DELETE_${ch.id}`] === 'loading'}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-red-50 hover:bg-red-100 disabled:opacity-60 text-red-600 rounded-lg transition-colors font-medium"
                        title="Remover canal"
                      >
                        {connectingStatus[`DELETE_${ch.id}`] === 'loading'
                          ? <Loader2 size={12} className="animate-spin" />
                          : <Trash2 size={12} />}
                      </button>
                    </div>
                  </div>
                ))}
                {/* O backend limita 1 instância por workspace. Remova o canal acima para conectar um novo. */}
                <button
                  onClick={handleUazapiConnect}
                  disabled={connectingStatus['UAZAPI_WA'] === 'loading'}
                  className="flex items-center gap-2 text-sm px-4 py-2 bg-[#25D366] hover:opacity-90 disabled:opacity-60 text-white rounded-lg transition-colors font-medium"
                >
                  {connectingStatus['UAZAPI_WA'] === 'loading' ? (
                    <><Loader2 size={14} className="animate-spin" /> Criando instância...</>
                  ) : connectingStatus['UAZAPI_WA'] === 'done' ? (
                    <><CheckCircle2 size={14} /> Conectado!</>
                  ) : (
                    <><MessageCircle size={14} /> Conectar WhatsApp (QR)</>
                  )}
                </button>
              </div>

              {/* Instagram & Facebook — coming soon */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">Instagram &amp; Facebook</h3>
                <div className="space-y-3">
                  {[
                    { type: 'INSTAGRAM', label: 'Instagram Direct', icon: Instagram, color: '#E4405F', desc: 'Mensagens diretas do Instagram' },
                    { type: 'FACEBOOK', label: 'Facebook Messenger', icon: Facebook, color: '#1877F2', desc: 'Messenger da sua página' },
                  ].map(({ type, label, icon: Icon, color, desc }) => (
                    <div key={type} className="bg-white border border-gray-100 shadow-sm rounded-2xl p-4 flex items-center gap-4 opacity-60">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white flex-shrink-0" style={{ backgroundColor: color }}>
                        <Icon size={20} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900 text-sm">{label}</p>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
                            Em breve
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* AI Agent Tab */}
          {activeTab === 'ai' && (
            <div>
              {/* Page Header */}
              <div className="mb-8">
                <h2 className="text-xl font-semibold text-gray-900">Agente de atendimento com IA</h2>
                <p className="text-sm text-gray-500 mt-1">Configure seu assistente virtual inteligente para automatizar o atendimento</p>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
                {/* Left: Configuration */}
                <div className="space-y-4">

                  {/* Agent Card */}
                  <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
                    <div className="flex items-center gap-4">
                      {/* Avatar */}
                      <img src="/ai-avatar.svg" alt="Avatar" className="w-14 h-14 rounded-full object-cover flex-shrink-0" />
                      {/* Name + status */}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-lg leading-tight truncate">
                          {agentConfig.name || 'Agente'}
                        </p>
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium mt-1 px-2 py-0.5 rounded-full ${
                          agentConfig.isActive
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${agentConfig.isActive ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                          {agentConfig.isActive ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                      {/* Toggle */}
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <button
                          onClick={() => setAgentConfig((c) => ({ ...c, isActive: !c.isActive }))}
                          className={`w-11 h-6 rounded-full transition-colors relative ${agentConfig.isActive ? 'bg-violet-600' : 'bg-gray-300'}`}
                        >
                          <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${agentConfig.isActive ? 'left-6' : 'left-1'}`} />
                        </button>
                        <p className="text-xs text-gray-400">Ativar agente</p>
                      </div>
                    </div>
                  </div>

                  {/* Accordion Sections */}
                  <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden divide-y divide-gray-100">

                    {/* Section 1: Identidade */}
                    {(() => {
                      const isOpen = openAccordion === 'identity'
                      return (
                        <div>
                          <button
                            onClick={() => setOpenAccordion(isOpen ? null : 'identity')}
                            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
                          >
                            <div className="w-8 h-8 bg-violet-50 rounded-lg flex items-center justify-center flex-shrink-0">
                              <User size={15} className="text-violet-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900">Identidade do Agente</p>
                              <p className="text-xs text-gray-400 mt-0.5">Nome, gênero, personalidade e tom de voz</p>
                            </div>
                            <ChevronDown size={16} className={`text-gray-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
                          </button>
                          {isOpen && (
                            <div className="px-5 pb-5 pt-1 space-y-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Nome do agente</label>
                                  <input
                                    type="text"
                                    value={agentConfig.name}
                                    onChange={(e) => setAgentConfig((c) => ({ ...c, name: e.target.value }))}
                                    placeholder="Ex: Claudia, Sofia..."
                                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Gênero</label>
                                  <div className="flex gap-1.5">
                                    {[
                                      { value: 'feminino', label: 'Fem.' },
                                      { value: 'masculino', label: 'Masc.' },
                                      { value: 'neutro', label: 'Neutro' },
                                    ].map((opt) => (
                                      <button
                                        key={opt.value}
                                        onClick={() => setAgentConfig((c) => ({ ...c, gender: opt.value }))}
                                        className={`flex-1 py-2 text-xs rounded-lg border transition-colors ${
                                          agentConfig.gender === opt.value
                                            ? 'border-violet-600 bg-violet-50 text-violet-700 font-medium'
                                            : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                                        }`}
                                      >
                                        {opt.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1.5">Personalidade</label>
                                <textarea
                                  rows={3}
                                  value={agentConfig.personality}
                                  onChange={(e) => setAgentConfig((c) => ({ ...c, personality: e.target.value }))}
                                  placeholder="Descreva como o agente deve se comportar. Ex: Sou uma assistente simpática e prestativa da Clínica Saúde Total..."
                                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1.5">Tom de resposta</label>
                                <select
                                  value={agentConfig.tone}
                                  onChange={(e) => setAgentConfig((c) => ({ ...c, tone: e.target.value }))}
                                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
                                >
                                  <option value="humanizado">Humanizado e empático</option>
                                  <option value="formal">Formal e profissional</option>
                                  <option value="direto">Direto e objetivo</option>
                                </select>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })()}

                    {/* Section 2: Objetivo e Conhecimento */}
                    {(() => {
                      const isOpen = openAccordion === 'objective'
                      return (
                        <div>
                          <button
                            onClick={() => setOpenAccordion(isOpen ? null : 'objective')}
                            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
                          >
                            <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                              <Target size={15} className="text-blue-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900">Objetivo e Conhecimento</p>
                              <p className="text-xs text-gray-400 mt-0.5">O que o agente deve fazer e o que ele sabe sobre seu negócio</p>
                            </div>
                            <ChevronDown size={16} className={`text-gray-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
                          </button>
                          {isOpen && (
                            <div className="px-5 pb-5 pt-1 space-y-4">
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1.5">Objetivo</label>
                                <textarea
                                  rows={3}
                                  value={agentConfig.objective}
                                  onChange={(e) => setAgentConfig((c) => ({ ...c, objective: e.target.value }))}
                                  placeholder="Qual é o objetivo do agente? Ex: Qualificar leads para consultas odontológicas, coletar nome, telefone e interesse..."
                                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1.5">Contexto do negócio</label>
                                <textarea
                                  rows={4}
                                  value={agentConfig.knowledgeAreas}
                                  onChange={(e) => setAgentConfig((c) => ({ ...c, knowledgeAreas: e.target.value }))}
                                  placeholder="Informações sobre sua empresa: serviços, produtos, horários, preços, endereço, diferenciais..."
                                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })()}

                    {/* Section 3: Horários e Automação */}
                    {(() => {
                      const isOpen = openAccordion === 'hours'
                      return (
                        <div>
                          <button
                            onClick={() => setOpenAccordion(isOpen ? null : 'hours')}
                            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
                          >
                            <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center flex-shrink-0">
                              <Clock size={15} className="text-amber-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900">Horários e Automação</p>
                              <p className="text-xs text-gray-400 mt-0.5">Quando o agente atua e limites de mensagens</p>
                            </div>
                            <ChevronDown size={16} className={`text-gray-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
                          </button>
                          {isOpen && (
                            <div className="px-5 pb-5 pt-1 space-y-4">
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1.5">Horário de atendimento <span className="text-gray-400 font-normal">(opcional)</span></label>
                                <div className="flex items-center gap-3">
                                  <input
                                    type="number"
                                    min={0}
                                    max={23}
                                    value={agentConfig.businessHoursStart ?? ''}
                                    onChange={(e) => setAgentConfig((c) => ({ ...c, businessHoursStart: e.target.value ? parseInt(e.target.value) : null }))}
                                    placeholder="Início (0-23)"
                                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300"
                                  />
                                  <span className="text-gray-400 text-sm">até</span>
                                  <input
                                    type="number"
                                    min={0}
                                    max={23}
                                    value={agentConfig.businessHoursEnd ?? ''}
                                    onChange={(e) => setAgentConfig((c) => ({ ...c, businessHoursEnd: e.target.value ? parseInt(e.target.value) : null }))}
                                    placeholder="Fim (0-23)"
                                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300"
                                  />
                                </div>
                                <p className="text-xs text-gray-400 mt-1">Deixe em branco para atender 24h</p>
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1.5">Mensagem fora do horário</label>
                                <textarea
                                  rows={2}
                                  value={agentConfig.offHoursMessage}
                                  onChange={(e) => setAgentConfig((c) => ({ ...c, offHoursMessage: e.target.value }))}
                                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1.5">Máximo de mensagens por conversa</label>
                                <input
                                  type="number"
                                  min={1}
                                  max={100}
                                  value={agentConfig.maxAiMessages}
                                  onChange={(e) => setAgentConfig((c) => ({ ...c, maxAiMessages: parseInt(e.target.value) || 20 }))}
                                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300"
                                />
                                <p className="text-xs text-gray-400 mt-1">Após esse limite, a conversa é encaminhada para um humano</p>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })()}

                    {/* Section 4: Encaminhamento */}
                    {(() => {
                      const isOpen = openAccordion === 'handoff'
                      return (
                        <div>
                          <button
                            onClick={() => setOpenAccordion(isOpen ? null : 'handoff')}
                            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
                          >
                            <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center flex-shrink-0">
                              <GitBranch size={15} className="text-emerald-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900">Encaminhamento</p>
                              <p className="text-xs text-gray-400 mt-0.5">Como a IA decide para qual agente transferir</p>
                            </div>
                            <ChevronDown size={16} className={`text-gray-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
                          </button>
                          {isOpen && (
                            <div className="px-5 pb-5 pt-1 space-y-4">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-medium text-gray-900">Encaminhar automaticamente</p>
                                  <p className="text-xs text-gray-500 mt-0.5">IA escolhe o agente certo após qualificar o lead</p>
                                </div>
                                <button
                                  onClick={() => setAgentConfig((c) => ({ ...c, autoAssign: !c.autoAssign }))}
                                  className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${agentConfig.autoAssign ? 'bg-violet-600' : 'bg-gray-300'}`}
                                >
                                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${agentConfig.autoAssign ? 'left-6' : 'left-1'}`} />
                                </button>
                              </div>
                              {agentConfig.autoAssign && (
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Instruções de encaminhamento</label>
                                  <textarea
                                    rows={3}
                                    value={agentConfig.handoffInstructions}
                                    onChange={(e) => setAgentConfig((c) => ({ ...c, handoffInstructions: e.target.value }))}
                                    placeholder="Ex: Para casos urgentes, priorizar agentes mais experientes. Para clientes VIP, sempre encaminhar para o gerente..."
                                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none"
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>

                  {/* Save Button */}
                  <button
                    onClick={handleAgentSave}
                    disabled={agentSaving}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
                  >
                    {agentSaving ? (
                      <><Loader2 size={16} className="animate-spin" /> Salvando...</>
                    ) : agentSaved ? (
                      <><CheckCircle2 size={16} /> Configurações salvas!</>
                    ) : (
                      'Salvar configurações'
                    )}
                  </button>

                  {/* Agent Roles Section */}
                  <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
                    <h3 className="font-semibold text-gray-900 mb-1">Papéis dos Agentes</h3>
                    <p className="text-xs text-gray-500 mb-5">Descreva o que cada agente atende para a IA saber para quem encaminhar</p>

                    <div className="space-y-5">
                      {agentUsers.map((user) => (
                        <div key={user.id}>
                          <div className="flex items-center gap-2 mb-2">
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                              style={{ backgroundColor: getAvatarColor(user.name) }}
                            >
                              {getInitials(user.name)}
                            </div>
                            <p className="text-sm font-medium text-gray-900">{user.name}</p>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              user.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
                            }`}>
                              {user.role === 'ADMIN' ? 'Admin' : 'Agente'}
                            </span>
                          </div>
                          <textarea
                            rows={2}
                            value={agentRoleValues[user.id] ?? ''}
                            onChange={(e) => setAgentRoleValues((v) => ({ ...v, [user.id]: e.target.value }))}
                            placeholder="Ex: Atende casos trabalhistas, contratos e consultas jurídicas..."
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none"
                          />
                          <button
                            onClick={() => handleAgentRoleSave(user.id)}
                            disabled={agentRoleSaving[user.id]}
                            className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 disabled:opacity-60 transition-colors mt-1.5"
                          >
                            {agentRoleSaving[user.id] ? (
                              <><Loader2 size={13} className="animate-spin" /> Salvando...</>
                            ) : agentRoleSaved[user.id] ? (
                              <><CheckCircle2 size={13} className="text-emerald-600" /> <span className="text-emerald-700">Papel salvo!</span></>
                            ) : (
                              'Salvar papel'
                            )}
                          </button>
                        </div>
                      ))}

                      {agentUsers.length === 0 && (
                        <p className="text-sm text-gray-400 text-center py-4">Nenhum membro encontrado</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Simulation Panel */}
                <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden flex flex-col h-fit sticky top-6">
                  <div className="p-4 border-b border-gray-100">
                    <h3 className="font-semibold text-gray-900">Simulação de Conversa</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Teste como o agente responde</p>
                  </div>

                  {/* Agent avatar */}
                  <div className="flex flex-col items-center py-6 gap-3">
                    <img src="/ai-avatar.svg" alt="Avatar" className="w-16 h-16 rounded-full object-cover" />
                    <p className="font-medium text-gray-900">{agentConfig.name || 'Agente'}</p>
                    <p className="text-xs text-gray-400">Agente de IA</p>
                  </div>

                  {simulationStarted ? (
                    <>
                      {/* Messages area */}
                      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[200px] max-h-[300px] bg-gray-50">
                        {simMessages.map((msg, i) => (
                          <div
                            key={i}
                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[80%] px-3 py-2 rounded-xl text-sm ${
                                msg.role === 'user'
                                  ? 'bg-violet-600 text-white rounded-br-sm'
                                  : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'
                              }`}
                            >
                              {msg.content}
                            </div>
                          </div>
                        ))}
                        {simLoading && (
                          <div className="flex justify-start">
                            <div className="bg-white border border-gray-200 rounded-xl rounded-bl-sm px-3 py-2">
                              <Loader2 size={14} className="animate-spin text-gray-400" />
                            </div>
                          </div>
                        )}
                        <div ref={simMessagesEndRef} />
                      </div>

                      {/* Input */}
                      <div className="p-3 border-t border-gray-100 flex gap-2">
                        <input
                          type="text"
                          value={simInput}
                          onChange={(e) => setSimInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault()
                              sendSimMessage()
                            }
                          }}
                          placeholder="Digite uma mensagem..."
                          className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300"
                          disabled={simLoading}
                        />
                        <button
                          onClick={sendSimMessage}
                          disabled={simLoading || !simInput.trim()}
                          className="p-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                        >
                          <Send size={16} />
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="p-4 pb-6">
                      <button
                        onClick={() => setSimulationStarted(true)}
                        className="w-full bg-violet-600 hover:bg-violet-700 text-white font-medium py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
                      >
                        <Play size={16} />
                        Iniciar Simulação
                      </button>
                      <p className="text-xs text-gray-400 text-center mt-2">
                        Salve as configurações antes de simular
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
