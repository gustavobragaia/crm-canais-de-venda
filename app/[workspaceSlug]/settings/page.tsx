'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { getPusherClient } from '@/lib/pusher'
import {
  Loader2,
  MessageCircle,
  Instagram,
  Facebook,
  Package,
  Users,
  UserPlus,
  X,
  Copy,
  Check,
  CheckCircle2,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { UpgradeModal } from '@/components/UpgradeModal'
import { PlansContent } from '@/components/billing/PlansContent'
import TokensContent from '@/components/billing/TokensContent'
import { Coins } from 'lucide-react'

interface WorkspaceUser {
  id: string
  name: string
  email: string
  role: string
  avatarUrl: string | null
  isActive: boolean
}

export default function SettingsPage() {
  const { data: session } = useSession()
  const isDemo = session?.user.workspaceSlug === 'demonstracao'
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<'team' | 'billing' | 'tokens' | 'channels'>(
    (searchParams.get('tab') as 'team' | 'billing' | 'tokens' | 'channels') ?? 'team'
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
    pageName?: string | null
    isActive?: boolean
  }>>([])
  const [connectingStatus, setConnectingStatus] = useState<Record<string, 'idle' | 'loading' | 'done'>>({})
  const [uazapiQR, setUazapiQR] = useState<{ base64: string; instanceName: string; channelId: string } | null>(null)
  const uazapiPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [metaPageModal, setMetaPageModal] = useState<{
    channelType: 'INSTAGRAM' | 'FACEBOOK'
    userToken: string
    options: Array<{ id: string; name: string }>
  } | null>(null)
  const [upgradeData, setUpgradeData] = useState<{
    activeUsers: number; maxUsers: number; plan: string;
    nextPlan: { slug: string; name: string; priceCents: number; userLimit: number; checkoutUrl: string }
  } | null>(null)

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

  const handleMetaConnect = useCallback((channelType: 'INSTAGRAM' | 'FACEBOOK') => {
    const appId = process.env.NEXT_PUBLIC_META_APP_ID
    if (!appId) {
      alert('Meta App ID não configurado. Adicione NEXT_PUBLIC_META_APP_ID nas variáveis de ambiente.')
      return
    }
    const redirectUri = encodeURIComponent(`${window.location.origin}/api/meta/callback`)
    const configId = process.env.NEXT_PUBLIC_META_IG_FB_CONFIG_ID
    const oauthUrl = configId
      ? `https://www.facebook.com/v21.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&config_id=${configId}&state=${channelType}&response_type=code`
      : `https://www.facebook.com/v21.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&scope=instagram_basic,instagram_manage_messages,pages_messaging,pages_manage_metadata,pages_show_list&state=${channelType}&response_type=code`

    const popup = window.open(oauthUrl, 'meta_oauth', 'width=600,height=700,scrollbars=yes')
    if (!popup) {
      alert('Popup bloqueado. Permita popups para este site e tente novamente.')
      return
    }

    const onMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const { code, channelType: ct, error } = event.data ?? {}
      window.removeEventListener('message', onMessage)

      if (error || !code) return

      setConnectingStatus((s) => ({ ...s, [ct]: 'loading' }))
      try {
        const res = await fetch('/api/meta/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, channelType: ct }),
        })
        const data = await res.json()
        if (!res.ok) {
          alert(data.error ?? 'Erro ao conectar.')
          setConnectingStatus((s) => ({ ...s, [ct]: 'idle' }))
          return
        }
        if (data.step === 'select') {
          setMetaPageModal({ channelType: ct, userToken: data.userToken, options: data.options })
          setConnectingStatus((s) => ({ ...s, [ct]: 'idle' }))
        } else {
          if (data.warning) {
            alert(`⚠️ Canal conectado com aviso: ${data.warning}`)
          }
          setConnectingStatus((s) => ({ ...s, [ct]: 'done' }))
          refreshChannels()
          setTimeout(() => setConnectingStatus((s) => ({ ...s, [ct]: 'idle' })), 3000)
        }
      } catch (e) {
        console.error(e)
        setConnectingStatus((s) => ({ ...s, [ct]: 'idle' }))
      }
    }

    window.addEventListener('message', onMessage)
  }, [refreshChannels])

  const handleMetaPageSelect = useCallback(async (pageId: string) => {
    if (!metaPageModal) return
    const { channelType, userToken } = metaPageModal
    setMetaPageModal(null)
    setConnectingStatus((s) => ({ ...s, [channelType]: 'loading' }))
    try {
      const res = await fetch('/api/meta/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: userToken, channelType, selectedId: pageId }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error ?? 'Erro ao conectar página.')
        setConnectingStatus((s) => ({ ...s, [channelType]: 'idle' }))
        return
      }
      if (data.warning) {
        alert(`⚠️ Canal conectado com aviso: ${data.warning}`)
      }
      setConnectingStatus((s) => ({ ...s, [channelType]: 'done' }))
      refreshChannels()
      setTimeout(() => setConnectingStatus((s) => ({ ...s, [channelType]: 'idle' })), 3000)
    } catch (e) {
      console.error(e)
      setConnectingStatus((s) => ({ ...s, [channelType]: 'idle' }))
    }
  }, [metaPageModal, refreshChannels])

  const handleMetaDisconnect = useCallback(async (channelId: string, channelType: string) => {
    if (!window.confirm(`Tem certeza que deseja desconectar este canal ${channelType}?`)) return
    setConnectingStatus((s) => ({ ...s, [`DISCONNECT_${channelId}`]: 'loading' }))
    try {
      const res = await fetch('/api/meta/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error ?? 'Erro ao desconectar.')
        return
      }
      refreshChannels()
    } catch (e) {
      console.error(e)
    } finally {
      setConnectingStatus((s) => ({ ...s, [`DISCONNECT_${channelId}`]: 'idle' }))
    }
  }, [refreshChannels])

  const handleMetaResubscribe = useCallback(async (channelId: string) => {
    setConnectingStatus((s) => ({ ...s, [`RESUB_${channelId}`]: 'loading' }))
    try {
      const res = await fetch('/api/meta/resubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId }),
      })
      const data = await res.json()
      const result = data.results?.[0]
      if (result?.success) {
        alert('Webhook re-inscrito com sucesso! Mensagens devem começar a chegar.')
      } else {
        alert(`Falhou: ${result?.error ?? 'Erro desconhecido'}. Verifique o Dashboard da Meta.`)
      }
    } catch (e) {
      console.error(e)
      alert('Erro ao re-inscrever webhook.')
    } finally {
      setConnectingStatus((s) => ({ ...s, [`RESUB_${channelId}`]: 'idle' }))
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
  }, [session])

  if (session?.user.role !== 'ADMIN') {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Acesso restrito a administradores.
      </div>
    )
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
    if (res.status === 403 && data.code === 'USER_LIMIT_REACHED' && data.nextPlan) {
      setUpgradeData({ activeUsers: data.activeUsers, maxUsers: data.maxUsers, plan: data.plan, nextPlan: data.nextPlan })
      setInviting(false)
      return
    }
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


  return (
    <div className="h-screen flex flex-col">
      {upgradeData && upgradeData.nextPlan && (
        <UpgradeModal
          currentPlan={upgradeData.plan}
          activeUsers={upgradeData.activeUsers}
          maxUsers={upgradeData.maxUsers}
          nextPlan={upgradeData.nextPlan}
          workspaceId={session.user.workspaceId}
          onClose={() => setUpgradeData(null)}
        />
      )}
      <div className="h-16 px-6 border-b border-gray-200 bg-white flex items-center">
        <h1 className="font-semibold text-gray-900">Configurações</h1>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Tabs */}
        <div className="w-48 border-r border-gray-200 bg-white p-3 flex flex-col gap-1">
          {[
            { key: 'team', label: 'Equipe', icon: Users },
            { key: 'billing', label: 'Planos', icon: Package },
            { key: 'tokens', label: 'Tokens', icon: Coins },
            { key: 'channels', label: 'Canais', icon: MessageCircle },
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
                    Um email foi enviado para <strong className="text-gray-700">{inviteResult.email}</strong> com as credenciais de acesso.
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
            <div className="flex-1 overflow-y-auto -m-6">
              <PlansContent />
            </div>
          )}

          {/* Tokens Tab */}
          {activeTab === 'tokens' && (
            <TokensContent />
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

              {/* Instagram & Facebook */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">Instagram &amp; Facebook</h3>
                <div className="space-y-3">
                  {([
                    { type: 'INSTAGRAM' as const, label: 'Instagram Direct', icon: Instagram, color: '#E4405F', desc: 'Mensagens diretas do Instagram' },
                    { type: 'FACEBOOK' as const, label: 'Facebook Messenger', icon: Facebook, color: '#1877F2', desc: 'Messenger da sua página' },
                  ] as const).map(({ type, label, icon: Icon, color, desc }) => {
                    const connected = channels.filter((c) => c.type === type)
                    const isConnecting = connectingStatus[type] === 'loading'
                    const isDone = connectingStatus[type] === 'done'
                    return (
                      <div key={type} className="bg-white border border-gray-100 shadow-sm rounded-2xl p-4">
                        {/* Connected channels */}
                        {connected.map((ch) => (
                          <div key={ch.id} className="flex items-center gap-3 mb-3">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white flex-shrink-0" style={{ backgroundColor: color }}>
                              <Icon size={16} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{ch.pageName ?? ch.name}</p>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Conectado</span>
                            </div>
                            <button
                              onClick={() => handleMetaResubscribe(ch.id)}
                              disabled={connectingStatus[`RESUB_${ch.id}`] === 'loading'}
                              className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 disabled:opacity-50"
                              title="Re-inscrever webhook (use após configurar o Dashboard da Meta)"
                            >
                              {connectingStatus[`RESUB_${ch.id}`] === 'loading'
                                ? <Loader2 size={12} className="animate-spin" />
                                : 'Re-inscrever'}
                            </button>
                            <button
                              onClick={() => handleMetaDisconnect(ch.id, label)}
                              disabled={connectingStatus[`DISCONNECT_${ch.id}`] === 'loading'}
                              className="text-xs text-gray-400 hover:text-red-500 transition-colors p-1"
                              title="Desconectar"
                            >
                              {connectingStatus[`DISCONNECT_${ch.id}`] === 'loading'
                                ? <Loader2 size={12} className="animate-spin" />
                                : <Trash2 size={12} />}
                            </button>
                          </div>
                        ))}

                        {/* Connect button */}
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white flex-shrink-0" style={{ backgroundColor: color }}>
                            <Icon size={20} />
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-gray-900 text-sm">{label}</p>
                            <p className="text-xs text-gray-500">{desc}</p>
                          </div>
                          <button
                            onClick={() => handleMetaConnect(type)}
                            disabled={isConnecting || isDone}
                            className="flex items-center gap-2 text-sm px-3 py-1.5 text-white rounded-lg transition-colors font-medium disabled:opacity-60 hover:opacity-90 flex-shrink-0"
                            style={{ backgroundColor: color }}
                          >
                            {isConnecting ? (
                              <><Loader2 size={13} className="animate-spin" /> Conectando...</>
                            ) : isDone ? (
                              <><CheckCircle2 size={13} /> Conectado!</>
                            ) : (
                              connected.length > 0 ? 'Adicionar conta' : 'Conectar'
                            )}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Meta Page Selection Modal */}
      {metaPageModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Selecionar Página</h2>
            <p className="text-sm text-gray-500 mb-4">Escolha qual página conectar ao {metaPageModal.channelType === 'INSTAGRAM' ? 'Instagram' : 'Facebook Messenger'}:</p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {metaPageModal.options.map((page) => (
                <button
                  key={page.id}
                  onClick={() => handleMetaPageSelect(page.id)}
                  className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-sm font-medium text-gray-900"
                >
                  {page.name}
                </button>
              ))}
            </div>
            <button
              onClick={() => setMetaPageModal(null)}
              className="mt-4 w-full text-sm text-gray-500 hover:text-gray-700 py-2"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
