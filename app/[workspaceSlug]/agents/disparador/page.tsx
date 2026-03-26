'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import {
  Loader2, Wifi, WifiOff, Send, FileText, MessageSquare,
  ArrowRight, Trash2, Plus, Coins, X, CheckCircle2, LayoutGrid, List,
} from 'lucide-react'
import TokenBalance from '@/components/TokenBalance'

// ─── Types ───

interface WabaChannel {
  id: string
  phoneNumber: string
  displayName: string | null
  qualityRating: string | null
  isActive: boolean
}

interface Template {
  id: string
  name: string
  language: string
  category: string
  status: string
  components: Record<string, unknown>[]
}

interface DispatchList {
  id: string
  name: string
  contactCount: number
}

interface Dispatch {
  id: string
  templateName: string
  status: string
  totalRecipients: number
  sentCount: number
  failedCount: number
  respondedCount: number
  tokensConsumed: number
  createdAt: string
  completedAt: string | null
  dispatchList: { name: string }
}

interface DispatchConversation {
  id: string
  contactName: string
  contactPhone: string | null
  pipelineStage: string | null
  lastMessageAt: string | null
  lastMessagePreview: string | null
  aiSalesEnabled: boolean
  aiSalesMessageCount: number
  updatedAt: string
}

type Tab = 'connection' | 'templates' | 'dispatch' | 'conversations'

const DISPATCH_STATUS: Record<string, string> = {
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  SENDING: 'bg-blue-100 text-blue-700',
  FAILED: 'bg-red-100 text-red-700',
  PENDING: 'bg-gray-100 text-gray-600',
}

const DISPATCH_STATUS_LABEL: Record<string, string> = {
  COMPLETED: 'Concluído',
  SENDING: 'Enviando...',
  FAILED: 'Erro',
  PENDING: 'Na fila',
}

export default function DisparadorPage() {
  const { data: session } = useSession()
  const isDemo = session?.user.workspaceSlug === 'demonstracao'
  const [activeTab, setActiveTab] = useState<Tab>('connection')
  const [channels, setChannels] = useState<WabaChannel[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [lists, setLists] = useState<DispatchList[]>([])
  const [dispatches, setDispatches] = useState<Dispatch[]>([])
  const [conversations, setConversations] = useState<DispatchConversation[]>([])
  const [tokenBalance, setTokenBalance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban')

  const [selectedListIds, setSelectedListIds] = useState<string[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [enableSdr, setEnableSdr] = useState(false)
  const [dispatching, setDispatching] = useState(false)

  const [showCreateTemplate, setShowCreateTemplate] = useState(false)
  const [newTemplate, setNewTemplate] = useState({ name: '', body: '', category: 'UTILITY' })
  const [creatingTemplate, setCreatingTemplate] = useState(false)

  const [connecting, setConnecting] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [chRes, tplRes, listRes, dispRes, convRes, tokRes] = await Promise.all([
        fetch('/api/waba/channels'),
        fetch('/api/waba/templates'),
        fetch('/api/agents/listas'),
        fetch('/api/agents/disparador'),
        fetch('/api/agents/disparador/conversations'),
        fetch('/api/tokens'),
      ])
      const safeJson = async (res: Response, fallback: Record<string, unknown>) =>
        res.ok ? res.json() : fallback
      const [chData, tplData, listData, dispData, convData, tokData] = await Promise.all([
        safeJson(chRes, { channels: [] }),
        safeJson(tplRes, { templates: [] }),
        safeJson(listRes, { lists: [] }),
        safeJson(dispRes, { dispatches: [] }),
        safeJson(convRes, { conversations: [] }),
        safeJson(tokRes, { balance: 0 }),
      ])

      setChannels(chData.channels ?? [])
      setTemplates(tplData.templates ?? [])
      setLists(listData.lists ?? [])
      setDispatches(dispData.dispatches ?? [])
      setConversations(convData.conversations ?? [])
      setTokenBalance(tokData.balance ?? 0)
    } catch (err) {
      console.error('Error fetching disparador data:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const activeChannel = channels.find((c) => c.isActive)

  const handleWabaConnect = async () => {
    setConnecting(true)
    try {
      const appId = process.env.NEXT_PUBLIC_META_APP_ID
      if (!appId) { alert('META_APP_ID não configurado'); return }

      // @ts-expect-error FB SDK global
      if (!window.FB) {
        await new Promise<void>((resolve) => {
          const script = document.createElement('script')
          script.src = 'https://connect.facebook.net/en_US/sdk.js'
          script.async = true
          script.defer = true
          script.onload = () => {
            // @ts-expect-error FB SDK global
            window.FB.init({ appId, version: 'v21.0' })
            resolve()
          }
          document.body.appendChild(script)
        })
      }

      // @ts-expect-error FB SDK global
      // FB.login callback must be synchronous — async work wrapped in IIFE
      // Embedded Signup with config_id REQUIRES response_type: 'code' — returns authResponse.code
      window.FB.login((response: { authResponse?: { code?: string; accessToken?: string } }) => {
        ;(async () => {
          const code = response.authResponse?.code
          if (!code) {
            console.error('[WABA CONNECT] FB.login failed — no code in response:', response)
            alert('Falha na autorização. Verifique se você completou todas as etapas.')
            setConnecting(false)
            return
          }

          const res = await fetch('/api/waba/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
          })

          if (res.ok) {
            fetchData()
          } else {
            const data = await res.json()
            alert(data.error ?? 'Erro ao conectar')
          }
          setConnecting(false)
        })()
      }, {
        config_id: process.env.NEXT_PUBLIC_META_WABA_CONFIG_ID,
        response_type: 'code',
        override_default_response_type: true,
        extras: { setup: { solutionID: process.env.NEXT_PUBLIC_META_WABA_CONFIG_ID } },
      })
    } catch {
      setConnecting(false)
    }
  }

  const handleCreateTemplate = async () => {
    if (!newTemplate.name || !newTemplate.body) return
    setCreatingTemplate(true)
    try {
      const res = await fetch('/api/waba/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTemplate.name.toLowerCase().replace(/\s+/g, '_'),
          category: newTemplate.category,
          components: [{ type: 'BODY', text: newTemplate.body }],
        }),
      })
      if (res.ok) {
        setShowCreateTemplate(false)
        setNewTemplate({ name: '', body: '', category: 'UTILITY' })
        fetchData()
      } else {
        const data = await res.json()
        alert(data.error ?? 'Erro ao criar template')
      }
    } finally {
      setCreatingTemplate(false)
    }
  }

  const handleDeleteTemplate = async (id: string) => {
    await fetch(`/api/waba/templates/${id}`, { method: 'DELETE' })
    fetchData()
  }

  const handleDispatch = async () => {
    if (!selectedTemplate || !selectedListIds.length || !activeChannel) return
    setDispatching(true)
    try {
      const res = await fetch('/api/agents/disparador', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wabaChannelId: activeChannel.id,
          templateName: selectedTemplate,
          listIds: selectedListIds,
          enableSdr,
        }),
      })
      if (res.ok) {
        setSelectedListIds([])
        setSelectedTemplate('')
        setEnableSdr(false)
        setActiveTab('conversations')
        fetchData()
      } else {
        const data = await res.json()
        alert(data.error ?? 'Erro ao criar disparo')
      }
    } finally {
      setDispatching(false)
    }
  }

  const handleTransfer = async (convId: string, target: 'inbox' | 'sdr') => {
    await fetch(`/api/agents/disparador/conversations/${convId}/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target }),
    })
    fetchData()
  }

  const totalSelectedContacts = lists
    .filter((l) => selectedListIds.includes(l.id))
    .reduce((sum, l) => sum + l.contactCount, 0)

  const approvedTemplates = templates.filter((t) => t.status === 'APPROVED')

  const convsByStage = {
    'Disparo Enviado': conversations.filter((c) => c.pipelineStage === 'Disparo Enviado'),
    'Disparo Respondido': conversations.filter((c) => c.pipelineStage === 'Disparo Respondido'),
    transferred: conversations.filter((c) => ['Não Atribuído', 'SDR Ativo', 'Em Atendimento', 'Reunião Marcada'].includes(c.pipelineStage ?? '')),
  }

  const tabs: Array<{ key: Tab; label: string; icon: React.ReactNode }> = [
    { key: 'connection', label: 'Conexão', icon: activeChannel ? <Wifi size={14} /> : <WifiOff size={14} /> },
    { key: 'templates', label: 'Templates', icon: <FileText size={14} /> },
    { key: 'dispatch', label: 'Novo Disparo', icon: <Send size={14} /> },
    { key: 'conversations', label: 'Conversas', icon: <MessageSquare size={14} /> },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <Send size={20} className="text-emerald-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Disparador</h2>
            <p className="text-sm text-gray-500 mt-0.5">Envie templates WABA para listas e acompanhe as respostas.</p>
          </div>
        </div>
        <TokenBalance balance={tokenBalance} compact />
      </div>

      {/* Tabs — pills style */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        {tabs.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === key
                ? 'bg-white shadow-sm text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* ─── Connection Tab ─── */}
      {activeTab === 'connection' && (
        <div className="max-w-lg space-y-4">
          <div>
            <h3 className="font-semibold text-gray-900 mb-1">WhatsApp Business API</h3>
            <p className="text-xs text-gray-500">Conecte seu número WABA para enviar templates oficiais.</p>
          </div>

          {activeChannel ? (
            <div className="bg-white border border-emerald-200 rounded-2xl shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-sm font-semibold text-emerald-700">Conectado</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Número</span>
                  <span className="font-medium text-gray-900">{activeChannel.phoneNumber}</span>
                </div>
                {activeChannel.displayName && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Nome exibido</span>
                    <span className="font-medium text-gray-900">{activeChannel.displayName}</span>
                  </div>
                )}
                {activeChannel.qualityRating && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Qualidade</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      activeChannel.qualityRating === 'GREEN' ? 'bg-emerald-50 text-emerald-700' :
                      activeChannel.qualityRating === 'YELLOW' ? 'bg-amber-50 text-amber-700' :
                      'bg-red-50 text-red-700'
                    }`}>{activeChannel.qualityRating}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-10 text-center">
              <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <WifiOff size={24} className="text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-700 mb-1">Nenhuma conta conectada</p>
              <p className="text-xs text-gray-400 mb-5">Conecte seu WhatsApp Business para enviar templates</p>
              <button
                onClick={handleWabaConnect}
                disabled={connecting}
                className="flex items-center gap-2 px-4 py-2.5 bg-[var(--primary)] text-white text-sm font-medium rounded-xl hover:opacity-90 disabled:opacity-50 mx-auto"
              >
                {connecting ? <Loader2 size={14} className="animate-spin" /> : <Wifi size={14} />}
                Conectar WhatsApp Business
              </button>
            </div>
          )}
        </div>
      )}

      {/* ─── Templates Tab ─── */}
      {activeTab === 'templates' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">Templates</h3>
              <p className="text-xs text-gray-500 mt-0.5">{templates.length} template{templates.length !== 1 ? 's' : ''}</p>
            </div>
            <button
              onClick={() => setShowCreateTemplate(true)}
              disabled={!activeChannel}
              className="flex items-center gap-1.5 px-3 py-2 bg-[var(--primary)] text-white text-sm font-medium rounded-xl hover:opacity-90 disabled:opacity-50 transition-colors"
            >
              <Plus size={14} /> Criar Template
            </button>
          </div>

          {!activeChannel && (
            <div className="px-4 py-3 bg-amber-50 border border-amber-100 rounded-xl text-sm text-amber-700">
              Conecte o WABA primeiro para gerenciar templates.
            </div>
          )}

          {templates.length === 0 ? (
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-10 text-center">
              <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <FileText size={20} className="text-gray-400" />
              </div>
              <p className="text-sm text-gray-500">Nenhum template encontrado</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden divide-y divide-gray-100">
              {templates.map((tpl) => (
                <div key={tpl.id} className="px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{tpl.name}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        tpl.category === 'UTILITY' ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-orange-700'
                      }`}>{tpl.category}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        tpl.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700' :
                        tpl.status === 'REJECTED' ? 'bg-red-50 text-red-700' :
                        'bg-amber-50 text-amber-700'
                      }`}>{tpl.status}</span>
                      <span className="text-xs text-gray-400">{tpl.language}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteTemplate(tpl.id)}
                    className="text-gray-300 hover:text-red-500 p-1 rounded transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Dispatch Tab (Wizard) ─── */}
      {activeTab === 'dispatch' && (
        <div className="max-w-2xl space-y-4">
          <div>
            <h3 className="font-semibold text-gray-900">Novo Disparo</h3>
            <p className="text-xs text-gray-500 mt-0.5">Selecione listas e um template para iniciar o disparo.</p>
          </div>

          {!activeChannel ? (
            <div className="px-4 py-3 bg-amber-50 border border-amber-100 rounded-xl text-sm text-amber-700">
              Conecte o WABA primeiro na aba Conexão.
            </div>
          ) : approvedTemplates.length === 0 ? (
            <div className="px-4 py-3 bg-amber-50 border border-amber-100 rounded-xl text-sm text-amber-700">
              Nenhum template aprovado. Crie um template na aba Templates.
            </div>
          ) : lists.length === 0 ? (
            <div className="px-4 py-3 bg-amber-50 border border-amber-100 rounded-xl text-sm text-amber-700">
              Nenhuma lista de contatos. Use o Buscador para criar listas.
            </div>
          ) : (
            <div className="space-y-4">
              {/* Step 1 */}
              <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 rounded-full bg-[var(--primary)] text-white flex items-center justify-center text-xs font-bold flex-shrink-0">1</div>
                  <h4 className="text-sm font-semibold text-gray-900">Selecionar Listas</h4>
                </div>
                <div className="space-y-2">
                  {lists.map((list) => (
                    <label key={list.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedListIds.includes(list.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedListIds([...selectedListIds, list.id])
                          else setSelectedListIds(selectedListIds.filter((id) => id !== list.id))
                        }}
                        className="rounded w-4 h-4 text-violet-600 border-gray-300"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{list.name}</p>
                        <p className="text-xs text-gray-400">{list.contactCount} contatos</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Step 2 */}
              <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 rounded-full bg-[var(--primary)] text-white flex items-center justify-center text-xs font-bold flex-shrink-0">2</div>
                  <h4 className="text-sm font-semibold text-gray-900">Selecionar Template</h4>
                </div>
                <select
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
                >
                  <option value="">Selecione um template...</option>
                  {approvedTemplates.map((tpl) => (
                    <option key={tpl.id} value={tpl.name}>{tpl.name} ({tpl.category})</option>
                  ))}
                </select>
              </div>

              {/* Step 3 — Confirm */}
              {selectedListIds.length > 0 && selectedTemplate && (
                <div className="bg-white border border-amber-200 rounded-2xl shadow-sm p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">3</div>
                    <h4 className="text-sm font-semibold text-gray-900">Confirmar Disparo</h4>
                  </div>
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Contatos selecionados</span>
                      <span className="font-medium text-gray-900">{totalSelectedContacts}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Custo estimado</span>
                      <span className="font-bold text-amber-600 flex items-center gap-1">
                        <Coins size={13} /> {totalSelectedContacts} tokens
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Saldo atual</span>
                      <span className={tokenBalance >= totalSelectedContacts ? 'text-emerald-600 font-medium' : 'text-red-600 font-medium'}>
                        {tokenBalance} tokens
                      </span>
                    </div>
                  </div>
                  <label className="flex items-center gap-3 p-3 rounded-xl bg-violet-50 border border-violet-100 cursor-pointer mb-3">
                    <input
                      type="checkbox"
                      checked={enableSdr}
                      onChange={e => setEnableSdr(e.target.checked)}
                      className="w-4 h-4 accent-violet-600 rounded"
                    />
                    <div>
                      <p className="text-sm font-medium text-violet-900">Ativar AI Vendedor para respostas</p>
                      <p className="text-xs text-violet-600 mt-0.5">O SDR responderá automaticamente quem responder este disparo.</p>
                    </div>
                  </label>
                  <button
                    onClick={handleDispatch}
                    disabled={dispatching || tokenBalance < totalSelectedContacts}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--primary)] text-white text-sm font-medium rounded-xl hover:opacity-90 disabled:opacity-50 transition-colors"
                  >
                    {dispatching ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    {tokenBalance < totalSelectedContacts ? 'Saldo insuficiente' : 'Disparar agora'}
                  </button>
                </div>
              )}

              {/* Dispatch History */}
              {dispatches.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-gray-900">Histórico de Disparos</h4>
                  <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden divide-y divide-gray-100">
                    {dispatches.map((d) => (
                      <div key={d.id} className="px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{d.templateName}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {d.dispatchList.name} · {d.sentCount}/{d.totalRecipients} enviados
                            {d.respondedCount > 0 && ` · ${d.respondedCount} respondidos`}
                          </p>
                        </div>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${DISPATCH_STATUS[d.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {DISPATCH_STATUS_LABEL[d.status] ?? d.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Conversations Tab ─── */}
      {activeTab === 'conversations' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">Conversas de Disparo</h3>
              <p className="text-xs text-gray-500 mt-0.5">{conversations.length} conversa{conversations.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('kanban')}
                className={`p-1.5 rounded transition-colors ${viewMode === 'kanban' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
              >
                <LayoutGrid size={14} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded transition-colors ${viewMode === 'list' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
              >
                <List size={14} />
              </button>
            </div>
          </div>

          {conversations.length === 0 ? (
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-10 text-center">
              <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <MessageSquare size={20} className="text-gray-400" />
              </div>
              <p className="text-sm text-gray-500">Nenhuma conversa de disparo ainda</p>
            </div>
          ) : viewMode === 'kanban' ? (
            <div className="grid grid-cols-3 gap-4">
              {([
                { key: 'Disparo Enviado' as const, label: 'Enviado', headerColor: 'bg-blue-500' },
                { key: 'Disparo Respondido' as const, label: 'Respondido', headerColor: 'bg-emerald-500' },
                { key: 'transferred' as const, label: 'Transferido', headerColor: 'bg-violet-500' },
              ]).map(({ key, label, headerColor }) => (
                <div key={key} className="bg-gray-50 rounded-2xl overflow-hidden">
                  <div className={`${headerColor} px-4 py-2.5 flex items-center justify-between`}>
                    <p className="text-xs font-semibold text-white uppercase tracking-wide">{label}</p>
                    <span className="text-xs text-white/80 font-medium">{convsByStage[key].length}</span>
                  </div>
                  <div className="p-3 space-y-2">
                    {convsByStage[key].length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-4">Nenhuma</p>
                    )}
                    {convsByStage[key].map((conv) => (
                      <div key={conv.id} className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
                        <p className="text-sm font-medium text-gray-900 truncate">{conv.contactName}</p>
                        {conv.contactPhone && (
                          <p className="text-xs text-gray-400 mt-0.5">{conv.contactPhone}</p>
                        )}
                        {conv.lastMessagePreview && (
                          <p className="text-xs text-gray-500 mt-1.5 line-clamp-2 leading-relaxed">{conv.lastMessagePreview}</p>
                        )}
                        {conv.pipelineStage === 'Disparo Respondido' && (
                          <div className="flex gap-1.5 mt-2.5">
                            <button
                              onClick={() => handleTransfer(conv.id, 'inbox')}
                              className="flex-1 text-xs py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                            >
                              Inbox
                            </button>
                            <button
                              onClick={() => handleTransfer(conv.id, 'sdr')}
                              className="flex-1 text-xs py-1.5 bg-violet-50 text-violet-600 rounded-lg hover:bg-violet-100 transition-colors font-medium flex items-center justify-center gap-1"
                            >
                              SDR <ArrowRight size={10} />
                            </button>
                          </div>
                        )}
                        {conv.pipelineStage === 'SDR Ativo' && (
                          <div className="mt-2 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
                            <span className="text-xs text-violet-600 font-medium">SDR · {conv.aiSalesMessageCount} msgs</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Nome</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Telefone</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Estágio</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Última msg</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {conversations.map((conv) => (
                    <tr key={conv.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-4 text-sm font-medium text-gray-900">{conv.contactName}</td>
                      <td className="px-5 py-4 text-sm text-gray-600">{conv.contactPhone ?? '—'}</td>
                      <td className="px-5 py-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          conv.pipelineStage === 'Disparo Enviado' ? 'bg-blue-50 text-blue-700' :
                          conv.pipelineStage === 'Disparo Respondido' ? 'bg-emerald-50 text-emerald-700' :
                          conv.pipelineStage === 'SDR Ativo' ? 'bg-violet-50 text-violet-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {conv.pipelineStage ?? '—'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-xs text-gray-500 max-w-xs truncate">
                        {conv.lastMessagePreview ?? '—'}
                      </td>
                      <td className="px-5 py-4">
                        {conv.pipelineStage === 'Disparo Respondido' && (
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => handleTransfer(conv.id, 'inbox')}
                              className="text-xs px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                            >
                              Inbox
                            </button>
                            <button
                              onClick={() => handleTransfer(conv.id, 'sdr')}
                              className="text-xs px-2.5 py-1 bg-violet-50 text-violet-600 rounded-lg hover:bg-violet-100 transition-colors font-medium"
                            >
                              SDR
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── Create Template Modal ─── */}
      {showCreateTemplate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Criar Template</h3>
              <button
                onClick={() => setShowCreateTemplate(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Nome do template</label>
                <input
                  type="text"
                  placeholder="sem_espacos_use_underline"
                  value={newTemplate.name}
                  onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Corpo da mensagem</label>
                <textarea
                  placeholder="Use {{1}}, {{2}} para variáveis dinâmicas"
                  value={newTemplate.body}
                  onChange={(e) => setNewTemplate({ ...newTemplate, body: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Categoria</label>
                <select
                  value={newTemplate.category}
                  onChange={(e) => setNewTemplate({ ...newTemplate, category: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
                >
                  <option value="UTILITY">Utility (R$0,04/msg) — recomendado</option>
                  <option value="MARKETING">Marketing (R$0,34/msg)</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 pb-5">
              <button
                onClick={() => setShowCreateTemplate(false)}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateTemplate}
                disabled={creatingTemplate || !newTemplate.name || !newTemplate.body}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white text-sm font-medium rounded-xl hover:opacity-90 disabled:opacity-50 transition-colors"
              >
                {creatingTemplate ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={14} />
                )}
                {creatingTemplate ? 'Criando...' : 'Criar template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
