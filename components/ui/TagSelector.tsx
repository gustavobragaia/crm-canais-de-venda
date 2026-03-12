'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Plus, Loader2 } from 'lucide-react'

interface Tag {
  id: string
  name: string
  color: string
}

interface TagSelectorProps {
  conversationId: string
  initialTags?: Tag[]
  onChange?: (tags: Tag[]) => void
}

export function TagSelector({ conversationId, initialTags = [], onChange }: TagSelectorProps) {
  const [selected, setSelected] = useState<Tag[]>(initialTags)
  const [search, setSearch] = useState('')
  const [options, setOptions] = useState<Tag[]>([])
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Sync initialTags when parent updates
  useEffect(() => {
    setSelected(initialTags)
  }, [initialTags.map(t => t.id).join(',')])

  // Fetch workspace tags on search change
  useEffect(() => {
    if (!open) return
    const ctrl = new AbortController()
    fetch(`/api/tags?search=${encodeURIComponent(search)}`, { signal: ctrl.signal })
      .then(r => r.json())
      .then((data: Tag[] | { tags: Tag[] }) => setOptions(Array.isArray(data) ? data : (data.tags ?? [])))
      .catch(() => {})
    return () => ctrl.abort()
  }, [search, open])

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  async function persist(tags: Tag[]) {
    setSaving(true)
    try {
      await fetch(`/api/conversations/${conversationId}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagIds: tags.map(t => t.id) }),
      })
      onChange?.(tags)
    } finally {
      setSaving(false)
    }
  }

  async function addTag(tag: Tag) {
    if (selected.find(t => t.id === tag.id)) return
    const next = [...selected, tag]
    setSelected(next)
    setSearch('')
    inputRef.current?.focus()
    await persist(next)
  }

  async function removeTag(tagId: string) {
    const next = selected.filter(t => t.id !== tagId)
    setSelected(next)
    await persist(next)
  }

  async function createTag() {
    const name = search.trim()
    if (!name) return
    setSaving(true)
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (res.ok) {
        const tag = await res.json() as Tag
        await addTag(tag)
      }
    } finally {
      setSaving(false)
    }
  }

  const filtered = options.filter(o => !selected.find(s => s.id === o.id))
  const exactMatch = options.find(o => o.name.toLowerCase() === search.trim().toLowerCase())

  return (
    <div ref={containerRef} className="relative">
      {/* Selected chips */}
      <div
        className="flex flex-wrap gap-1 min-h-[34px] px-2 py-1.5 border border-gray-200 rounded-lg bg-white cursor-text"
        onClick={() => { setOpen(true); inputRef.current?.focus() }}
      >
        {selected.map(tag => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full text-white"
            style={{ backgroundColor: tag.color }}
          >
            {tag.name}
            <button
              type="button"
              onClick={e => { e.stopPropagation(); void removeTag(tag.id) }}
              className="opacity-70 hover:opacity-100 transition-opacity"
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); void createTag() }
            if (e.key === 'Escape') { setOpen(false); setSearch('') }
          }}
          placeholder={selected.length === 0 ? 'Adicionar tag...' : ''}
          className="flex-1 min-w-[80px] text-xs outline-none bg-transparent text-gray-700 placeholder-gray-400"
        />
        {saving && <Loader2 size={12} className="animate-spin text-gray-400 self-center" />}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          <div className="max-h-44 overflow-y-auto">
            {filtered.length === 0 && !search && (
              <p className="text-xs text-gray-400 px-3 py-2.5">Nenhuma tag disponível</p>
            )}
            {filtered.map(tag => (
              <button
                key={tag.id}
                type="button"
                onMouseDown={e => { e.preventDefault(); void addTag(tag) }}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 transition-colors text-left"
              >
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                <span className="text-xs text-gray-700">{tag.name}</span>
              </button>
            ))}
          </div>
          {search.trim() && !exactMatch && (
            <button
              type="button"
              onMouseDown={e => { e.preventDefault(); void createTag() }}
              className="w-full flex items-center gap-2 px-3 py-2 border-t border-gray-100 hover:bg-gray-50 transition-colors text-left"
            >
              <Plus size={12} className="text-gray-400" />
              <span className="text-xs text-gray-600">Criar <strong className="text-gray-900">"{search.trim()}"</strong></span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
