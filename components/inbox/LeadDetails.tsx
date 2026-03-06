'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { User, Tag, FileText, ChevronDown, X, Check } from 'lucide-react'

interface ConversationDetail {
  id: string
  contactName: string
  contactPhone: string | null
  contactEmail: string | null
  status: string
  pipelineStage: string | null
  tags: string[]
  internalNotes: string | null
  assignedTo: { id: string; name: string } | null
  channel: { type: string; name: string }
}

interface User {
  id: string
  name: string
  role: string
}

interface LeadDetailsProps {
  conversationId: string | null
}

export function LeadDetails({ conversationId }: LeadDetailsProps) {
  const { data: session } = useSession()
  const [conversation, setConversation] = useState<ConversationDetail | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [stages, setStages] = useState<Array<{ id: string; name: string; color: string }>>([])
  const [newTag, setNewTag] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const isAdmin = session?.user.role === 'ADMIN'

  useEffect(() => {
    if (!conversationId) return
    fetch(`/api/conversations/${conversationId}`)
      .then((r) => r.json())
      .then((data) => {
        setConversation(data)
        setNotes(data.internalNotes ?? '')
      })
  }, [conversationId])

  useEffect(() => {
    if (!isAdmin) return
    Promise.all([
      fetch('/api/users').then((r) => r.json()),
      fetch('/api/pipeline/stages').then((r) => r.json()),
    ]).then(([u, s]) => {
      setUsers(u.users ?? [])
      setStages(s.stages ?? [])
    })
  }, [isAdmin])

  async function updateConversation(data: Record<string, unknown>) {
    if (!conversationId) return
    const res = await fetch(`/api/conversations/${conversationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      const updated = await res.json()
      setConversation((c) => c ? { ...c, ...updated } : c)
    }
  }

  async function assignTo(userId: string | null) {
    if (!conversationId) return
    await fetch(`/api/conversations/${conversationId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    setConversation((c) =>
      c ? { ...c, assignedTo: users.find((u) => u.id === userId) ?? null } : c
    )
  }

  async function saveNotes() {
    setSaving(true)
    await updateConversation({ internalNotes: notes })
    setSaving(false)
  }

  async function addTag() {
    if (!newTag.trim() || !conversation) return
    const tags = [...conversation.tags, newTag.trim()]
    await updateConversation({ tags })
    setConversation((c) => c ? { ...c, tags } : c)
    setNewTag('')
  }

  async function removeTag(tag: string) {
    if (!conversation) return
    const tags = conversation.tags.filter((t) => t !== tag)
    await updateConversation({ tags })
    setConversation((c) => c ? { ...c, tags } : c)
  }

  if (!conversationId || !conversation) {
    return (
      <div className="w-80 border-l border-gray-200 bg-white flex items-center justify-center text-gray-400 text-sm">
        Selecione uma conversa
      </div>
    )
  }

  return (
    <div className="w-80 border-l border-gray-200 bg-white overflow-y-auto flex-shrink-0">
      <div className="p-5 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900 text-sm">Detalhes do contato</h3>
      </div>

      <div className="p-5 space-y-5">
        {/* Contact Info */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <User size={14} className="text-gray-400" />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Contato</span>
          </div>
          <p className="font-semibold text-gray-900">{conversation.contactName}</p>
          {conversation.contactPhone && (
            <p className="text-sm text-gray-500">{conversation.contactPhone}</p>
          )}
          {conversation.contactEmail && (
            <p className="text-sm text-gray-500">{conversation.contactEmail}</p>
          )}
          <div className="mt-2">
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
              {conversation.channel.name} ({conversation.channel.type})
            </span>
          </div>
        </div>

        {/* Assignment (admin only) */}
        {isAdmin && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <User size={14} className="text-gray-400" />
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Atribuído a</span>
            </div>
            <select
              value={conversation.assignedTo?.id ?? ''}
              onChange={(e) => assignTo(e.target.value || null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Não atribuído</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Pipeline Stage */}
        {isAdmin && stages.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <ChevronDown size={14} className="text-gray-400" />
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Etapa</span>
            </div>
            <select
              value={conversation.pipelineStage ?? ''}
              onChange={(e) => updateConversation({ pipelineStage: e.target.value || null })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Sem etapa</option>
              {stages.map((s) => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Tags */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Tag size={14} className="text-gray-400" />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tags</span>
          </div>
          <div className="flex flex-wrap gap-1 mb-2">
            {conversation.tags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full"
              >
                {tag}
                <button onClick={() => removeTag(tag)} className="hover:text-blue-900">
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-1">
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTag()}
              placeholder="Nova tag..."
              className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={addTag}
              className="px-2 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-xs"
            >
              <Check size={12} />
            </button>
          </div>
        </div>

        {/* Internal Notes */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <FileText size={14} className="text-gray-400" />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Notas internas</span>
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={saveNotes}
            placeholder="Adicionar notas privadas..."
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          {saving && <p className="text-xs text-gray-400 mt-1">Salvando...</p>}
        </div>
      </div>
    </div>
  )
}
