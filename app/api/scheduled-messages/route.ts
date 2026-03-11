import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const conversationId = req.nextUrl.searchParams.get('conversationId')

  const scheduled = await db.scheduledMessage.findMany({
    where: {
      workspaceId: session.user.workspaceId,
      ...(conversationId ? { conversationId } : {}),
      status: 'PENDING',
    },
    orderBy: { scheduledAt: 'asc' },
  })

  return NextResponse.json(scheduled)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { conversationId, content, scheduledAt } = await req.json()
  if (!conversationId || !content?.trim() || !scheduledAt) {
    return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 })
  }

  const conversation = await db.conversation.findFirst({
    where: { id: conversationId, workspaceId: session.user.workspaceId },
  })
  if (!conversation) return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 })

  const scheduled = await db.scheduledMessage.create({
    data: {
      conversationId,
      workspaceId: session.user.workspaceId,
      content: content.trim(),
      scheduledAt: new Date(scheduledAt),
    },
  })

  return NextResponse.json(scheduled, { status: 201 })
}
