'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, MapPin, Star, Phone, ChevronRight, ArrowLeft, Trash2, Send, Users, Coins, CheckCircle2 } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import TokenBalance from '@/components/TokenBalance'

interface ScrapingJob {
  id: string
  query: string
  city: string
  status: string
  totalFound: number
  validLeads: number
  listId: string | null
  createdAt: string
  completedAt: string | null
  error: string | null
}

interface DispatchList {
  id: string
  name: string
  description: string | null
  source: string
  contactCount: number
  createdAt: string
  _count: { dispatches: number }
}

interface Contact {
  id: string
  name: string | null
  phone: string
  address: string | null
  businessType: string | null
  rating: number | null
  reviewCount: number | null
  reviewSummary: string | null
  website: string | null
}

type View = 'main' | 'list-detail'

const JOB_STATUS: Record<string, { label: string; color: string }> = {
  COMPLETED: { label: 'Concluída', color: 'bg-emerald-100 text-emerald-700' },
  FAILED: { label: 'Erro', color: 'bg-red-100 text-red-700' },
  RUNNING: { label: 'Processando...', color: 'bg-blue-100 text-blue-700' },
  PENDING: { label: 'Na fila', color: 'bg-gray-100 text-gray-600' },
}

export default function BuscadorPage() {
  const params = useParams()
  const router = useRouter()
  const workspaceSlug = params.workspaceSlug as string

  const [view, setView] = useState<View>('main')
  const [query, setQuery] = useState('')
  const [city, setCity] = useState('')
  const [zip, setZip] = useState('')
  const [maxLeads, setMaxLeads] = useState(10)
  const [searching, setSearching] = useState(false)
  const [searchStep, setSearchStep] = useState(0) // 0=idle, 1=maps, 2=filtering, 3=saving
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [jobs, setJobs] = useState<ScrapingJob[]>([])
  const [lists, setLists] = useState<DispatchList[]>([])
  const [selectedList, setSelectedList] = useState<DispatchList | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [tokenBalance, setTokenBalance] = useState(0)
  const [hasUsedFree, setHasUsedFree] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stepTimers = useRef<ReturnType<typeof setTimeout>[]>([])

  const fetchData = useCallback(async () => {
    try {
      const [jobsRes, listsRes, tokensRes] = await Promise.all([
        fetch('/api/agents/buscador'),
        fetch('/api/agents/listas'),
        fetch('/api/tokens'),
      ])
      const jobsData = jobsRes.ok ? await jobsRes.json() : { jobs: [] }
      const listsData = listsRes.ok ? await listsRes.json() : { lists: [] }
      const tokensData = tokensRes.ok ? await tokensRes.json() : { balance: 0 }

      const fetchedJobs: ScrapingJob[] = jobsData.jobs ?? []
      setJobs(fetchedJobs)
      setLists(listsData.lists ?? [])
      setTokenBalance(tokensData.balance ?? 0)
      setHasUsedFree(jobsData.hasUsedFreeScraping ?? false)
    } catch (err) {
      console.error('Error fetching buscador data:', err)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (!activeJobId) return

    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/agents/buscador/${activeJobId}`)
      const data = await res.json()
      const job = data.job as ScrapingJob

      if (job.status === 'COMPLETED' || job.status === 'FAILED') {
        if (pollRef.current) clearInterval(pollRef.current)
        setActiveJobId(null)
        setSearching(false)
        stopSearchAnimation()
        fetchData()
        if (job.status === 'FAILED') {
          setError(job.error ?? 'Erro ao processar busca')
        }
      }
    }, 3000)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [activeJobId, fetchData])

  const startSearchAnimation = () => {
    setSearchStep(1)
    stepTimers.current.forEach(clearTimeout)
    stepTimers.current = [
      setTimeout(() => setSearchStep(2), 4000),
      setTimeout(() => setSearchStep(3), 8000),
    ]
  }

  const stopSearchAnimation = () => {
    stepTimers.current.forEach(clearTimeout)
    stepTimers.current = []
    setSearchStep(0)
  }

  const handleSearch = async () => {
    if (!query.trim() || !city.trim()) return
    setSearching(true)
    setError(null)
    startSearchAnimation()

    try {
      const res = await fetch('/api/agents/buscador', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), city: city.trim(), zip: zip.trim() || undefined, maxLeads }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Erro ao iniciar busca')
        setSearching(false)
        stopSearchAnimation()
        return
      }

      const data = await res.json()
      setActiveJobId(data.jobId)
    } catch {
      setError('Erro de conexão')
      setSearching(false)
      stopSearchAnimation()
    }
  }

  const openList = async (list: DispatchList) => {
    const res = await fetch(`/api/agents/listas/${list.id}`)
    const data = await res.json()
    setSelectedList(data.list)
    setContacts(data.list.contacts ?? [])
    setView('list-detail')
  }

  const deleteList = async (listId: string) => {
    await fetch(`/api/agents/listas/${listId}`, { method: 'DELETE' })
    fetchData()
    if (selectedList?.id === listId) setView('main')
  }

  // ─── List Detail View ───
  if (view === 'list-detail' && selectedList) {
    return (
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Breadcrumb header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setView('main')}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              <ArrowLeft size={16} />
              Minhas Listas
            </button>
            <span className="text-gray-300">/</span>
            <span className="text-sm font-medium text-gray-900">{selectedList.name}</span>
          </div>
          <button
            onClick={() => router.push(`/${workspaceSlug}/agents/disparador?listId=${selectedList.id}`)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[var(--primary)] text-white text-sm font-medium rounded-xl hover:opacity-90 transition-colors"
          >
            <Send size={14} />
            Novo Disparo
          </button>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-xl">
            <Users size={14} className="text-blue-600" />
            <span className="text-sm font-medium text-blue-700">{contacts.length} contatos</span>
          </div>
          {selectedList._count.dispatches > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-xl">
              <Send size={14} className="text-emerald-600" />
              <span className="text-sm font-medium text-emerald-700">{selectedList._count.dispatches} disparos feitos</span>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Nome</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Telefone</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Tipo</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Rating</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Resumo Reviews</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {contacts.map((contact) => (
                <tr key={contact.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-4">
                    <p className="text-sm font-medium text-gray-900">{contact.name ?? '—'}</p>
                    {contact.address && (
                      <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                        <MapPin size={10} /> {contact.address}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <span className="flex items-center gap-1 text-sm text-gray-600">
                      <Phone size={12} className="text-gray-400" /> {contact.phone}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-600">{contact.businessType ?? '—'}</td>
                  <td className="px-5 py-4">
                    {contact.rating ? (
                      <span className="flex items-center gap-1 text-sm text-amber-600">
                        <Star size={12} fill="currentColor" /> {contact.rating.toFixed(1)}
                        {contact.reviewCount && (
                          <span className="text-gray-400 text-xs">({contact.reviewCount})</span>
                        )}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-5 py-4 text-xs text-gray-500 max-w-xs">
                    {contact.reviewSummary ? (
                      <p className="line-clamp-2">{contact.reviewSummary}</p>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // ─── Main View ───
  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <Search size={20} className="text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Buscador de Leads</h2>
            <p className="text-sm text-gray-500 mt-0.5">Encontre negócios no Google Maps e crie listas de contatos.</p>
          </div>
        </div>
        <TokenBalance balance={tokenBalance} compact />
      </div>

      {/* Search Form */}
      {(() => {
        const tokensNeeded = Math.ceil(maxLeads / 2)
        const isInsufficient = hasUsedFree && tokenBalance < tokensNeeded
        const steps = [
          { label: 'Consultando Google Maps', step: 1 },
          { label: 'Filtrando leads qualificados', step: 2 },
          { label: 'Criando lista de contatos', step: 3 },
        ]
        return (
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
            <h3 className="font-semibold text-gray-900 mb-1">Nova Busca</h3>
            <p className="text-xs text-gray-500 mb-4">1ª busca grátis · depois 1 token = 2 leads</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Nicho *</label>
                <input
                  type="text"
                  placeholder="Ex: clínica estética"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  disabled={searching}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white disabled:bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Cidade *</label>
                <input
                  type="text"
                  placeholder="Ex: São Paulo"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  disabled={searching}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white disabled:bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">CEP (opcional)</label>
                <input
                  type="text"
                  placeholder="Ex: 01310-100"
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  disabled={searching}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white disabled:bg-gray-50"
                />
              </div>
              {hasUsedFree ? (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-gray-600">Máx. leads</label>
                    <span className="flex items-center gap-1 text-xs font-medium text-amber-600">
                      <Coins size={11} /> {tokensNeeded} tokens
                    </span>
                  </div>
                  <select
                    value={maxLeads}
                    onChange={(e) => setMaxLeads(Number(e.target.value))}
                    disabled={searching}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white disabled:bg-gray-50"
                  >
                    <option value={10}>10 leads</option>
                    <option value={50}>50 leads</option>
                    <option value={100}>100 leads</option>
                    <option value={200}>200 leads</option>
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Amostra grátis</label>
                  <div className="px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-lg text-sm text-emerald-700 font-medium flex items-center gap-2">
                    <Coins size={13} className="text-emerald-500" />
                    1 lead · Grátis
                  </div>
                </div>
              )}
            </div>

            {/* Search animation */}
            {searching && (
              <div className="mb-4 px-4 py-4 bg-blue-50 border border-blue-100 rounded-xl">
                <div className="flex items-center gap-3 mb-3">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500" />
                  </span>
                  <span className="text-sm font-medium text-blue-700">Buscando leads…</span>
                </div>
                <div className="space-y-2">
                  {steps.map(({ label, step }) => (
                    <div key={step} className={`flex items-center gap-2 text-xs transition-opacity duration-500 ${searchStep >= step ? 'opacity-100' : 'opacity-0'}`}>
                      {searchStep > step ? (
                        <CheckCircle2 size={13} className="text-emerald-500 flex-shrink-0" />
                      ) : searchStep === step ? (
                        <span className="w-3 h-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin flex-shrink-0" />
                      ) : (
                        <span className="w-3 h-3 rounded-full border border-gray-300 flex-shrink-0" />
                      )}
                      <span className={searchStep >= step ? 'text-blue-700' : 'text-gray-400'}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isInsufficient && !searching && (
              <div className="mb-3 px-3 py-2.5 bg-amber-50 border border-amber-100 rounded-lg flex items-center gap-2">
                <Coins size={14} className="text-amber-500 flex-shrink-0" />
                <p className="text-xs text-amber-700">
                  Saldo insuficiente — você precisa de <strong>{tokensNeeded} tokens</strong> para buscar {maxLeads} leads.
                </p>
              </div>
            )}

            {error && !searching && (
              <div className="mb-3 px-3 py-2 bg-red-50 border border-red-100 rounded-lg">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={handleSearch}
                disabled={searching || !query.trim() || !city.trim() || isInsufficient}
                className="flex items-center gap-2 px-4 py-2.5 bg-[var(--primary)] text-white text-sm font-medium rounded-xl hover:opacity-90 disabled:opacity-50 transition-colors"
              >
                <Search size={14} />
                {searching ? 'Buscando...' : 'Buscar Leads'}
              </button>
            </div>
          </div>
        )
      })()}

      {/* Recent Jobs */}
      {jobs.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Buscas Recentes</h3>
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden divide-y divide-gray-100">
            {jobs.slice(0, 5).map((job) => {
              const status = JOB_STATUS[job.status] ?? JOB_STATUS.PENDING
              return (
                <div key={job.id} className="px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{job.query} — {job.city}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(job.createdAt).toLocaleDateString('pt-BR')}
                      {job.status === 'COMPLETED' && ` · ${job.validLeads} leads encontrados`}
                    </p>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${status.color}`}>
                    {status.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Lists */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Minhas Listas</h3>
        {lists.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-12 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Users size={22} className="text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-500">Nenhuma lista ainda</p>
            <p className="text-xs text-gray-400 mt-1">Faça uma busca para criar sua primeira lista.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {lists.map((list) => (
              <div
                key={list.id}
                className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer group"
                onClick={() => openList(list)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{list.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(list.createdAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteList(list.id) }}
                      className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity rounded"
                    >
                      <Trash2 size={14} />
                    </button>
                    <ChevronRight size={16} className="text-gray-300 group-hover:text-gray-500 transition-colors" />
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                      <Users size={10} /> {list.contactCount} contatos
                    </span>
                    {list._count.dispatches > 0 && (
                      <span className="text-xs text-gray-400">{list._count.dispatches} disparos</span>
                    )}
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
                    {list.source === 'buscador' ? 'Buscador' : 'Manual'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
