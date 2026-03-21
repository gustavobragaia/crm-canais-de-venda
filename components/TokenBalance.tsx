'use client'

import { Coins } from 'lucide-react'

interface TokenBalanceProps {
  balance: number
  compact?: boolean
}

export default function TokenBalance({ balance, compact = false }: TokenBalanceProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-1.5 text-sm text-gray-600">
        <Coins size={14} className="text-amber-500" />
        <span className="font-medium">{balance}</span>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-6">
      <div className="flex items-center gap-2 text-amber-700 mb-1">
        <Coins size={20} />
        <span className="text-sm font-medium">Saldo de Tokens</span>
      </div>
      <p className="text-3xl font-bold text-gray-900">{balance}</p>
      <p className="text-xs text-gray-500 mt-1">1 token = R$1,00</p>
    </div>
  )
}
