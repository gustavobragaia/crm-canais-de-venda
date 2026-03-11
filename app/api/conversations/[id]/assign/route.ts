import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Apenas admins podem atribuir conversas.' }, { status: 403 })
  }

  const { id } = await params
  const { userId } = await req.json()

  const conversation = await db.conversation.findFirst({
    where: { id, workspaceId: session.user.workspaceId },
  })

  if (!conversation) {
    return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 })
  }

  const assignedUser = userId
    ? await db.user.findFirst({
        where: { id: userId, workspaceId: session.user.workspaceId },
        select: { id: true, name: true, avatarUrl: true },
      })
    : null

  const updated = await db.conversation.update({
    where: { id },
    data: {
      assignedToId: userId || null,
      assignedById: session.user.id,
      assignedAt: userId ? new Date() : null,
      status: userId ? 'IN_PROGRESS' : 'UNASSIGNED',
      pipelineStage: userId ? 'Em Atendimento' : 'Não Atribuído',
    },
  })

  // System message for assignment
  const systemContent = assignedUser
    ? `${assignedUser.name} assumiu a conversa`
    : 'Conversa desatribuída'

  const systemMessage = await db.message.create({
    data: {
      conversationId: id,
      workspaceId: session.user.workspaceId,
      direction: 'INBOUND',
      content: systemContent,
      isSystem: true,
      status: 'DELIVERED',
    },
  })

  await pusherServer.trigger(`workspace-${session.user.workspaceId}`, 'conversation-assigned', {
    conversationId: id,
    assignedTo: assignedUser,
  })

  await pusherServer.trigger(`workspace-${session.user.workspaceId}`, 'new-message', {
    conversationId: id,
    message: systemMessage,
  })

  return NextResponse.json(updated)
}
