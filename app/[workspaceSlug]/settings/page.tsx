'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { getPusherClient } from '@/lib/pusher'
import { Loader2, ExternalLink, MessageCircle, Instagram, Facebook, CreditCard, Users, UserPlus, X, Copy, Check, CheckCircle2 } from 'lucide-react'

declare global {
  interface Window {
    FB: {
      init: (opts: { appId: string; version: string; cookie?: boolean; xfbml?: boolean }) => void
      login: (cb: (res: { authResponse?: { accessToken?: string; code?: string } }) => void, opts?: Record<string, unknown>) => void
    }
    fbAsyncInit: () => void
  }
}

function loadFBSdk(appId: string): Promise<void> {
  return new Promise((resolve) => {
    if (window.FB) { resolve(); return }
    window.fbAsyncInit = () => {
      window.FB.init({ appId, version: 'v18.0', cookie: true, xfbml: false })
      resolve()
    }
    if (!document.getElementById('fb-jssdk')) {
      const s = document.createElement('script')
      s.id = 'fb-jssdk'
      s.src = 'https://connect.facebook.net/pt_BR/sdk.js'
      document.head.appendChild(s)
    }
  })
}

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

export default function SettingsPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'team' | 'billing' | 'channels'>('team')
  const [users, setUsers] = useState<Array<{ id: string; name: string; email: string; role: string }>>([])
  const [loading, setLoading] = useState(false)
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
    pageId?: string | null
    pageName?: string | null
    instanceName?: string | null
    isActive?: boolean
  }>>([])
  const [picker, setPicker] = useState<{ channelType: 'INSTAGRAM' | 'FACEBOOK'; userToken: string; options: Array<{ id: string; name: string }> } | null>(null)
  const [connectingStatus, setConnectingStatus] = useState<Record<string, 'idle' | 'loading' | 'done'>>({})
  const [uazapiQR, setUazapiQR] = useState<{ base64: string; instanceName: string; channelId: string } | null>(null)
  const uazapiPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

      // Poll every 3s until connected
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

  // Cleanup poll on unmount
  useEffect(() => () => stopUazapiPoll(), [stopUazapiPoll])

  const handleEmbeddedSignup = useCallback(async (channelType: 'INSTAGRAM' | 'FACEBOOK') => {
    const appId = process.env.NEXT_PUBLIC_META_APP_ID
    if (!appId) { alert('META_APP_ID não configurado.'); return }

    setConnectingStatus((s) => ({ ...s, [channelType]: 'loading' }))

    try {
      await loadFBSdk(appId)

      const scope = 'pages_messaging,pages_show_list,instagram_basic,instagram_manage_messages'
      const extras = {}

      window.FB.login((response) => {
        void (async () => {
          const token = response.authResponse?.accessToken
          if (!token) {
            setConnectingStatus((s) => ({ ...s, [channelType]: 'idle' }))
            return
          }

          const res = await fetch('/api/meta/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken: token, channelType }),
          })
          const data = await res.json()

          if (data.step === 'select') {
            setPicker({ channelType: data.channelType, userToken: data.userToken, options: data.options })
            setConnectingStatus((s) => ({ ...s, [channelType]: 'idle' }))
          } else if (data.step === 'done') {
            setChannels((prev) => {
              const filtered = prev.filter((c) => c.type !== channelType)
              return [...filtered, data.channel]
            })
            setConnectingStatus((s) => ({ ...s, [channelType]: 'done' }))
            setTimeout(() => setConnectingStatus((s) => ({ ...s, [channelType]: 'idle' })), 3000)
          } else {
            alert(data.error ?? 'Erro ao conectar.')
            setConnectingStatus((s) => ({ ...s, [channelType]: 'idle' }))
          }
        })()
      }, { scope, return_scopes: true, ...extras })
    } catch (e) {
      console.error(e)
      setConnectingStatus((s) => ({ ...s, [channelType]: 'idle' }))
    }
  }, [])

  const handlePickerSelect = useCallback(async (selectedId: string) => {
    if (!picker) return
    const { channelType, userToken, options } = picker
    const selected = options.find((o) => o.id === selectedId)
    setPicker(null)
    setConnectingStatus((s) => ({ ...s, [channelType]: 'loading' }))

    const res = await fetch('/api/meta/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: userToken, channelType, selectedId, channelName: selected?.name }),
    })
    const data = await res.json()

    if (data.step === 'done') {
      setChannels((prev) => {
        const filtered = prev.filter((c) => c.type !== channelType)
        return [...filtered, data.channel]
      })
      setConnectingStatus((s) => ({ ...s, [channelType]: 'done' }))
      setTimeout(() => setConnectingStatus((s) => ({ ...s, [channelType]: 'idle' })), 3000)
    } else {
      alert(data.error ?? 'Erro ao salvar canal.')
      setConnectingStatus((s) => ({ ...s, [channelType]: 'idle' }))
    }
  }, [picker])

  useEffect(() => {
    if (session?.user.role !== 'ADMIN') return
    fetch('/api/users')
      .then((r) => r.json())
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
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as typeof activeTab)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                activeTab === key
                  ? 'bg-blue-50 text-blue-700 font-medium'
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
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">Membros da equipe</h2>
                <button
                  onClick={() => { setShowInvite(!showInvite); setInviteResult(null) }}
                  className="flex items-center gap-2 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-lg transition-colors"
                >
                  <UserPlus size={15} />
                  Convidar membro
                </button>
              </div>

              {/* Invite form */}
              {showInvite && !inviteResult && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium text-blue-900">Novo membro</p>
                    <button onClick={() => setShowInvite(false)} className="text-blue-400 hover:text-blue-600">
                      <X size={16} />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <input
                      type="text"
                      placeholder="Nome"
                      value={inviteForm.name}
                      onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                      className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                    />
                    <input
                      type="email"
                      placeholder="Email"
                      value={inviteForm.email}
                      onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                      className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                    />
                    <select
                      value={inviteForm.role}
                      onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value as 'ADMIN' | 'AGENT' })}
                      className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                    >
                      <option value="AGENT">Agente</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </div>
                  <div className="flex justify-end mt-3">
                    <button
                      onClick={handleInvite}
                      disabled={inviting || !inviteForm.name || !inviteForm.email}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
                    >
                      {inviting ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                      Convidar
                    </button>
                  </div>
                </div>
              )}

              {/* Invite result — show temp password */}
              {inviteResult && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-green-900">Membro convidado com sucesso!</p>
                    <button onClick={() => { setInviteResult(null); setShowInvite(false) }} className="text-green-400 hover:text-green-600">
                      <X size={16} />
                    </button>
                  </div>
                  <p className="text-xs text-green-700 mb-2">
                    Compartilhe as credenciais abaixo com <strong>{inviteResult.email}</strong>:
                  </p>
                  <div className="flex items-center gap-2 bg-white border border-green-200 rounded-lg px-3 py-2">
                    <code className="text-sm flex-1 text-gray-800">{inviteResult.tempPassword}</code>
                    <button
                      onClick={() => copyPassword(inviteResult.tempPassword)}
                      className="text-gray-400 hover:text-gray-700 transition-colors"
                      title="Copiar senha"
                    >
                      {copied ? <Check size={15} className="text-green-500" /> : <Copy size={15} />}
                    </button>
                  </div>
                  <p className="text-xs text-green-600 mt-2">Esta senha não será exibida novamente.</p>
                </div>
              )}

              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Nome</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Email</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Cargo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td className="px-5 py-4 text-sm font-medium text-gray-900">{u.name}</td>
                        <td className="px-5 py-4 text-sm text-gray-600">{u.email}</td>
                        <td className="px-5 py-4">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            u.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'
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
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">Planos</h2>
                <button
                  onClick={handlePortal}
                  className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                >
                  Gerenciar assinatura <ExternalLink size={12} />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-4">
                {PLANS.map((plan) => (
                  <div
                    key={plan.name}
                    className={`bg-white border rounded-xl p-5 relative ${
                      plan.recommended ? 'border-blue-400 shadow-md' : 'border-gray-200'
                    }`}
                  >
                    {plan.recommended && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-xs px-3 py-1 rounded-full">
                        Recomendado
                      </span>
                    )}
                    <h3 className="font-bold text-gray-900 text-lg">{plan.name}</h3>
                    <p className="text-2xl font-bold text-gray-900 mt-3">{plan.price}</p>
                    <p className="text-xs text-green-600 font-medium mb-3">{plan.firstMonthPrice}</p>
                    <ul className="space-y-2 mb-5">
                      {plan.features.map((f) => (
                        <li key={f} className="text-sm text-gray-600 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 bg-green-500 rounded-full flex-shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={() => handleCheckout(plan.checkoutUrl)}
                      className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
                        plan.recommended
                          ? 'bg-blue-500 hover:bg-blue-600 text-white'
                          : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
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
              <h2 className="font-semibold text-gray-900 mb-1">Conectar canais</h2>
              <p className="text-sm text-gray-500 mb-6">Gerencie os canais de comunicação do seu workspace.</p>

              {/* Evolution QR Code modal */}
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

              {/* Meta Page picker modal */}
              {picker && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                  <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-gray-900">Selecionar página</h3>
                      <button onClick={() => setPicker(null)} className="text-gray-400 hover:text-gray-600">
                        <X size={18} />
                      </button>
                    </div>
                    <div className="space-y-2">
                      {picker.options.map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => handlePickerSelect(opt.id)}
                          className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-sm transition-colors"
                        >
                          {opt.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* WhatsApp via UazAPI */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-700 mb-3">WhatsApp</h3>
                {channels.filter((c) => c.provider === 'UAZAPI').map((ch) => (
                  <div key={ch.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4 mb-2">
                    <div className="w-10 h-10 rounded-lg bg-[#25D366] flex items-center justify-center text-white flex-shrink-0">
                      <MessageCircle size={20} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900 text-sm">{ch.name}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${ch.isActive ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {ch.isActive ? <><CheckCircle2 size={11} /> Conectado</> : 'Desconectado'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">{ch.phoneNumber ?? ch.instanceName}</p>
                    </div>
                  </div>
                ))}
                <button
                  onClick={handleUazapiConnect}
                  disabled={connectingStatus['UAZAPI_WA'] === 'loading'}
                  className="flex items-center gap-2 text-sm px-4 py-2 bg-[#25D366] hover:bg-[#20c05c] disabled:opacity-60 text-white rounded-lg transition-colors font-medium"
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

              {/* Instagram & Facebook via Meta */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">Instagram &amp; Facebook</h3>
                <div className="space-y-3">
                  {([
                    { type: 'INSTAGRAM' as const, label: 'Instagram Direct', icon: Instagram, color: '#E4405F', desc: 'Mensagens diretas do Instagram' },
                    { type: 'FACEBOOK' as const, label: 'Facebook Messenger', icon: Facebook, color: '#1877F2', desc: 'Messenger da sua página' },
                  ]).map(({ type, label, icon: Icon, color, desc }) => {
                    const configured = channels.find((c) => c.type === type)
                    const status = connectingStatus[type] ?? 'idle'
                    const isLoading = status === 'loading'
                    const isDone = status === 'done'

                    return (
                      <div key={type} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white flex-shrink-0" style={{ backgroundColor: color }}>
                          <Icon size={20} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-gray-900 text-sm">{label}</p>
                            {configured && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium flex items-center gap-1">
                                <CheckCircle2 size={11} /> Conectado
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500">
                            {configured ? (configured.pageName ?? configured.name) : desc}
                          </p>
                        </div>
                        <button
                          onClick={() => handleEmbeddedSignup(type)}
                          disabled={isLoading}
                          className="flex items-center gap-2 text-sm px-4 py-2 bg-[#1877F2] hover:bg-[#166fe5] disabled:opacity-60 text-white rounded-lg transition-colors font-medium"
                        >
                          {isLoading ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : isDone ? (
                            <CheckCircle2 size={14} />
                          ) : (
                            <Facebook size={14} />
                          )}
                          {configured ? 'Reconectar' : 'Conectar com Facebook'}
                        </button>
                      </div>
                    )
                  })}
                </div>

                <div className="mt-4 bg-blue-50 border border-blue-100 rounded-xl p-4">
                  <p className="text-sm text-blue-800">
                    Ao clicar em <strong>Conectar com Facebook</strong>, uma janela de autorização será aberta.
                    Faça login com sua conta da Meta e selecione a página desejada.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
