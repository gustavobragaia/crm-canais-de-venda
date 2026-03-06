'use client'

import { useState, useEffect } from 'react'
import { MessageCircle, Instagram, Facebook } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const CHANNEL_ICONS = {
  WHATSAPP: { icon: MessageCircle, color: '#25D366' },
  INSTAGRAM: { icon: Instagram, color: '#E4405F' },
  FACEBOOK: { icon: Facebook, color: '#1877F2' },
}

interface Conversation {
  id: string
  contactName: string
  contactPhone: string | null
  status: string
  lastMessageAt: string | null
  pipelineStage: string | null
  unreadCount: number
  channel: { type: keyof typeof CHANNEL_ICONS; name: string }
  assignedTo: { name: string } | null
}

const STATUS_LABELS: Record<string, string> = {
  UNASSIGNED: 'Não atribuído',
  ASSIGNED: 'Atribuído',
  IN_PROGRESS: 'Em andamento',
  WAITING_CLIENT: 'Aguardando',
  RESOLVED: 'Resolvido',
  ARCHIVED: 'Arquivado',
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/conversations')
      .then((r) => r.json())
      .then((data) => setLeads(data.conversations ?? []))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="p-6">
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col">
      <div className="h-16 px-6 border-b border-gray-200 bg-white flex items-center">
        <h1 className="font-semibold text-gray-900">Leads ({leads.length})</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Contato</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Canal</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Status</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Etapa</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Atribuído</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Última msg</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {leads.map((lead) => {
                const channelInfo = CHANNEL_ICONS[lead.channel.type]
                const Icon = channelInfo?.icon ?? MessageCircle

                return (
                  <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900 text-sm">{lead.contactName}</p>
                        {lead.unreadCount > 0 && (
                          <span className="bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                            {lead.unreadCount}
                          </span>
                        )}
                      </div>
                      {lead.contactPhone && (
                        <p className="text-xs text-gray-400">{lead.contactPhone}</p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5">
                        <Icon size={14} color={channelInfo?.color} />
                        <span className="text-sm text-gray-600">{lead.channel.type}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                        {STATUS_LABELS[lead.status] ?? lead.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-sm text-gray-600">{lead.pipelineStage ?? '—'}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-sm text-gray-600">{lead.assignedTo?.name ?? '—'}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-xs text-gray-400">
                        {lead.lastMessageAt
                          ? formatDistanceToNow(new Date(lead.lastMessageAt), {
                              addSuffix: true,
                              locale: ptBR,
                            })
                          : '—'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {leads.length === 0 && (
            <div className="py-12 text-center text-gray-400">Nenhum lead encontrado</div>
          )}
        </div>
      </div>
    </div>
  )
}
