'use client'

import { useState, useEffect } from 'react'
import { MessageSquare, Clock, CheckCircle, AlertCircle } from 'lucide-react'
import { format, differenceInDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface Overview {
  unassigned: number
  inProgress: number
  resolved: number
  total: number
  conversationsThisMonth: number
  maxConversationsPerMonth: number
  subscriptionStatus: string
  trialEndsAt: string | null
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string
  value: number | string
  icon: React.ElementType
  color: string
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500">{label}</span>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
          <Icon size={18} />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  )
}

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/analytics/overview')
      .then((r) => r.json())
      .then((data) => setOverview(data))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="p-6">
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
              <div className="h-8 bg-gray-200 rounded w-1/2" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  const trialDaysLeft = overview?.trialEndsAt
    ? differenceInDays(new Date(overview.trialEndsAt), new Date())
    : null

  return (
    <div className="h-screen overflow-y-auto">
      <div className="h-16 px-6 border-b border-gray-200 bg-white flex items-center">
        <h1 className="font-semibold text-gray-900">Analytics</h1>
      </div>

      <div className="p-6 space-y-6">
        {/* Trial banner */}
        {overview?.subscriptionStatus === 'TRIAL' && trialDaysLeft !== null && trialDaysLeft >= 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
            <AlertCircle size={20} className="text-blue-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-blue-900">
                Trial: {trialDaysLeft} dias restantes
              </p>
              <p className="text-xs text-blue-700 mt-0.5">
                Atualize seu plano para continuar usando após o trial.
              </p>
            </div>
            <a
              href="settings/billing"
              className="ml-auto text-sm bg-blue-500 text-white px-3 py-1.5 rounded-lg hover:bg-blue-600 transition-colors"
            >
              Ver planos
            </a>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Não atribuídas"
            value={overview?.unassigned ?? 0}
            icon={AlertCircle}
            color="bg-red-50 text-red-600"
          />
          <StatCard
            label="Em andamento"
            value={overview?.inProgress ?? 0}
            icon={MessageSquare}
            color="bg-blue-50 text-blue-600"
          />
          <StatCard
            label="Resolvidas"
            value={overview?.resolved ?? 0}
            icon={CheckCircle}
            color="bg-green-50 text-green-600"
          />
          <StatCard
            label="Total este mês"
            value={`${overview?.conversationsThisMonth ?? 0}/${overview?.maxConversationsPerMonth ?? 0}`}
            icon={Clock}
            color="bg-purple-50 text-purple-600"
          />
        </div>

        {/* Usage Bar */}
        {overview && (
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-gray-900">Uso este mês</h3>
              <span className="text-sm text-gray-500">
                {overview.conversationsThisMonth} / {overview.maxConversationsPerMonth} conversas
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{
                  width: `${Math.min(
                    (overview.conversationsThisMonth / overview.maxConversationsPerMonth) * 100,
                    100
                  )}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
