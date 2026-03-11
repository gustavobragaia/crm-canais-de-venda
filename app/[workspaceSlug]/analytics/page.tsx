'use client'

import { useState, useEffect } from 'react'
import { MessageSquare, CheckCircle, AlertCircle, TrendingUp, Users, Bot, Clock, Sparkles, UserCheck, ArrowRight } from 'lucide-react'
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

interface AiMetrics {
  aiConversations: number
  aiMessages: number
  hoursSaved: number
  aiQualified: number
  aiTransferred: number
  qualificationRate: number
}

interface HeatmapCell {
  day: number
  hour: number
  count: number
}

interface AgentStat {
  userId: string
  name: string
  role: string
  conversations: number
  resolved: number
  resolutionRate: number
  messagesSent: number
  avgFirstResponseMin: number | null
  aiAssistedConversations: number
  activeConversations: number
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

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function getHeatColor(count: number, max: number): string {
  if (max === 0 || count === 0) return 'bg-gray-100'
  const ratio = count / max
  if (ratio < 0.15) return 'bg-blue-100'
  if (ratio < 0.3) return 'bg-blue-200'
  if (ratio < 0.5) return 'bg-blue-300'
  if (ratio < 0.7) return 'bg-blue-400'
  if (ratio < 0.85) return 'bg-blue-500'
  return 'bg-blue-600'
}

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [aiMetrics, setAiMetrics] = useState<AiMetrics | null>(null)
  const [heatmap, setHeatmap] = useState<HeatmapCell[]>([])
  const [agentStats, setAgentStats] = useState<AgentStat[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/analytics/overview').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/analytics/ai-metrics').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/analytics/heatmap').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/api/analytics/agent-stats').then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([ov, ai, hm, as_]) => {
      setOverview(ov)
      setAiMetrics(ai)
      setHeatmap(Array.isArray(hm) ? hm : [])
      setAgentStats(Array.isArray(as_) ? as_ : [])
    }).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="p-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
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

  // Build heatmap lookup
  const heatmapMap: Record<string, number> = {}
  let heatmapMax = 0
  for (const cell of heatmap) {
    const key = `${cell.day}-${cell.hour}`
    heatmapMap[key] = cell.count
    if (cell.count > heatmapMax) heatmapMax = cell.count
  }

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

        {/* ─── AI Metrics ─── */}
        <div className="relative">
          <div className="opacity-40 pointer-events-none select-none">
          <div className="flex items-center gap-2 mb-3">
            <Bot size={16} className="text-violet-500" />
            <h2 className="font-semibold text-gray-900">Métricas de IA</h2>
            <span className="text-xs text-gray-400">(este mês)</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-violet-50 border border-violet-100 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-violet-600">Conversas pela IA</span>
                <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center">
                  <Bot size={18} className="text-violet-600" />
                </div>
              </div>
              <p className="text-2xl font-bold text-violet-900">{aiMetrics?.aiConversations ?? 0}</p>
              <p className="text-xs text-violet-400 mt-1">{aiMetrics?.aiMessages ?? 0} msgs geradas</p>
            </div>

            <div className="bg-violet-50 border border-violet-100 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-violet-600">Horas economizadas</span>
                <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center">
                  <Clock size={18} className="text-violet-600" />
                </div>
              </div>
              <p className="text-2xl font-bold text-violet-900">~{aiMetrics?.hoursSaved ?? 0}h</p>
              <p className="text-xs text-violet-400 mt-1">estimado (3 min/msg)</p>
            </div>

            <div className="bg-violet-50 border border-violet-100 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-violet-600">Leads qualificados</span>
                <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center">
                  <Sparkles size={18} className="text-violet-600" />
                </div>
              </div>
              <p className="text-2xl font-bold text-violet-900">{aiMetrics?.aiQualified ?? 0}</p>
              <p className="text-xs text-violet-400 mt-1">tag QUALIFICADO</p>
            </div>

            <div className="bg-violet-50 border border-violet-100 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-violet-600">Transferidos</span>
                <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center">
                  <ArrowRight size={18} className="text-violet-600" />
                </div>
              </div>
              <p className="text-2xl font-bold text-violet-900">{aiMetrics?.aiTransferred ?? 0}</p>
              <p className="text-xs text-violet-400 mt-1">para humano</p>
            </div>
          </div>

          {/* Qualification rate bar */}
          {(aiMetrics?.aiConversations ?? 0) > 0 && (
            <div className="mt-3 bg-white border border-violet-100 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-700 font-medium">Taxa de qualificação pela IA</span>
                <span className="text-sm font-semibold text-violet-700">{aiMetrics?.qualificationRate ?? 0}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-500 rounded-full transition-all"
                  style={{ width: `${aiMetrics?.qualificationRate ?? 0}%` }}
                />
              </div>
              <div className="flex justify-between mt-1.5 text-xs text-gray-400">
                <span>{aiMetrics?.aiQualified ?? 0} qualificados de {aiMetrics?.aiConversations ?? 0} atendidos pela IA</span>
              </div>
            </div>
          )}
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="bg-violet-100 text-violet-700 font-semibold text-sm px-4 py-2 rounded-full border border-violet-300">
              EM BREVE
            </span>
          </div>
        </div>

        {/* ─── Heatmap ─── */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="font-semibold text-gray-900">Heatmap de Atendimento</h2>
            <span className="text-xs text-gray-400">(últimos 30 dias — mensagens recebidas)</span>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              {/* Hour labels */}
              <div className="flex ml-10 mb-1">
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="flex-1 text-center">
                    {[0, 6, 12, 18].includes(h) ? (
                      <span className="text-[10px] text-gray-400">{h}h</span>
                    ) : null}
                  </div>
                ))}
              </div>

              {/* Grid */}
              {DAY_LABELS.map((day, dayIdx) => (
                <div key={dayIdx} className="flex items-center gap-1 mb-1">
                  <span className="text-[10px] text-gray-400 w-9 text-right pr-1 shrink-0">{day}</span>
                  {Array.from({ length: 24 }, (_, hour) => {
                    const count = heatmapMap[`${dayIdx}-${hour}`] ?? 0
                    return (
                      <div
                        key={hour}
                        title={`${day} ${hour}h: ${count} msgs`}
                        className={`flex-1 h-5 rounded-sm ${getHeatColor(count, heatmapMax)}`}
                      />
                    )
                  })}
                </div>
              ))}

              {/* Legend */}
              <div className="flex items-center gap-2 mt-3 justify-end">
                <span className="text-[10px] text-gray-400">Menos</span>
                {['bg-gray-100', 'bg-blue-100', 'bg-blue-200', 'bg-blue-300', 'bg-blue-400', 'bg-blue-500', 'bg-blue-600'].map(c => (
                  <div key={c} className={`w-4 h-4 rounded-sm ${c}`} />
                ))}
                <span className="text-[10px] text-gray-400">Mais</span>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Agent Stats Table ─── */}
        {agentStats.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Users size={16} className="text-gray-400" />
              <h2 className="font-semibold text-gray-900">Métricas por Agente</h2>
              <span className="text-xs text-gray-400">(este mês)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
                    <th className="text-left py-2 pr-4 font-medium">Agente</th>
                    <th className="text-left py-2 pr-4 font-medium">Função</th>
                    <th className="text-right py-2 pr-4 font-medium">Conversas</th>
                    <th className="text-right py-2 pr-4 font-medium">Resolvidas</th>
                    <th className="text-right py-2 pr-4 font-medium">Taxa</th>
                    <th className="text-right py-2 pr-4 font-medium">Msgs enviadas</th>
                    <th className="text-right py-2 pr-4 font-medium">1ª Resposta</th>
                    <th className="text-right py-2 pr-4 font-medium">IA Assistida</th>
                    <th className="text-right py-2 font-medium">Ativas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {agentStats.map(agent => (
                    <tr key={agent.userId} className="hover:bg-gray-50">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-semibold text-gray-600">
                              {agent.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <span className="font-medium text-gray-900 truncate max-w-[120px]">{agent.name}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          agent.role === 'ADMIN'
                            ? 'bg-purple-50 text-purple-700'
                            : 'bg-blue-50 text-blue-700'
                        }`}>
                          {agent.role === 'ADMIN' ? 'Admin' : 'Agente'}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-right font-semibold text-gray-900">{agent.conversations}</td>
                      <td className="py-3 pr-4 text-right text-gray-700">{agent.resolved}</td>
                      <td className="py-3 pr-4 text-right">
                        <span className={`font-medium ${agent.resolutionRate >= 70 ? 'text-green-600' : agent.resolutionRate >= 40 ? 'text-amber-600' : 'text-gray-500'}`}>
                          {agent.resolutionRate}%
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-right text-gray-700">{agent.messagesSent}</td>
                      <td className="py-3 pr-4 text-right text-gray-500">
                        {agent.avgFirstResponseMin !== null
                          ? agent.avgFirstResponseMin >= 60
                            ? `${Math.round(agent.avgFirstResponseMin / 60)}h`
                            : `${agent.avgFirstResponseMin}min`
                          : '—'}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        {agent.aiAssistedConversations > 0 ? (
                          <span className="inline-flex items-center gap-1 text-violet-600">
                            <UserCheck size={13} />
                            {agent.aiAssistedConversations}
                          </span>
                        ) : (
                          <span className="text-gray-400">0</span>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        <span className={`font-semibold ${agent.activeConversations > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                          {agent.activeConversations}
                        </span>
                      </td>
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
