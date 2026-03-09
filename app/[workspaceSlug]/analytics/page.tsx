'use client'

import { useState, useEffect } from 'react'
import { MessageSquare, CheckCircle, AlertCircle, TrendingUp, Users, XCircle } from 'lucide-react'
import { differenceInDays } from 'date-fns'

interface Overview {
  unassigned: number
  inProgress: number
  resolved: number
  total: number
  leadsThisMonth: number
  closedLeads: number
  attendedPercent: number
  notAttendedPercent: number
  trafficByChannel: Record<string, number>
  agentStats: Array<{ userId: string; name: string; role: string; conversations: number }>
  conversationsThisMonth: number
  maxConversationsPerMonth: number
  subscriptionStatus: string
  trialEndsAt: string | null
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
}: {
  label: string
  value: number | string
  sub?: string
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
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

const CHANNEL_LABELS: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook Messenger',
}

const CHANNEL_COLORS: Record<string, string> = {
  WHATSAPP: 'bg-green-500',
  INSTAGRAM: 'bg-pink-500',
  FACEBOOK: 'bg-blue-600',
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
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

  const trafficEntries = Object.entries(overview?.trafficByChannel ?? {})
  const trafficTotal = trafficEntries.reduce((sum, [, v]) => sum + v, 0)

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
              <p className="text-sm font-medium text-blue-900">Trial: {trialDaysLeft} dias restantes</p>
              <p className="text-xs text-blue-700 mt-0.5">Atualize seu plano para continuar usando após o trial.</p>
            </div>
            <a href="settings/billing" className="ml-auto text-sm bg-blue-500 text-white px-3 py-1.5 rounded-lg hover:bg-blue-600 transition-colors">
              Ver planos
            </a>
          </div>
        )}

        {/* Main stats */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard
            label="Leads este mês"
            value={overview?.leadsThisMonth ?? 0}
            icon={TrendingUp}
            color="bg-purple-50 text-purple-600"
          />
          <StatCard
            label="Clientes fechados"
            value={overview?.closedLeads ?? 0}
            icon={CheckCircle}
            color="bg-green-50 text-green-600"
          />
          <StatCard
            label="Não atendidos"
            value={overview?.unassigned ?? 0}
            sub={`${overview?.notAttendedPercent ?? 0}% do total`}
            icon={AlertCircle}
            color="bg-red-50 text-red-600"
          />
          <StatCard
            label="Em andamento"
            value={overview?.inProgress ?? 0}
            sub={`${overview?.attendedPercent ?? 0}% sendo atendidos`}
            icon={MessageSquare}
            color="bg-blue-50 text-blue-600"
          />
          <StatCard
            label="Resolvidas"
            value={overview?.resolved ?? 0}
            icon={CheckCircle}
            color="bg-emerald-50 text-emerald-600"
          />
          <StatCard
            label="Total conversas"
            value={`${overview?.conversationsThisMonth ?? 0}/${overview?.maxConversationsPerMonth ?? 0}`}
            sub="este mês"
            icon={MessageSquare}
            color="bg-gray-50 text-gray-600"
          />
        </div>

        {/* Attendance progress */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-gray-900">Taxa de atendimento</h3>
            <span className="text-sm text-gray-500">{overview?.attendedPercent ?? 0}% atendidos</span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all"
              style={{ width: `${overview?.attendedPercent ?? 0}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-gray-400">
            <span>Atendidos: {overview?.attendedPercent ?? 0}%</span>
            <span>Não atendidos: {overview?.notAttendedPercent ?? 0}%</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Traffic by channel */}
          {trafficEntries.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="font-medium text-gray-900 mb-4">Origem dos leads (este mês)</h3>
              <div className="space-y-3">
                {trafficEntries.sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                  <div key={type}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700">{CHANNEL_LABELS[type] ?? type}</span>
                      <span className="text-gray-500">{count} ({trafficTotal > 0 ? Math.round((count / trafficTotal) * 100) : 0}%)</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${CHANNEL_COLORS[type] ?? 'bg-gray-400'}`}
                        style={{ width: `${trafficTotal > 0 ? (count / trafficTotal) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Usage bar */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-gray-900">Uso este mês</h3>
              <span className="text-sm text-gray-500">
                {overview?.conversationsThisMonth} / {overview?.maxConversationsPerMonth}
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-4">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{
                  width: `${Math.min(
                    ((overview?.conversationsThisMonth ?? 0) / (overview?.maxConversationsPerMonth ?? 1)) * 100,
                    100
                  )}%`,
                }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>Fechados: {overview?.closedLeads ?? 0}</span>
              <span>Total: {overview?.total ?? 0} conversas</span>
            </div>
          </div>
        </div>

        {/* Agent stats */}
        {(overview?.agentStats?.length ?? 0) > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Users size={16} className="text-gray-400" />
              <h3 className="font-medium text-gray-900">Por agente</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
                    <th className="text-left py-2 pr-4">Agente</th>
                    <th className="text-left py-2 pr-4">Função</th>
                    <th className="text-right py-2">Conversas atribuídas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {overview?.agentStats.map((agent) => (
                    <tr key={agent.userId} className="hover:bg-gray-50">
                      <td className="py-2.5 pr-4 font-medium text-gray-900">{agent.name}</td>
                      <td className="py-2.5 pr-4 text-gray-500">
                        {agent.role === 'ADMIN' ? 'Admin' : 'Agente'}
                      </td>
                      <td className="py-2.5 text-right font-semibold text-gray-900">{agent.conversations}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
