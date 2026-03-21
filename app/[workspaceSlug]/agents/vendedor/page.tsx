'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Loader2, Save, Eye, Plus, Trash2, Bot, MessageSquare,
  Target, Users, Zap, ChevronDown, Coins, X, CheckCircle2,
  Building2, ShoppingBag, AlertCircle, Settings,
} from 'lucide-react'
import TokenBalance from '@/components/TokenBalance'

// ─── Types ───

interface ProductService {
  name: string
  price: string
  description: string
}

interface Objection {
  objection: string
  response: string
}

interface AiSalesConfig {
  id: string
  agentName: string | null
  tone: string
  businessName: string | null
  businessDescription: string | null
  targetAudience: string | null
  differentials: string | null
  productsServices: ProductService[]
  commonObjections: Objection[]
  objectives: string[]
  calendarUrl: string | null
  systemPrompt: string | null
  useCustomPrompt: boolean
  model: string
  maxMessagesPerConversation: number
  debounceSeconds: number
  blockTtlSeconds: number
}

interface Stats {
  tokensUsed: number
  activeConversations: number
  avgScore: number | null
  handoffs: number
}

// ─── Main Component ───

export default function VendedorPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [config, setConfig] = useState<AiSalesConfig | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [openSection, setOpenSection] = useState<string | null>('identity')
  const [promptPreview, setPromptPreview] = useState<string | null>(null)
  const [tokenBalance, setTokenBalance] = useState(0)

  // Form state
  const [agentName, setAgentName] = useState('')
  const [tone, setTone] = useState('informal')
  const [businessName, setBusinessName] = useState('')
  const [businessDescription, setBusinessDescription] = useState('')
  const [targetAudience, setTargetAudience] = useState('')
  const [differentials, setDifferentials] = useState('')
  const [products, setProducts] = useState<ProductService[]>([])
  const [objections, setObjections] = useState<Objection[]>([])
  const [objectives, setObjectives] = useState<string[]>(['qualify', 'schedule'])
  const [calendarUrl, setCalendarUrl] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [useCustomPrompt, setUseCustomPrompt] = useState(false)
  const [model, setModel] = useState('gpt-4.1-mini')
  const [debounceSeconds, setDebounceSeconds] = useState(15)
  const [blockTtlSeconds, setBlockTtlSeconds] = useState(2400)
  const [maxMessages, setMaxMessages] = useState(50)

  const loadData = useCallback(async () => {
    try {
      const [configRes, statsRes, tokensRes] = await Promise.all([
        fetch('/api/agents/vendedor/config'),
        fetch('/api/agents/vendedor/stats'),
        fetch('/api/tokens'),
      ])
      const configData = configRes.ok ? await configRes.json() : { config: null }
      const statsData = statsRes.ok ? await statsRes.json() : { tokensUsed: 0, activeConversations: 0, avgScore: null, handoffs: 0 }
      const tokensData = tokensRes.ok ? await tokensRes.json() : { balance: 0 }

      setStats(statsData)
      setTokenBalance(tokensData.balance ?? 0)

      if (configData.config) {
        const c = configData.config as AiSalesConfig
        setConfig(c)
        setAgentName(c.agentName ?? '')
        setTone(c.tone)
        setBusinessName(c.businessName ?? '')
        setBusinessDescription(c.businessDescription ?? '')
        setTargetAudience(c.targetAudience ?? '')
        setDifferentials(c.differentials ?? '')
        setProducts(Array.isArray(c.productsServices) ? c.productsServices : [])
        setObjections(Array.isArray(c.commonObjections) ? c.commonObjections : [])
        setObjectives(Array.isArray(c.objectives) ? c.objectives : ['qualify', 'schedule'])
        setCalendarUrl(c.calendarUrl ?? '')
        setSystemPrompt(c.systemPrompt ?? '')
        setUseCustomPrompt(c.useCustomPrompt)
        setModel(c.model)
        setDebounceSeconds(c.debounceSeconds)
        setBlockTtlSeconds(c.blockTtlSeconds)
        setMaxMessages(c.maxMessagesPerConversation)
      }
    } catch (err) {
      console.error('Failed to load vendedor config:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/agents/vendedor/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentName: agentName || null,
          tone,
          businessName: businessName || null,
          businessDescription: businessDescription || null,
          targetAudience: targetAudience || null,
          differentials: differentials || null,
          productsServices: products,
          commonObjections: objections,
          objectives,
          calendarUrl: calendarUrl || null,
          systemPrompt: systemPrompt || null,
          useCustomPrompt,
          model,
          maxMessagesPerConversation: maxMessages,
          debounceSeconds,
          blockTtlSeconds,
        }),
      })
      const data = await res.json()
      if (data.config) setConfig(data.config)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      console.error('Failed to save config:', err)
    } finally {
      setSaving(false)
    }
  }

  async function handlePreviewPrompt() {
    try {
      const res = await fetch('/api/agents/vendedor/preview-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentName, tone, businessName, businessDescription,
          targetAudience, differentials, productsServices: products,
          commonObjections: objections, objectives, calendarUrl,
        }),
      })
      const data = await res.json()
      setPromptPreview(data.prompt)
    } catch (err) {
      console.error('Failed to preview prompt:', err)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center flex-shrink-0">
            <Bot className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">O Vendedor SDR</h2>
            <p className="text-sm text-gray-500 mt-0.5">Atendimento e qualificação automática com IA</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <TokenBalance balance={tokenBalance} compact />
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saved ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? 'Salvando...' : saved ? 'Salvo!' : 'Salvar'}
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={<Coins className="w-4 h-4" />} label="Tokens Usados" value={stats.tokensUsed} bg="bg-amber-50" color="text-amber-600" />
          <StatCard icon={<MessageSquare className="w-4 h-4" />} label="Conversas Ativas" value={stats.activeConversations} bg="bg-violet-50" color="text-violet-600" />
          <StatCard icon={<Target className="w-4 h-4" />} label="Score Médio" value={stats.avgScore != null ? `${stats.avgScore}/10` : '—'} bg="bg-emerald-50" color="text-emerald-600" />
          <StatCard icon={<Users className="w-4 h-4" />} label="Handoffs" value={stats.handoffs} bg="bg-orange-50" color="text-orange-600" />
        </div>
      )}

      {/* Section: Identity */}
      <AccordionSection
        sectionKey="identity"
        open={openSection === 'identity'}
        onToggle={(k) => setOpenSection(openSection === k ? null : k)}
        icon={<Bot className="w-4 h-4" />}
        iconBg="bg-violet-50"
        iconColor="text-violet-600"
        title="Identidade do Vendedor"
        subtitle="Nome e tom de voz do agente"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Nome do vendedor</label>
            <input
              type="text"
              value={agentName}
              onChange={e => setAgentName(e.target.value)}
              placeholder="Ex: Rafael"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Tom de voz</label>
            <select
              value={tone}
              onChange={e => setTone(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
            >
              <option value="formal">Formal e profissional</option>
              <option value="informal">Informal e amigável</option>
              <option value="descontraido">Descontraído e divertido</option>
            </select>
          </div>
        </div>
      </AccordionSection>

      {/* Section: Business */}
      <AccordionSection
        sectionKey="business"
        open={openSection === 'business'}
        onToggle={(k) => setOpenSection(openSection === k ? null : k)}
        icon={<Building2 className="w-4 h-4" />}
        iconBg="bg-blue-50"
        iconColor="text-blue-600"
        title="Sobre seu Negócio"
        subtitle="Empresa, descrição, público e diferenciais"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Nome da empresa</label>
            <input
              type="text"
              value={businessName}
              onChange={e => setBusinessName(e.target.value)}
              placeholder="Ex: Agência Digital XYZ"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">O que sua empresa faz?</label>
            <textarea
              value={businessDescription}
              onChange={e => setBusinessDescription(e.target.value)}
              rows={3}
              placeholder="Descreva brevemente o que sua empresa faz..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Para quem você vende?</label>
              <textarea
                value={targetAudience}
                onChange={e => setTargetAudience(e.target.value)}
                rows={2}
                placeholder="Ex: Restaurantes, clínicas, e-commerces..."
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">O que te diferencia?</label>
              <textarea
                value={differentials}
                onChange={e => setDifferentials(e.target.value)}
                rows={2}
                placeholder="Ex: Garantia de resultados em 90 dias..."
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none"
              />
            </div>
          </div>
        </div>
      </AccordionSection>

      {/* Section: Products */}
      <AccordionSection
        sectionKey="products"
        open={openSection === 'products'}
        onToggle={(k) => setOpenSection(openSection === k ? null : k)}
        icon={<ShoppingBag className="w-4 h-4" />}
        iconBg="bg-amber-50"
        iconColor="text-amber-600"
        title="Produtos e Serviços"
        subtitle={products.length > 0 ? `${products.length} cadastrado${products.length !== 1 ? 's' : ''}` : 'Adicione o que você vende'}
      >
        <div className="space-y-3">
          {products.map((p, i) => (
            <div key={i} className="bg-gray-50 border border-gray-100 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500">Produto {i + 1}</span>
                <button
                  onClick={() => setProducts(products.filter((_, j) => j !== i))}
                  className="text-gray-300 hover:text-red-500 transition-colors p-0.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  value={p.name}
                  onChange={e => {
                    const copy = [...products]
                    copy[i] = { ...copy[i], name: e.target.value }
                    setProducts(copy)
                  }}
                  placeholder="Nome"
                  className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
                />
                <input
                  type="text"
                  value={p.price}
                  onChange={e => {
                    const copy = [...products]
                    copy[i] = { ...copy[i], price: e.target.value }
                    setProducts(copy)
                  }}
                  placeholder="Preço"
                  className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
                />
                <input
                  type="text"
                  value={p.description}
                  onChange={e => {
                    const copy = [...products]
                    copy[i] = { ...copy[i], description: e.target.value }
                    setProducts(copy)
                  }}
                  placeholder="Descrição"
                  className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
                />
              </div>
            </div>
          ))}
          <button
            onClick={() => setProducts([...products, { name: '', price: '', description: '' }])}
            className="flex items-center gap-1.5 text-sm font-medium text-violet-600 hover:text-violet-700 transition-colors py-1"
          >
            <Plus className="w-4 h-4" /> Adicionar produto/serviço
          </button>
        </div>
      </AccordionSection>

      {/* Section: Objections */}
      <AccordionSection
        sectionKey="objections"
        open={openSection === 'objections'}
        onToggle={(k) => setOpenSection(openSection === k ? null : k)}
        icon={<AlertCircle className="w-4 h-4" />}
        iconBg="bg-red-50"
        iconColor="text-red-500"
        title="Objeções Comuns"
        subtitle={objections.length > 0 ? `${objections.length} cadastrada${objections.length !== 1 ? 's' : ''}` : 'Como responder às dúvidas'}
      >
        <div className="space-y-3">
          {objections.map((o, i) => (
            <div key={i} className="bg-gray-50 border border-gray-100 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500">Objeção {i + 1}</span>
                <button
                  onClick={() => setObjections(objections.filter((_, j) => j !== i))}
                  className="text-gray-300 hover:text-red-500 transition-colors p-0.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={o.objection}
                  onChange={e => {
                    const copy = [...objections]
                    copy[i] = { ...copy[i], objection: e.target.value }
                    setObjections(copy)
                  }}
                  placeholder="Objeção do cliente"
                  className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
                />
                <input
                  type="text"
                  value={o.response}
                  onChange={e => {
                    const copy = [...objections]
                    copy[i] = { ...copy[i], response: e.target.value }
                    setObjections(copy)
                  }}
                  placeholder="Como responder"
                  className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
                />
              </div>
            </div>
          ))}
          <button
            onClick={() => setObjections([...objections, { objection: '', response: '' }])}
            className="flex items-center gap-1.5 text-sm font-medium text-violet-600 hover:text-violet-700 transition-colors py-1"
          >
            <Plus className="w-4 h-4" /> Adicionar objeção
          </button>
        </div>
      </AccordionSection>

      {/* Section: Objectives */}
      <AccordionSection
        sectionKey="objectives"
        open={openSection === 'objectives'}
        onToggle={(k) => setOpenSection(openSection === k ? null : k)}
        icon={<Target className="w-4 h-4" />}
        iconBg="bg-emerald-50"
        iconColor="text-emerald-600"
        title="Objetivos e Links"
        subtitle="O que o agente deve tentar alcançar"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'qualify', label: 'Qualificar leads' },
              { key: 'schedule', label: 'Agendar reunião' },
            ].map(obj => {
              const isChecked = objectives.includes(obj.key)
              return (
                <button
                  key={obj.key}
                  type="button"
                  onClick={() => {
                    if (isChecked) setObjectives(objectives.filter(o => o !== obj.key))
                    else setObjectives([...objectives, obj.key])
                  }}
                  className={`py-2 px-3 text-xs rounded-lg border font-medium transition-colors ${
                    isChecked
                      ? 'border-violet-600 bg-violet-50 text-violet-700'
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {obj.label}
                </button>
              )
            })}
          </div>
          {objectives.includes('schedule') && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">URL do calendário</label>
              <input
                type="url"
                value={calendarUrl}
                onChange={e => setCalendarUrl(e.target.value)}
                placeholder="https://cal.com/..."
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
              />
            </div>
          )}
        </div>
      </AccordionSection>

      {/* Section: Advanced */}
      <AccordionSection
        sectionKey="advanced"
        open={openSection === 'advanced'}
        onToggle={(k) => setOpenSection(openSection === k ? null : k)}
        icon={<Settings className="w-4 h-4" />}
        iconBg="bg-gray-100"
        iconColor="text-gray-600"
        title="Configurações Avançadas"
        subtitle="Modelo, debounce, prompt customizado"
      >
        <div className="space-y-5">
          {/* Custom prompt toggle */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
            <div>
              <p className="text-sm font-medium text-gray-900">Usar prompt customizado</p>
              <p className="text-xs text-gray-500 mt-0.5">Substitui o prompt gerado automaticamente</p>
            </div>
            <button
              type="button"
              onClick={() => setUseCustomPrompt(!useCustomPrompt)}
              className={`relative w-11 h-6 rounded-full transition-colors ${useCustomPrompt ? 'bg-violet-600' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${useCustomPrompt ? 'left-6' : 'left-1'}`} />
            </button>
          </div>

          {useCustomPrompt && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">System prompt</label>
              <textarea
                value={systemPrompt}
                onChange={e => setSystemPrompt(e.target.value)}
                rows={8}
                placeholder="Cole seu system prompt personalizado aqui..."
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none font-mono"
              />
            </div>
          )}

          <button
            onClick={handlePreviewPrompt}
            className="flex items-center gap-2 text-sm font-medium text-violet-600 hover:text-violet-700 transition-colors"
          >
            <Eye className="w-4 h-4" /> Ver prompt gerado
          </button>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Modelo de IA</label>
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
            >
              <option value="gpt-4.1-mini">GPT-4.1 Mini (recomendado)</option>
              <option value="gpt-4o-mini">GPT-4o Mini</option>
              <option value="gpt-4o">GPT-4o</option>
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-600">Debounce</label>
              <span className="text-xs font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded-lg">{debounceSeconds}s</span>
            </div>
            <input
              type="range"
              min={5}
              max={30}
              value={debounceSeconds}
              onChange={e => setDebounceSeconds(Number(e.target.value))}
              className="w-full accent-violet-600"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>5s</span><span>30s</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-600">Bloqueio após intervenção humana</label>
              <span className="text-xs font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded-lg">{Math.round(blockTtlSeconds / 60)} min</span>
            </div>
            <input
              type="range"
              min={300}
              max={7200}
              step={300}
              value={blockTtlSeconds}
              onChange={e => setBlockTtlSeconds(Number(e.target.value))}
              className="w-full accent-violet-600"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>5 min</span><span>120 min</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-600">Máx. mensagens por conversa</label>
              <span className="text-xs font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded-lg">{maxMessages}</span>
            </div>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={maxMessages}
              onChange={e => setMaxMessages(Number(e.target.value))}
              className="w-full accent-violet-600"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>10</span><span>100</span>
            </div>
          </div>
        </div>
      </AccordionSection>

      {/* Save button bottom */}
      <div className="flex justify-end pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
        >
          {saving ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
          ) : saved ? (
            <><CheckCircle2 className="w-4 h-4" /> Salvo!</>
          ) : (
            <><Save className="w-4 h-4" /> Salvar configurações</>
          )}
        </button>
      </div>

      {/* Prompt Preview Modal */}
      {promptPreview !== null && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="font-semibold text-gray-900">Prompt Gerado</h3>
                <p className="text-xs text-gray-500 mt-0.5">Este é o system prompt enviado ao modelo de IA</p>
              </div>
              <button
                onClick={() => setPromptPreview(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <pre className="text-xs whitespace-pre-wrap text-gray-700 font-mono bg-gray-50 p-4 rounded-xl leading-relaxed">
                {promptPreview}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Helper Components ───

function AccordionSection({
  sectionKey, open, onToggle, icon, iconBg, iconColor, title, subtitle, children,
}: {
  sectionKey: string
  open: boolean
  onToggle: (key: string) => void
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => onToggle(sectionKey)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
      >
        <div className={`w-8 h-8 ${iconBg} rounded-lg flex items-center justify-center flex-shrink-0`}>
          <span className={iconColor}>{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900">{title}</p>
          <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
        </div>
        <ChevronDown
          size={16}
          className={`text-gray-400 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 space-y-4 border-t border-gray-100">
          {children}
        </div>
      )}
    </div>
  )
}

function StatCard({ icon, label, value, bg, color }: {
  icon: React.ReactNode
  label: string
  value: string | number
  bg: string
  color: string
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4">
      <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg ${bg} ${color} mb-3`}>
        {icon}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}
