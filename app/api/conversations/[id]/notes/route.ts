import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'

type RouteParams = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: conversationId } = await params

    const conversation = await db.conversation.findFirst({
      where: { id: conversationId, workspaceId: session.user.workspaceId },
    })

    if (!conversation) {
      return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 })
    }

    const notes = await db.note.findMany({
      where: { conversationId },
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json(notes)
  } catch (err) {
    console.error('[GET /api/conversations/[id]/notes]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: conversationId } = await params
    const body = await req.json()
    const { content } = body as { content?: string }

    if (!content?.trim()) {
      return NextResponse.json({ error: 'Conteúdo da nota não pode ser vazio.' }, { status: 400 })
    }

    const conversation = await db.conversation.findFirst({
      where: { id: conversationId, workspaceId: session.user.workspaceId },
    })

    if (!conversation) {
      return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 })
    }

    const note = await db.note.create({
      data: {
        content: content.trim(),
        conversationId,
        userId: session.user.id,
        workspaceId: session.user.workspaceId,
      },
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
      },
    })

    pusherServer.trigger(`conversation-${conversationId}`, 'note-added', { conversationId, note })
      .catch(err => console.error('[notes] pusher error:', err))

    return NextResponse.json(note, { status: 201 })
  } catch (err) {
    console.error('[POST /api/conversations/[id]/notes]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
