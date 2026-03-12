import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'

type RouteParams = { params: Promise<{ id: string }> }

async function getConversation(id: string, workspaceId: string) {
  return db.conversation.findFirst({
    where: { id, workspaceId },
  })
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: conversationId } = await params

    const conversation = await getConversation(conversationId, session.user.workspaceId)
    if (!conversation) {
      return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 })
    }

    const conversationTags = await db.conversationTag.findMany({
      where: { conversationId },
      include: { tag: true },
    })

    return NextResponse.json(conversationTags)
  } catch (err) {
    console.error('[GET /api/conversations/[id]/tags]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: conversationId } = await params
    const body = await req.json()
    const { tagIds } = body as { tagIds?: string[] }

    if (!Array.isArray(tagIds)) {
      return NextResponse.json({ error: 'tagIds deve ser um array.' }, { status: 400 })
    }

    const conversation = await getConversation(conversationId, session.user.workspaceId)
    if (!conversation) {
      return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 })
    }

    await db.$transaction([
      db.conversationTag.deleteMany({ where: { conversationId } }),
      ...(tagIds.length > 0
        ? [
            db.conversationTag.createMany({
              data: tagIds.map((tagId) => ({ conversationId, tagId })),
            }),
          ]
        : []),
    ])

    const updatedTags = await db.conversationTag.findMany({
      where: { conversationId },
      include: { tag: true },
    })

    pusherServer.trigger(`workspace-${session.user.workspaceId}`, 'conversation-updated', {
      conversationId,
      tags: updatedTags,
    })

    return NextResponse.json(updatedTags)
  } catch (err) {
    console.error('[PUT /api/conversations/[id]/tags]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: conversationId } = await params
    const body = await req.json()
    const { tagId } = body as { tagId?: string }

    if (!tagId) {
      return NextResponse.json({ error: 'tagId é obrigatório.' }, { status: 400 })
    }

    const conversation = await getConversation(conversationId, session.user.workspaceId)
    if (!conversation) {
      return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 })
    }

    await db.conversationTag.createMany({
      data: [{ conversationId, tagId }],
      skipDuplicates: true,
    })

    const updatedTags = await db.conversationTag.findMany({
      where: { conversationId },
      include: { tag: true },
    })

    pusherServer.trigger(`workspace-${session.user.workspaceId}`, 'conversation-updated', {
      conversationId,
      tags: updatedTags,
    })

    return NextResponse.json(updatedTags, { status: 201 })
  } catch (err) {
    console.error('[POST /api/conversations/[id]/tags]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: conversationId } = await params
    const body = await req.json()
    const { tagId } = body as { tagId?: string }

    if (!tagId) {
      return NextResponse.json({ error: 'tagId é obrigatório.' }, { status: 400 })
    }

    const conversation = await getConversation(conversationId, session.user.workspaceId)
    if (!conversation) {
      return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 })
    }

    await db.conversationTag.delete({
      where: { conversationId_tagId: { conversationId, tagId } },
    })

    const updatedTags = await db.conversationTag.findMany({
      where: { conversationId },
      include: { tag: true },
    })

    pusherServer.trigger(`workspace-${session.user.workspaceId}`, 'conversation-updated', {
      conversationId,
      tags: updatedTags,
    })

    return NextResponse.json(updatedTags)
  } catch (err) {
    console.error('[DELETE /api/conversations/[id]/tags]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
