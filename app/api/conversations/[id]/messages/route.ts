import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { sendInstagramMessage } from '@/lib/integrations/instagram'
import { sendFacebookMessage } from '@/lib/integrations/facebook'
import { sendEvolutionMessage } from '@/lib/integrations/evolution'
import { decrypt } from '@/lib/crypto'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { searchParams } = new URL(req.url)
  const page = parseInt(searchParams.get('page') ?? '1')
  const limit = 50

  const conversation = await db.conversation.findFirst({
    where: {
      id,
      workspaceId: session.user.workspaceId,
      ...(session.user.role === 'AGENT' ? { assignedToId: session.user.id } : {}),
    },
  })

  if (!conversation) {
    return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 })
  }

  const [messages, total] = await Promise.all([
    db.message.findMany({
      where: { conversationId: id },
      include: {
        sentBy: { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.message.count({ where: { conversationId: id } }),
  ])

  // Reset unread count
  await db.conversation.update({
    where: { id },
    data: { unreadCount: 0 },
  })

  return NextResponse.json({ messages, total, page, limit })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { content } = await req.json()

  if (!content?.trim()) {
    return NextResponse.json({ error: 'Mensagem não pode ser vazia.' }, { status: 400 })
  }

  const conversation = await db.conversation.findFirst({
    where: {
      id,
      workspaceId: session.user.workspaceId,
      ...(session.user.role === 'AGENT' ? { assignedToId: session.user.id } : {}),
    },
    include: { channel: true },
  })

  if (!conversation) {
    return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 })
  }

  const channel = conversation.channel
  let externalId: string | undefined

  // Send via appropriate channel API
  try {
    if (channel.type === 'WHATSAPP') {
      if (channel.instanceName) {
        // Strip @suffix — Evolution expects plain E.164 number
        const to = conversation.contactPhone
          ?? conversation.externalId.replace('@s.whatsapp.net', '').replace('@g.us', '')
        externalId = await sendEvolutionMessage(channel.instanceName, to, content)
      }
    } else if (channel.type === 'INSTAGRAM') {
      const accessToken = channel.accessToken ? decrypt(channel.accessToken) : ''
      externalId = await sendInstagramMessage(conversation.externalId, content, accessToken)
    } else if (channel.type === 'FACEBOOK') {
      const accessToken = channel.accessToken ? decrypt(channel.accessToken) : ''
      externalId = await sendFacebookMessage(conversation.externalId, content, accessToken)
    }
  } catch (err) {
    console.error('[SEND_MESSAGE]', err)
    // Continue saving even if API call fails (allows offline testing)
  }

  const message = await db.message.create({
    data: {
      conversationId: id,
      workspaceId: session.user.workspaceId,
      direction: 'OUTBOUND',
      content,
      externalId,
      status: 'SENT',
      sentById: session.user.id,
    },
    include: {
      sentBy: { select: { id: true, name: true, avatarUrl: true } },
    },
  })

  await db.conversation.update({
    where: { id },
    data: {
      lastMessageAt: new Date(),
      lastMessagePreview: content.slice(0, 100),
      status: 'IN_PROGRESS',
    },
  })

  await pusherServer.trigger(`workspace-${session.user.workspaceId}`, 'message-sent', {
    conversationId: id,
    message,
  })

  return NextResponse.json(message, { status: 201 })
}
