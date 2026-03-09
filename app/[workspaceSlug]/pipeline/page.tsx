'use client'

import { useState, useEffect } from 'react'
import { GripVertical, Plus } from 'lucide-react'
import { LeadDrawer } from '@/components/LeadDrawer'

interface Stage {
  id: string
  name: string
  color: string
  position: number
  isFinal: boolean
}

interface Conversation {
  id: string
  contactName: string
  lastMessagePreview: string | null
  pipelineStage: string | null
  channel: { type: string }
  assignedTo: { name: string } | null
}

const CHANNEL_COLORS: Record<string, string> = {
  WHATSAPP: '#25D366',
  INSTAGRAM: '#E4405F',
  FACEBOOK: '#1877F2',
}

export default function PipelinePage() {
  const [stages, setStages] = useState<Stage[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/pipeline/stages').then((r) => r.json()),
      fetch('/api/conversations?limit=100').then((r) => r.json()),
    ]).then(([stagesData, convsData]) => {
      setStages(stagesData.stages ?? [])
      setConversations(convsData.conversations ?? [])
      setLoading(false)
    })
  }, [])

  function getConversationsForStage(stageName: string) {
    return conversations.filter((c) => c.pipelineStage === stageName)
  }

  async function moveToStage(conversationId: string, stageName: string) {
    await fetch(`/api/conversations/${conversationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pipelineStage: stageName }),
    })
    setConversations((cs) =>
      cs.map((c) => (c.id === conversationId ? { ...c, pipelineStage: stageName } : c))
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        Carregando pipeline...
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col">
      <div className="h-16 px-6 border-b border-gray-200 bg-white flex items-center justify-between">
        <h1 className="font-semibold text-gray-900">Pipeline</h1>
        <button className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700">
          <Plus size={16} />
          Nova etapa
        </button>
      </div>

      <div className="flex-1 overflow-x-auto p-6">
        <div className="flex gap-4 h-full min-w-max">
          {stages.map((stage) => {
            const stageConvs = getConversationsForStage(stage.name)
            return (
              <div
                key={stage.id}
                className="w-64 flex flex-col"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  if (draggedId) moveToStage(draggedId, stage.name)
                  setDraggedId(null)
                }}
              >
                {/* Stage Header */}
                <div
                  className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg"
                  style={{ backgroundColor: `${stage.color}15` }}
                >
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: stage.color }}
                  />
                  <span className="font-medium text-gray-900 text-sm flex-1">{stage.name}</span>
                  <span className="text-xs text-gray-500 bg-white px-1.5 py-0.5 rounded-full">
                    {stageConvs.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex-1 space-y-2 overflow-y-auto">
                  {stageConvs.map((conv) => (
                    <div
                      key={conv.id}
                      draggable
                      onDragStart={() => setDraggedId(conv.id)}
                      onClick={() => setSelectedId(conv.id)}
                      className="bg-white border border-gray-200 rounded-xl p-3 cursor-pointer hover:shadow-sm transition-shadow"
                    >
                      <div className="flex items-start gap-2 mb-2">
                        <GripVertical
                          size={14}
                          className="text-gray-300 mt-0.5 flex-shrink-0 cursor-grab active:cursor-grabbing"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 text-sm truncate">
                            {conv.contactName}
                          </p>
                          {conv.lastMessagePreview && (
                            <p className="text-xs text-gray-500 truncate mt-0.5">
                              {conv.lastMessagePreview}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: CHANNEL_COLORS[conv.channel.type] ?? '#9CA3AF' }}
                          title={conv.channel.type}
                        />
                        {conv.assignedTo && (
                          <span className="text-xs text-gray-400">{conv.assignedTo.name}</span>
                        )}
                      </div>
                    </div>
                  ))}

                  {stageConvs.length === 0 && (
                    <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center text-gray-400 text-xs">
                      Arraste conversas aqui
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <LeadDrawer conversationId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  )
}
