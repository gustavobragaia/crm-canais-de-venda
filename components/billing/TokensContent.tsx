'use client'

import { useState, useEffect, useCallback } from 'react'
import { Coins, ExternalLink, ChevronLeft, ChevronRight, History, ShoppingCart } from 'lucide-react'
import TokenBalance from '@/components/TokenBalance'

interface TokenPackage {
  slug: string
  name: string
  tokenAmount: number
  priceCents: number
  checkoutUrl: string | null
  recommended?: boolean
}

interface Transaction {
  id: string
  type: string
  amount: number
  balanceBefore: number
  balanceAfter: number
  description: string | null
  referenceType: string | null
  createdAt: string
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  PURCHASE: { label: 'Compra', color: 'bg-emerald-50 text-emerald-700' },
  CONSUMPTION: { label: 'Consumo', color: 'bg-red-50 text-red-700' },
  REFUND: { label: 'Reembolso', color: 'bg-amber-50 text-amber-700' },
  BONUS: { label: 'Bônus', color: 'bg-blue-50 text-blue-700' },
  ADJUSTMENT: { label: 'Ajuste', color: 'bg-gray-100 text-gray-700' },
}

export default function TokensContent() {
  const [balance, setBalance] = useState(0)
  const [packages, setPackages] = useState<TokenPackage[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const [tokensRes, historyRes] = await Promise.all([
        fetch('/api/tokens'),
        fetch(`/api/tokens/history?page=${page}&limit=10`),
      ])
      const tokensData = tokensRes.ok ? await tokensRes.json() : { balance: 0, packages: [] }
      const historyData = historyRes.ok ? await historyRes.json() : { transactions: [], totalPages: 1 }

      setBalance(tokensData.balance ?? 0)
      setPackages(tokensData.packages ?? [])
      setTransactions(historyData.transactions ?? [])
      setTotalPages(historyData.totalPages ?? 1)
    } catch (err) {
      console.error('Error fetching token data:', err)
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900">Tokens</h2>
        <p className="text-sm text-gray-500 mt-1">
          Gerencie seus créditos para usar os agentes de IA
        </p>
      </div>

      {/* Balance Card */}
      <TokenBalance balance={balance} />

      {/* Equivalences info */}
      <div className="flex flex-wrap gap-3">
        {[
          { label: 'Buscador', value: '2 leads / token', color: 'bg-blue-50 text-blue-700 border-blue-100' },
          { label: 'Disparador', value: '1 disparo / token', color: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
          { label: 'Vendedor', value: '10 msgs IA / token', color: 'bg-violet-50 text-violet-700 border-violet-100' },
        ].map(item => (
          <div key={item.label} className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium ${item.color}`}>
            <Coins size={12} />
            <span className="text-gray-500 font-normal">{item.label}:</span>
            {item.value}
          </div>
        ))}
      </div>

      {/* Packages Grid */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <ShoppingCart size={15} className="text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900">Comprar Tokens</h3>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {packages.map((pkg) => (
            <div
              key={pkg.slug}
              className={`relative bg-white flex flex-col items-center text-center transition-all ${
                pkg.recommended
                  ? 'border-2 border-amber-400 rounded-2xl shadow-md scale-[1.04] ring-2 ring-amber-100'
                  : 'border border-gray-100 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5'
              }`}
            >
              {pkg.recommended && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-amber-500 text-white text-[10px] font-bold rounded-full whitespace-nowrap shadow-sm">
                  Mais econômico
                </span>
              )}

              <div className="p-5 flex flex-col items-center w-full">
                {/* Icon */}
                <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center mb-3">
                  <Coins size={18} className="text-amber-600" />
                </div>

                {/* Token amount */}
                <p className="text-2xl font-bold text-gray-900">{pkg.tokenAmount}</p>
                <p className="text-xs text-gray-400 mb-1">tokens</p>

                {/* Price */}
                <p className={`text-lg font-bold mb-4 ${pkg.recommended ? 'text-amber-600' : 'text-gray-700'}`}>
                  R${(pkg.priceCents / 100).toFixed(0)}
                </p>

                {/* Button */}
                {pkg.checkoutUrl ? (
                  <a
                    href={pkg.checkoutUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`w-full flex items-center justify-center gap-1.5 px-3 py-2.5 text-white text-xs font-semibold rounded-xl transition-colors ${
                      pkg.recommended
                        ? 'bg-amber-500 hover:bg-amber-600'
                        : 'bg-amber-500 hover:bg-amber-600'
                    }`}
                  >
                    Comprar
                    <ExternalLink size={11} />
                  </a>
                ) : (
                  <button
                    disabled
                    className="w-full px-3 py-2.5 bg-gray-100 text-gray-400 text-xs font-medium rounded-xl cursor-not-allowed"
                  >
                    Indisponível
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Transaction History */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <History size={15} className="text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900">Histórico de Transações</h3>
        </div>

        {transactions.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-10 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <History size={20} className="text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-500">Nenhuma transação ainda</p>
            <p className="text-xs text-gray-400 mt-1">Suas compras e consumos de tokens aparecerão aqui.</p>
          </div>
        ) : (
          <>
            <div className="bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Data</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Tipo</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Qtd</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Saldo</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Descrição</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {transactions.map((tx) => {
                    const typeInfo = TYPE_LABELS[tx.type] ?? TYPE_LABELS.ADJUSTMENT
                    return (
                      <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-4 text-sm text-gray-600">
                          {new Date(tx.createdAt).toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="px-5 py-4">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeInfo.color}`}>
                            {typeInfo.label}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`text-sm font-semibold ${tx.amount > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {tx.amount > 0 ? '+' : ''}{tx.amount}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-600 font-medium">{tx.balanceAfter}</td>
                        <td className="px-5 py-4 text-xs text-gray-500">{tx.description ?? '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-3">
                <p className="text-xs text-gray-400">Página {page} de {totalPages}</p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
