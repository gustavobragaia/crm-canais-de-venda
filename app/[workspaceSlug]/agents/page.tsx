'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import {
  Search, Send, Bot, ChevronRight, Coins, Loader2, ArrowRight,
} from 'lucide-react'

interface TokenData {
  balance: number
}

interface VendedorConfig {
  activeConversations?: number
}

export default function AgentsHubPage() {
  const { data: session } = useSession()
  const slug = session?.user?.workspaceSlug ?? ''
  const [tokenBalance, setTokenBalance] = useState<number | null>(null)
  const [vendedorEnabled, setVendedorEnabled] = useState(false)
  const [loadingStats, setLoadingStats] = useState(true)

  useEffect(() => {
    async function loadStats() {
      try {
        const [tokensRes, vendedorRes] = await Promise.all([
          fetch('/api/tokens'),
          fetch('/api/agents/vendedor/config'),
        ])
        const tokensData: TokenData = tokensRes.ok ? await tokensRes.json() : { balance: 0 }
        const vendedorData: { config: VendedorConfig | null } = vendedorRes.ok ? await vendedorRes.json() : { config: null }

        setTokenBalance(tokensData.balance ?? 0)
        setVendedorEnabled(!!vendedorData.config)
      } catch (err) {
        console.error('Failed to load agent stats:', err)
      } finally {
        setLoadingStats(false)
      }
    }
    loadStats()
  }, [])

  const isLowBalance = tokenBalance !== null && tokenBalance < 50

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Agentes de IA</h2>
          <p className="text-sm text-gray-500 mt-1">Automatize a prospecção, o disparo e as vendas com inteligência artificial.</p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${
            isLowBalance ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
          }`}>
            <Coins className={`w-4 h-4 ${isLowBalance ? 'text-red-500' : 'text-amber-600'}`} />
            {loadingStats ? (
              <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
            ) : (
              <span className={`font-bold text-sm ${isLowBalance ? 'text-red-600' : 'text-amber-700'}`}>
                {tokenBalance ?? 0} tokens
              </span>
            )}
          </div>
          <Link
            href={`/${slug}/settings?tab=tokens`}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-xl transition-colors"
          >
            Comprar tokens
          </Link>
        </div>
      </div>

      {/* Low balance warning */}
      {isLowBalance && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
              <Coins className="w-4 h-4 text-red-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-red-800">Saldo baixo de tokens</p>
              <p className="text-xs text-red-600 mt-0.5">Você tem apenas {tokenBalance} tokens. Recarregue para continuar usando os agentes.</p>
            </div>
          </div>
          <Link
            href={`/${slug}/settings?tab=tokens`}
            className="flex-shrink-0 text-xs font-medium px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors"
          >
            Recarregar →
          </Link>
        </div>
      )}

      {/* Agent Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Buscador */}
        <Link
          href={`/${slug}/agents/buscador`}
          className="group bg-white border border-gray-100 rounded-2xl shadow-sm p-6 hover:shadow-md hover:-translate-y-0.5 transition-all flex flex-col"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
              <Search className="w-6 h-6 text-blue-600" />
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Disponível
            </span>
          </div>

          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 mb-1">Extração de Leads</p>
          <h3 className="text-lg font-bold text-gray-900 mb-2">O Buscador</h3>
          <p className="text-sm text-gray-500 leading-relaxed flex-1">
            Encontre leads qualificados no Google Maps filtrando por nicho, cidade e avaliação. Resumos de reviews via IA.
          </p>

          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 bg-blue-50 text-blue-700 rounded-lg">
              <Coins className="w-3 h-3" /> 1 token = 2 leads
            </span>
            <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors" />
          </div>
        </Link>

        {/* Disparador */}
        <Link
          href={`/${slug}/agents/disparador`}
          className="group bg-white border border-gray-100 rounded-2xl shadow-sm p-6 hover:shadow-md hover:-translate-y-0.5 transition-all flex flex-col"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Send className="w-6 h-6 text-emerald-600" />
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Disponível
            </span>
          </div>

          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 mb-1">Disparo WABA Oficial</p>
          <h3 className="text-lg font-bold text-gray-900 mb-2">O Disparador</h3>
          <p className="text-sm text-gray-500 leading-relaxed flex-1">
            Envie templates WhatsApp Business oficiais para listas de contatos. Acompanhe respostas em Kanban.
          </p>

          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg">
              <Coins className="w-3 h-3" /> 1 token = 1 disparo
            </span>
            <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-emerald-500 transition-colors" />
          </div>
        </Link>

        {/* Vendedor */}
        <Link
          href={`/${slug}/agents/vendedor`}
          className="group bg-white border border-gray-100 rounded-2xl shadow-sm p-6 hover:shadow-md hover:-translate-y-0.5 transition-all flex flex-col"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-violet-50 flex items-center justify-center">
              <Bot className="w-6 h-6 text-violet-600" />
            </div>
            {vendedorEnabled ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-700">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
                Ativo
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                Inativo
              </span>
            )}
          </div>

          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600 mb-1">Vendas com IA</p>
          <h3 className="text-lg font-bold text-gray-900 mb-2">O Vendedor SDR</h3>
          <p className="text-sm text-gray-500 leading-relaxed flex-1">
            Atenda e qualifique leads automaticamente com IA. Debounce inteligente, detecção de intervenção humana.
          </p>

          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 bg-violet-50 text-violet-700 rounded-lg">
              <Coins className="w-3 h-3" /> 1 token = 10 msgs
            </span>
            <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-violet-500 transition-colors" />
          </div>
        </Link>
      </div>

      {/* How it works */}
      <div className="bg-gray-50 rounded-2xl p-6">
        <h3 className="font-semibold text-gray-900 mb-1">Como funciona</h3>
        <p className="text-xs text-gray-500 mb-5">Pipeline completo de prospecção e vendas com IA</p>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 md:gap-0 items-center">
          <div className="flex gap-3 md:pr-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold">
              1
            </div>
            <div>
              <p className="font-medium text-gray-900 text-sm">Busque leads</p>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">Use o Buscador para encontrar e filtrar negócios do Google Maps automaticamente.</p>
            </div>
          </div>

          <div className="hidden md:flex items-center justify-center text-gray-300">
            <ArrowRight className="w-5 h-5" />
          </div>

          <div className="flex gap-3 md:px-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-bold">
              2
            </div>
            <div>
              <p className="font-medium text-gray-900 text-sm">Dispare templates</p>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">Use o Disparador para enviar templates WABA oficiais para as listas criadas.</p>
            </div>
          </div>

          <div className="hidden md:flex items-center justify-center text-gray-300">
            <ArrowRight className="w-5 h-5" />
          </div>

          <div className="flex gap-3 md:pl-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-sm font-bold">
              3
            </div>
            <div>
              <p className="font-medium text-gray-900 text-sm">Venda com IA</p>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">O Vendedor SDR atende as respostas automaticamente e qualifica cada lead.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
