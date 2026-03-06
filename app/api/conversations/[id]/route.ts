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
  const { status, pipelineStage, tags, internalNotes } = body

  const conversation = await db.conversation.findFirst({
    where: { id, workspaceId: session.user.workspaceId },
  })

  if (!conversation) {
    return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 })
  }

  const updated = await db.conversation.update({
    where: { id },
    data: {
      ...(status && { status }),
      ...(pipelineStage !== undefined && { pipelineStage }),
      ...(tags && { tags }),
      ...(internalNotes !== undefined && { internalNotes }),
    },
  })

  return NextResponse.json(updated)
}
