'use client'

import { AlertTriangle, CreditCard } from 'lucide-react'
import { getPlanConfig } from '@/lib/billing/planService'

interface SubscriptionBlockedModalProps {
  workspaceId: string
  plan: string
  status: 'EXPIRED' | 'CANCELED'
}

export function SubscriptionBlockedModal({ workspaceId, plan, status }: SubscriptionBlockedModalProps) {
  const planConfig = getPlanConfig(plan)

  function handleRegularize() {
    const url = planConfig.checkoutUrl
      ? `${planConfig.checkoutUrl}?utm_content=${workspaceId}&utm_source=${plan}`
      : '#'
    window.location.href = url
  }

  const isExpired = status === 'EXPIRED'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 mx-4">
        <div className="flex flex-col items-center text-center">
          <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mb-4">
            <AlertTriangle size={28} className="text-red-500" />
          </div>

          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            {isExpired ? 'Pagamento em atraso' : 'Assinatura cancelada'}
          </h2>

          <p className="text-sm text-gray-500 mb-6">
            {isExpired
              ? 'Seu plano está com o pagamento em atraso. Regularize para continuar usando a plataforma.'
              : 'Sua assinatura foi cancelada. Renove para continuar usando a plataforma.'}
          </p>

          <div className="w-full bg-gray-50 rounded-xl p-4 mb-6 text-left">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Plano atual</p>
            <p className="font-semibold text-gray-900 capitalize">{planConfig.name}</p>
          </div>

          <button
            onClick={handleRegularize}
            className="w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
          >
            <CreditCard size={15} />
            Regularizar pagamento
          </button>
        </div>
      </div>
    </div>
  )
}
