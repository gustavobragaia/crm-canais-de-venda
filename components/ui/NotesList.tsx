'use client'

import { useState, useEffect, useRef } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Send, Loader2 } from 'lucide-react'

interface Note {
  id: string
  content: string
  createdAt: string
  user: { id: string; name: string } | null
}

interface NotesListProps {
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

export function NotesList({ conversationId }: NotesListProps) {
  const [notes, setNotes] = useState<Note[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/conversations/${conversationId}/notes`)
      .then(r => r.json())
      .then((data: Note[] | { notes: Note[] }) => setNotes(Array.isArray(data) ? data : (data.notes ?? [])))
      .finally(() => setLoading(false))
  }, [conversationId])

  // Scroll to bottom on new note
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [notes.length])

  // Pusher real-time: listen to note-added on conversation channel
  useEffect(() => {
    const handler = (e: Event) => {
      const { conversationId: cid, note } = (e as CustomEvent<{ conversationId: string; note: Note }>).detail
      if (cid === conversationId) {
        setNotes(prev => prev.find(n => n.id === note.id) ? prev : [...prev, note])
      }
    }
    window.addEventListener('note-added', handler)
    return () => window.removeEventListener('note-added', handler)
  }, [conversationId])

  async function addNote() {
    const content = text.trim()
    if (!content) return
    setSaving(true)
    try {
      const res = await fetch(`/api/conversations/${conversationId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (res.ok) {
        const note = await res.json() as Note
        setNotes(prev => prev.find(n => n.id === note.id) ? prev : [...prev, note])
        setText('')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Notes list */}
      <div className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-0.5">
        {loading && (
          <div className="flex justify-center py-4">
            <Loader2 size={16} className="animate-spin text-gray-300" />
          </div>
        )}
        {!loading && notes.length === 0 && (
          <p className="text-xs text-gray-400 py-2 text-center">Nenhuma nota ainda</p>
        )}
        {notes.map(note => {
          const name = note.user?.name ?? 'Usuário'
          return (
            <div key={note.id} className="flex items-start gap-2">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0 mt-0.5"
                style={{ backgroundColor: getAvatarColor(name) }}
              >
                {getInitials(name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="bg-amber-50 border border-amber-100 rounded-xl rounded-tl-sm px-3 py-2">
                  <p className="text-xs text-gray-800 whitespace-pre-wrap break-words">{note.content}</p>
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5 px-1">
                  {name} · {format(new Date(note.createdAt), "d MMM 'às' HH:mm", { locale: ptBR })}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 items-end">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void addNote() }
          }}
          placeholder="Adicionar nota interna..."
          rows={2}
          className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none bg-white placeholder-gray-400"
        />
        <button
          onClick={addNote}
          disabled={saving || !text.trim()}
          className="w-8 h-8 flex items-center justify-center bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg flex-shrink-0 transition-colors"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
        </button>
      </div>
    </div>
  )
}
