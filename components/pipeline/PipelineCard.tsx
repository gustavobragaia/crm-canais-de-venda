'use client'

import { useEffect, useState } from 'react'

interface Tag {
  id: string
  name: string
  color: string
}

interface PipelineCardConversation {
  id: string
  contactName: string
  lastMessagePreview: string | null
  lastMessageAt: string | null
  pipelineStage: string | null
  assignedToId: string | null
  aiEnabled: boolean
  contactPhotoUrl: string | null
  channel: { type: string } | null
  conversationTags?: Array<{ tag: Tag }>
}

interface PipelineCardProps {
  conversation: PipelineCardConversation
  onClick: () => void
}

const CHANNEL_COLORS: Record<string, string> = {
  WHATSAPP: '#25D366',
  INSTAGRAM: '#E4405F',
  FACEBOOK: '#1877F2',
}

const AVATAR_COLORS = [
  '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#EC4899',
  '#06B6D4', '#6366F1', '#84CC16', '#F97316',
]

function getAvatarColor(name: string) {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]
}
function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
}
function timeAgo(dateStr: string | null) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

export function PipelineCard({ conversation: initial, onClick }: PipelineCardProps) {
  const [conv, setConv] = useState(initial)

  // Sync when parent updates
  useEffect(() => { setConv(initial) }, [initial])

  // Listen for real-time updates
  useEffect(() => {
    const handler = (e: Event) => {
      const { conversationId, conversation } = (e as CustomEvent<{ conversationId: string; conversation: Partial<PipelineCardConversation> }>).detail
      if (conversationId === conv.id && conversation) {
        setConv(prev => ({ ...prev, ...conversation }))
      }
    }
    window.addEventListener('conversation-updated', handler)
    return () => window.removeEventListener('conversation-updated', handler)
  }, [conv.id])

  const tags = (conv.conversationTags ?? []).map(ct => ct.tag).slice(0, 2)

  return (
    <div
      onClick={onClick}
      className="bg-white border border-gray-100 rounded-xl p-3 cursor-pointer hover:shadow-sm transition-shadow"
    >
      {/* Contact row */}
      <div className="flex items-start gap-2 mb-2">
        <div className="flex-shrink-0">
          {conv.contactPhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={conv.contactPhotoUrl}
              alt={conv.contactName}
              className="w-9 h-9 rounded-full object-cover"
            />
          ) : (
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ backgroundColor: getAvatarColor(conv.contactName) }}
            >
              {getInitials(conv.contactName)}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <p className="font-medium text-gray-900 text-sm truncate">{conv.contactName}</p>
            <span className="text-xs text-gray-400 flex-shrink-0">{timeAgo(conv.lastMessageAt)}</span>
          </div>
          {conv.lastMessagePreview && (
            <p className="text-xs text-gray-500 truncate mt-0.5">{conv.lastMessagePreview.slice(0, 55)}</p>
          )}
        </div>
      </div>

      {/* Tags + channel indicator */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1 flex-wrap">
          {tags.map(tag => (
            <span
              key={tag.id}
              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full text-white"
              style={{ backgroundColor: tag.color }}
            >
              {tag.name}
            </span>
          ))}
        </div>
        {conv.channel && (
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: CHANNEL_COLORS[conv.channel.type] ?? '#9CA3AF' }}
            title={conv.channel.type}
          />
        )}
      </div>
    </div>
  )
}
