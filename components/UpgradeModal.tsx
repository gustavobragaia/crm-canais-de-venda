'use client'

import { X, Zap } from 'lucide-react'

interface PlanInfo {
  slug: string
  name: string
  priceCents: number
  userLimit: number
  checkoutUrl: string
}

interface UpgradeModalProps {
  currentPlan: string
  activeUsers: number
  maxUsers: number
  nextPlan: PlanInfo
  workspaceId: string
  onClose: () => void
}

function formatPrice(cents: number) {
  return `R$ ${(cents / 100).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}/mês`
}

export function UpgradeModal({
  currentPlan,
  activeUsers,
  maxUsers,
  nextPlan,
  workspaceId,
  onClose,
}: UpgradeModalProps) {
  function handleUpgrade() {
    const url = nextPlan.checkoutUrl
      ? `${nextPlan.checkoutUrl}?utm_content=${workspaceId}&utm_source=${nextPlan.slug}`
      : '#'
    window.location.href = url
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 mx-4">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
            <Zap size={20} className="text-amber-500" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Limite atingido</h2>
            <p className="text-sm text-gray-500">Faça upgrade para continuar</p>
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl p-4 mb-5">
          <p className="text-sm text-gray-600 mb-1">
            Seu plano <strong className="text-gray-900 capitalize">{currentPlan}</strong> permite até{' '}
            <strong className="text-gray-900">{maxUsers}</strong> usuário(s).
          </p>
          <p className="text-sm text-gray-600">
            Você já tem <strong className="text-gray-900">{activeUsers}</strong> usuário(s) ativos.
          </p>
        </div>

        <div className="border border-[var(--primary)] rounded-xl p-4 mb-5 relative">
          <span className="absolute -top-3 left-4 bg-[var(--primary)] text-white text-xs px-2.5 py-0.5 rounded-full font-medium">
            Recomendado
          </span>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-gray-900 text-lg">{nextPlan.name}</p>
              <p className="text-sm text-gray-500 mt-0.5">Até {nextPlan.userLimit} usuários</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="font-bold text-gray-900">{formatPrice(nextPlan.priceCents)}</p>
            </div>
          </div>
        </div>

        <button
          onClick={handleUpgrade}
          className="w-full bg-[var(--primary)] hover:opacity-90 text-white font-semibold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
        >
          <Zap size={15} />
          Fazer upgrade para {nextPlan.name}
        </button>

        <button
          onClick={onClose}
          className="w-full mt-2 text-sm text-gray-400 hover:text-gray-600 py-2 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
