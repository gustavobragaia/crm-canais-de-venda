'use client'

import { MessageCircle, Instagram, Facebook } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const CHANNEL_STYLES = {
  WHATSAPP: { color: '#25D366', icon: MessageCircle, bg: 'bg-green-100', label: 'WhatsApp' },
  INSTAGRAM: { color: '#E4405F', icon: Instagram, bg: 'bg-pink-100', label: 'Instagram' },
  FACEBOOK: { color: '#1877F2', icon: Facebook, bg: 'bg-blue-100', label: 'Facebook' },
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  UNASSIGNED: { label: 'Não atribuído', className: 'bg-red-100 text-red-700' },
  ASSIGNED: { label: 'Atribuído', className: 'bg-yellow-100 text-yellow-700' },
  IN_PROGRESS: { label: 'Em andamento', className: 'bg-blue-100 text-blue-700' },
  WAITING_CLIENT: { label: 'Aguardando', className: 'bg-orange-100 text-orange-700' },
  RESOLVED: { label: 'Resolvido', className: 'bg-green-100 text-green-700' },
  ARCHIVED: { label: 'Arquivado', className: 'bg-gray-100 text-gray-600' },
}

interface Conversation {
  id: string
  contactName: string
  lastMessagePreview: string | null
  lastMessageAt: string | null
  unreadCount: number
  status: keyof typeof STATUS_LABELS
  channel: { type: keyof typeof CHANNEL_STYLES }
  assignedTo: { name: string } | null
  aiEnabled: boolean
}

interface ConversationListProps {
  conversations: Conversation[]
  selectedId: string | null
  onSelect: (id: string) => void
  loading?: boolean
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  loading,
}: ConversationListProps) {
  if (loading) {
    return (
      <div className="flex flex-col gap-1 p-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="p-4 rounded-lg animate-pulse">
            <div className="flex gap-3">
              <div className="w-10 h-10 bg-gray-200 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-3/4" />
                <div className="h-3 bg-gray-200 rounded w-1/2" />
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (conversations.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
        Nenhuma conversa encontrada
      </div>
    )
  }

  return (
    <div className="overflow-y-auto">
      {conversations.map((conv) => {
        const channelStyle = CHANNEL_STYLES[conv.channel.type]
        const Icon = channelStyle.icon
        const isSelected = conv.id === selectedId
        const statusStyle = STATUS_LABELS[conv.status]

        return (
          <button
            key={conv.id}
            onClick={() => onSelect(conv.id)}
            className={`w-full text-left p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
              isSelected ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <div className={`w-10 h-10 rounded-full ${channelStyle.bg} flex items-center justify-center`}>
                  <Icon size={18} color={channelStyle.color} />
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <p className="font-medium text-gray-900 text-sm truncate">{conv.contactName}</p>
                  <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                    {conv.unreadCount > 0 && (
                      <span className="bg-blue-500 text-white text-xs font-medium px-1.5 py-0.5 rounded-full">
                        {conv.unreadCount}
                      </span>
                    )}
                    {conv.lastMessageAt && (
                      <span className="text-xs text-gray-400">
                        {formatDistanceToNow(new Date(conv.lastMessageAt), {
                          addSuffix: false,
                          locale: ptBR,
                        })}
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-xs text-gray-500 truncate mb-1.5">
                  {conv.lastMessagePreview ?? 'Sem mensagens'}
                </p>

                <div className="flex items-center gap-1.5">
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${statusStyle.className}`}>
                    {statusStyle.label}
                  </span>
                  {conv.assignedTo && (
                    <span className="text-xs text-gray-400 truncate">
                      → {conv.assignedTo.name}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
