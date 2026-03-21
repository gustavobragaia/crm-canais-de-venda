'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ArrowRight, Loader2 } from 'lucide-react'

interface StageHistory {
  id: string
  fromStage: string | null
  toStage: string | null
  userName: string | null
  createdAt: string
}

interface StageHistoryTimelineProps {
  conversationId: string
}

const AVATAR_COLORS = [
  '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444',
  '#EC4899', '#06B6D4', '#6366F1', '#84CC16', '#F97316',
]
function getAvatarColor(name: string) {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]
}
function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
}

export function StageHistoryTimeline({ conversationId }: StageHistoryTimelineProps) {
  const [history, setHistory] = useState<StageHistory[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/conversations/${conversationId}/stage-history`)
      .then(r => r.ok ? r.json() : null)
      .then((data: StageHistory[] | { history: StageHistory[] } | null) => setHistory(!data ? [] : Array.isArray(data) ? data : (data.history ?? [])))
      .finally(() => setLoading(false))
  }, [conversationId])

  // Listen for Pusher conversation-updated event to refresh
  useEffect(() => {
    const handler = (e: Event) => {
      const { conversationId: cid } = (e as CustomEvent<{ conversationId: string }>).detail
      if (cid !== conversationId) return
      fetch(`/api/conversations/${conversationId}/stage-history`)
        .then(r => r.ok ? r.json() : null)
        .then((data: StageHistory[] | { history: StageHistory[] } | null) => { if (data) setHistory(Array.isArray(data) ? data : (data.history ?? [])) })
        .catch(() => {})
    }
    window.addEventListener('conversation-updated', handler)
    return () => window.removeEventListener('conversation-updated', handler)
  }, [conversationId])

  if (loading) {
    return (
      <div className="flex justify-center py-3">
        <Loader2 size={14} className="animate-spin text-gray-300" />
      </div>
    )
  }

  if (history.length === 0) {
    return <p className="text-xs text-gray-400 py-1">Nenhuma alteração de etapa</p>
  }

  return (
    <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-0.5">
      {history.map(entry => {
        const name = entry.userName ?? 'Sistema'
        return (
          <div key={entry.id} className="flex items-start gap-2">
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0 mt-0.5"
              style={{ backgroundColor: getAvatarColor(name) }}
            >
              {getInitials(name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-xs font-medium text-gray-700">{name}</span>
                <span className="text-xs text-gray-400">moveu para</span>
                {entry.fromStage && (
                  <>
                    <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{entry.fromStage}</span>
                    <ArrowRight size={10} className="text-gray-400 flex-shrink-0" />
                  </>
                )}
                <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                  {entry.toStage ?? '—'}
                </span>
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {format(new Date(entry.createdAt), "d MMM 'às' HH:mm", { locale: ptBR })}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
