import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const conversation = await db.conversation.findFirst({
    where: {
      id,
      workspaceId: session.user.workspaceId,
      ...(session.user.role === 'AGENT' ? { assignedToId: session.user.id } : {}),
    },
    include: {
      channel: true,
      assignedTo: { select: { id: true, name: true, avatarUrl: true } },
      lead: true,
    },
  })

  if (!conversation) {
    return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 })
  }

  return NextResponse.json(conversation)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { status, pipelineStage, tags, internalNotes, aiEnabled, assignedToId, assignedById } = body

  const conversation = await db.conversation.findFirst({
    where: { id, workspaceId: session.user.workspaceId },
  })

  if (!conversation) {
    return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 })
  }

  // Build update data with smart auto-sync
  const updateData: Record<string, unknown> = {}

  if (tags) updateData.tags = tags
  if (internalNotes !== undefined) updateData.internalNotes = internalNotes
  if (aiEnabled !== undefined) updateData.aiEnabled = aiEnabled

  // Handle assignedToId changes
  if (assignedToId !== undefined) {
    if (assignedToId !== null) {
      // Assigning to an agent
      updateData.assignedToId = assignedToId
      updateData.assignedAt = new Date()
      updateData.assignedById = assignedById ?? null
      // Auto-set status and stage unless explicitly overridden
      if (status === undefined) updateData.status = 'IN_PROGRESS'
      if (pipelineStage === undefined) updateData.pipelineStage = 'Em Atendimento'
    } else {
      // Unassigning
      updateData.assignedToId = null
      updateData.assignedAt = null
      updateData.assignedById = null
      if (status === undefined) updateData.status = 'UNASSIGNED'
      if (pipelineStage === undefined) updateData.pipelineStage = 'Não Atribuído'
    }
  }

  // Handle explicit status changes with auto pipeline sync
  if (status) {
    updateData.status = status
    if (pipelineStage === undefined) {
      if (status === 'WAITING_CLIENT' && updateData.pipelineStage === undefined) {
        updateData.pipelineStage = 'Aguardando'
      } else if (status === 'UNASSIGNED' && updateData.pipelineStage === undefined) {
        updateData.pipelineStage = 'Não Atribuído'
      }
    }
  }

  // Explicit pipelineStage always wins
  if (pipelineStage !== undefined) updateData.pipelineStage = pipelineStage

  const updated = await db.conversation.update({
    where: { id },
    data: updateData,
  })

  return NextResponse.json(updated)
}
