'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
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
    priceId: process.env.NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID ?? '',
    features: ['1 Admin + 3 Agentes', '1.000 conversas/mês', '3 canais'],
  },
  {
    name: 'Pro',
    price: 'R$ 397/mês',
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID ?? '',
    features: ['1 Admin + 9 Agentes', '5.000 conversas/mês', 'Canais ilimitados'],
    recommended: true,
  },
  {
    name: 'Enterprise',
    price: 'R$ 997/mês',
    priceId: process.env.NEXT_PUBLIC_STRIPE_ENTERPRISE_PRICE_ID ?? '',
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
  const [channels, setChannels] = useState<Array<{ id: string; type: string; name: string; phoneNumberId?: string | null; phoneNumber?: string | null; pageId?: string | null; pageName?: string | null }>>([])
  const [picker, setPicker] = useState<{ channelType: 'WHATSAPP' | 'INSTAGRAM' | 'FACEBOOK'; userToken: string; options: Array<{ id: string; name: string }> } | null>(null)
  const [connectingStatus, setConnectingStatus] = useState<Record<string, 'idle' | 'loading' | 'done'>>({})

  const handleEmbeddedSignup = useCallback(async (channelType: 'WHATSAPP' | 'INSTAGRAM' | 'FACEBOOK') => {
    const appId = process.env.NEXT_PUBLIC_META_APP_ID
    if (!appId) { alert('META_APP_ID não configurado.'); return }

    setConnectingStatus((s) => ({ ...s, [channelType]: 'loading' }))

    try {
      await loadFBSdk(appId)

      const scope = channelType === 'WHATSAPP'
        ? 'whatsapp_business_management,whatsapp_business_messaging'
        : 'pages_messaging,pages_show_list,instagram_basic,instagram_manage_messages'

      const extras = channelType === 'WHATSAPP'
        ? { feature: 'whatsapp_embedded_signup', setup: {} }
        : {}

      window.FB.login(async (response) => {
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
      .then((r) => r.json())
      .then((data) => setChannels(data.channels ?? []))
  }, [session])

  if (session?.user.role !== 'ADMIN') {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Acesso restrito a administradores.
      </div>
    )
  }

  async function handleCheckout(priceId: string) {
    setLoading(true)
    const res = await fetch('/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId }),
    })
    const { url } = await res.json()
    if (url) window.location.href = url
    setLoading(false)
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

  async function handlePortal() {
    setLoading(true)
    const res = await fetch('/api/billing/portal', { method: 'POST' })
    const { url } = await res.json()
    if (url) window.location.href = url
    setLoading(false)
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
                  disabled={loading}
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
                    <p className="text-2xl font-bold text-gray-900 my-3">{plan.price}</p>
                    <ul className="space-y-2 mb-5">
                      {plan.features.map((f) => (
                        <li key={f} className="text-sm text-gray-600 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 bg-green-500 rounded-full flex-shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={() => handleCheckout(plan.priceId)}
                      disabled={loading}
                      className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
                        plan.recommended
                          ? 'bg-blue-500 hover:bg-blue-600 text-white'
                          : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {loading ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Assinar'}
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
              <p className="text-sm text-gray-500 mb-4">Conecte com sua conta do Facebook para autorizar automaticamente.</p>

              {/* Phone / Page picker modal */}
              {picker && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                  <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-gray-900">
                        {picker.channelType === 'WHATSAPP' ? 'Selecionar número' : 'Selecionar página'}
                      </h3>
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

              <div className="space-y-3">
                {([
                  { type: 'WHATSAPP' as const, label: 'WhatsApp Business', icon: MessageCircle, color: '#25D366', desc: 'Conecte via Embedded Signup' },
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
                          {configured
                            ? (configured.phoneNumber ?? configured.pageName ?? configured.name)
                            : desc}
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
                  Faça login com sua conta da Meta e selecione a conta de negócios desejada.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
