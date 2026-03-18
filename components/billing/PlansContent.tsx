'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Loader2, Users, Calendar, MessageSquare, TrendingUp, TrendingDown, History } from 'lucide-react'
import { PLANS } from '@/lib/billing/planService'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface BillingData {
  plan: string
  planName: string
  subscriptionStatus: string
  currentPeriodEnd: string | null
  trialEndsAt: string | null
  maxUsers: number
  activeUsers: number
  conversationsThisMonth: number
  maxConversationsPerMonth: number
}

interface SubscriptionRecord {
  id: string
  plan: string
  status: string
  currentPeriodEnd: string | null
  createdAt: string
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  TRIAL: { label: 'Trial', color: 'bg-amber-50 text-amber-700' },
  ACTIVE: { label: 'Ativo', color: 'bg-green-50 text-green-700' },
  CANCELED: { label: 'Cancelado', color: 'bg-red-50 text-red-600' },
  EXPIRED: { label: 'Expirado', color: 'bg-red-50 text-red-600' },
}

const SUB_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Ativo',
  TRIAL: 'Trial',
  CANCELED: 'Cancelado',
  EXPIRED: 'Expirado',
}

function formatPrice(cents: number) {
  return `R$ ${(cents / 100).toFixed(0)}/mês`
}

const PLAN_ORDER = ['trial', 'solo', 'starter', 'growth', 'business']

export function PlansContent() {
  const { data: session } = useSession()
  const [billing, setBilling] = useState<BillingData | null>(null)
  const [history, setHistory] = useState<SubscriptionRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/billing').then(r => r.json()),
      fetch('/api/billing/history').then(r => r.json()),
    ]).then(([billingData, historyData]) => {
      setBilling(billingData)
      setHistory(historyData.subscriptions ?? [])
      setLoading(false)
    })
  }, [])

  function handleCheckout(planSlug: string, checkoutUrl: string) {
    const workspaceId = session?.user.workspaceId
    const url = checkoutUrl ? `${checkoutUrl}?utm_content=${workspaceId}&utm_source=${planSlug}` : '#'
    window.location.href = url
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    )
  }

  if (!billing) return null

  const statusInfo = STATUS_LABELS[billing.subscriptionStatus] ?? STATUS_LABELS.TRIAL
  const usagePercent = Math.min((billing.activeUsers / billing.maxUsers) * 100, 100)
  const convPercent = billing.maxConversationsPerMonth < 999999
    ? Math.min((billing.conversationsThisMonth / billing.maxConversationsPerMonth) * 100, 100)
    : 0

  const currentIdx = PLAN_ORDER.indexOf(billing.plan)
  const upgradePlans = PLAN_ORDER.slice(currentIdx + 1).filter(s => s !== 'trial').map(s => PLANS[s]).filter(Boolean)
  const downgradePlans = PLAN_ORDER.slice(1, currentIdx).filter(s => s !== 'trial').map(s => PLANS[s]).filter(Boolean)

  const isLifetime = billing.subscriptionStatus === 'ACTIVE' && !billing.currentPeriodEnd

  return (
    <div className="p-6 max-w-3xl space-y-5">

      {/* Current plan card */}
      <div className="bg-white border border-[var(--primary)] shadow-sm rounded-2xl p-6 relative">
        <span className="absolute -top-3 left-5 bg-[var(--primary)] text-white text-[10px] px-2.5 py-0.5 rounded-full font-semibold">
          Plano atual
        </span>
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="font-bold text-gray-900 text-xl capitalize">{billing.planName}</p>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusInfo.color}`}>
              {statusInfo.label}
            </span>
          </div>
          {PLANS[billing.plan]?.priceCents > 0 && (
            <p className="text-lg font-bold text-gray-900">{formatPrice(PLANS[billing.plan].priceCents)}</p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          {/* Users */}
          <div className="bg-gray-50 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Users size={13} className="text-gray-400" />
              <span className="text-xs font-medium text-gray-500">Usuários</span>
            </div>
            <p className="text-xl font-bold text-gray-900">
              {billing.activeUsers}
              <span className="text-xs font-normal text-gray-400"> / {billing.maxUsers}</span>
            </p>
            <div className="mt-1.5 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${usagePercent}%`, backgroundColor: usagePercent >= 90 ? '#ef4444' : 'var(--primary)' }}
              />
            </div>
          </div>

          {/* Conversations (only for trial or limited plans) */}
          {billing.maxConversationsPerMonth < 999999 && (
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <MessageSquare size={13} className="text-gray-400" />
                <span className="text-xs font-medium text-gray-500">Conversas</span>
              </div>
              <p className="text-xl font-bold text-gray-900">
                {billing.conversationsThisMonth}
                <span className="text-xs font-normal text-gray-400"> / {billing.maxConversationsPerMonth}</span>
              </p>
              <div className="mt-1.5 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${convPercent}%`, backgroundColor: convPercent >= 90 ? '#ef4444' : 'var(--primary)' }}
                />
              </div>
            </div>
          )}

          {/* Next billing / expiry */}
          <div className="bg-gray-50 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Calendar size={13} className="text-gray-400" />
              <span className="text-xs font-medium text-gray-500">
                {billing.subscriptionStatus === 'TRIAL' ? 'Trial expira' : 'Próxima cobrança'}
              </span>
            </div>
            <p className="text-sm font-semibold text-gray-900">
              {isLifetime
                ? 'Vitalício'
                : billing.currentPeriodEnd
                  ? format(new Date(billing.currentPeriodEnd), 'dd/MM/yyyy', { locale: ptBR })
                  : billing.trialEndsAt
                    ? format(new Date(billing.trialEndsAt), 'dd/MM/yyyy', { locale: ptBR })
                    : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Upgrade plans */}
      {upgradePlans.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={15} className="text-gray-400" />
            <h2 className="font-semibold text-gray-900 text-sm">Fazer upgrade</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {upgradePlans.map(plan => {
              const isRecommended = plan.slug === 'growth'
              return (
                <div
                  key={plan.slug}
                  className={`relative bg-white rounded-2xl p-4 pt-5 ${
                    isRecommended
                      ? 'border-2 border-[var(--primary)] shadow-md'
                      : 'border border-gray-100'
                  }`}
                >
                  {isRecommended && (
                    <span className="absolute -top-3 left-4 bg-[var(--primary)] text-white text-[10px] px-2.5 py-0.5 rounded-full font-semibold">
                      Recomendado
                    </span>
                  )}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <p className={`font-semibold ${isRecommended ? 'text-[var(--primary)]' : 'text-gray-900'}`}>
                        {plan.name}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">Até {plan.userLimit} usuários</p>
                    </div>
                    <p className="text-sm font-bold text-gray-900 flex-shrink-0">{formatPrice(plan.priceCents)}</p>
                  </div>
                  <button
                    onClick={() => plan.checkoutUrl ? handleCheckout(plan.slug, plan.checkoutUrl) : undefined}
                    disabled={!plan.checkoutUrl}
                    className={`w-full py-2 rounded-lg text-xs font-semibold transition-colors ${
                      plan.checkoutUrl
                        ? isRecommended
                          ? 'bg-[var(--primary)] hover:opacity-90 text-white'
                          : 'bg-gray-900 hover:opacity-80 text-white'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {plan.checkoutUrl ? 'Fazer upgrade' : 'Em breve'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Downgrade plans */}
      {downgradePlans.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown size={15} className="text-gray-400" />
            <h2 className="font-semibold text-gray-900 text-sm">Fazer downgrade</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {downgradePlans.map(plan => (
              <div key={plan.slug} className="bg-white border border-gray-100 rounded-2xl p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <p className="font-semibold text-gray-900">{plan.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Até {plan.userLimit} usuários</p>
                  </div>
                  <p className="text-sm font-bold text-gray-900 flex-shrink-0">{formatPrice(plan.priceCents)}</p>
                </div>
                <button
                  onClick={() => plan.checkoutUrl ? handleCheckout(plan.slug, plan.checkoutUrl) : undefined}
                  disabled={!plan.checkoutUrl}
                  className={`w-full py-2 rounded-lg text-xs font-semibold transition-colors ${
                    plan.checkoutUrl
                      ? 'border border-gray-200 text-gray-700 hover:bg-gray-50'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {plan.checkoutUrl ? 'Fazer downgrade' : 'Em breve'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payment history */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <History size={15} className="text-gray-400" />
          <h2 className="font-semibold text-gray-900 text-sm">Histórico de pagamentos</h2>
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center bg-gray-50 rounded-xl">
            Nenhum pagamento registrado
          </p>
        ) : (
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Plano</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Data</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Validade</th>
                </tr>
              </thead>
              <tbody>
                {history.map((sub, i) => (
                  <tr key={sub.id} className={i !== history.length - 1 ? 'border-b border-gray-100' : ''}>
                    <td className="px-4 py-3 font-medium text-gray-900 capitalize">
                      {PLANS[sub.plan]?.name ?? sub.plan}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_LABELS[sub.status]?.color ?? 'bg-gray-100 text-gray-600'}`}>
                        {SUB_STATUS_LABELS[sub.status] ?? sub.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {format(new Date(sub.createdAt), 'dd/MM/yyyy', { locale: ptBR })}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {sub.currentPeriodEnd
                        ? format(new Date(sub.currentPeriodEnd), 'dd/MM/yyyy', { locale: ptBR })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 text-center pb-4">
        Para gerenciar ou cancelar sua assinatura, acesse o portal do cliente em{' '}
        <a href="https://kirvano.com" target="_blank" rel="noopener noreferrer" className="underline">
          kirvano.com
        </a>
      </p>
    </div>
  )
}
