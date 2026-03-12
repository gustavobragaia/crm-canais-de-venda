import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { sendInstagramMessage } from '@/lib/integrations/instagram'
import { sendFacebookMessage } from '@/lib/integrations/facebook'
import { sendUazapiMessage, sendUazapiMedia } from '@/lib/integrations/uazapi'
import { decrypt } from '@/lib/crypto'
import { put } from '@vercel/blob'

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
    include: { channel: { select: { provider: true } } },
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

  // Fire-and-forget sync for UAZAPI channels (catches messages sent from phone)
  if (conversation.channel?.provider === 'UAZAPI') {
    const baseUrl = (process.env.NEXTAUTH_URL ?? '').replace(/\/$/, '')
    fetch(`${baseUrl}/api/uazapi/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: req.headers.get('cookie') ?? '' },
      body: JSON.stringify({ conversationId: id }),
    }).catch(() => {})
  }

  return NextResponse.json({ messages, total, page, limit })
}

function detectMediaType(mime: string): 'audio' | 'image' | 'video' | 'document' {
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  return 'document'
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Parse request — supports both JSON (text) and multipart/form-data (media)
  const contentType = req.headers.get('content-type') ?? ''
  let content = ''
  let file: File | null = null

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData()
    content = (form.get('content') as string | null) ?? ''
    file = form.get('file') as File | null
    if (!file && !content.trim()) {
      return NextResponse.json({ error: 'Arquivo ou mensagem é obrigatório.' }, { status: 400 })
    }
  } else {
    const body = await req.json() as { content?: string }
    content = body.content ?? ''
    if (!content.trim()) {
      return NextResponse.json({ error: 'Mensagem não pode ser vazia.' }, { status: 400 })
    }
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
  let mediaUrl: string | undefined
  let mediaType: string | undefined
  let mediaMime: string | undefined
  let mediaName: string | undefined
  let sendError: string | undefined

  // Handle file upload and sending
  if (file) {
    mediaMime = file.type
    mediaName = file.name
    mediaType = detectMediaType(file.type)

    // Upload to Vercel Blob for a public URL
    const blob = await put(`media/${Date.now()}-${file.name}`, file, { access: 'public' })
    mediaUrl = blob.url

    // Send via channel API
    try {
      if (channel?.type === 'WHATSAPP' && channel.provider === 'UAZAPI' && channel.instanceToken) {
        const to = conversation.contactPhone
          ?? conversation.externalId.replace('@s.whatsapp.net', '').replace('@g.us', '')
        externalId = await sendUazapiMedia(channel.instanceToken, to, mediaType as 'audio' | 'image' | 'video' | 'document', mediaUrl, content || undefined, mediaName)
      }
    } catch (err) {
      sendError = err instanceof Error ? err.message : String(err)
      console.error('[SEND_MEDIA]', sendError)
    }
  } else {
    // Text-only send
    try {
      if (channel && channel.type === 'WHATSAPP') {
        if (channel.provider === 'UAZAPI' && channel.instanceToken) {
          const to = conversation.contactPhone
            ?? conversation.externalId.replace('@s.whatsapp.net', '').replace('@g.us', '')
          externalId = await sendUazapiMessage(channel.instanceToken, to, content)
        }
      } else if (channel && channel.type === 'INSTAGRAM') {
        const accessToken = channel.accessToken ? decrypt(channel.accessToken) : ''
        externalId = await sendInstagramMessage(conversation.externalId, content, accessToken)
      } else if (channel && channel.type === 'FACEBOOK') {
        const accessToken = channel.accessToken ? decrypt(channel.accessToken) : ''
        externalId = await sendFacebookMessage(conversation.externalId, content, accessToken)
      }
    } catch (err) {
      console.error('[SEND_MESSAGE]', err)
    }
  }

  const previewText = mediaType
    ? (content || `[${mediaType === 'audio' ? 'Áudio' : mediaType === 'image' ? 'Imagem' : mediaType === 'video' ? 'Vídeo' : 'Arquivo'}]`)
    : content

  const message = await db.message.create({
    data: {
      conversationId: id,
      workspaceId: session.user.workspaceId,
      direction: 'OUTBOUND',
      content: content || '',
      externalId,
      status: 'SENT',
      sentById: session.user.id,
      ...(mediaType ? { mediaType, mediaUrl, mediaMime, mediaName } : {}),
    },
    include: {
      sentBy: { select: { id: true, name: true, avatarUrl: true } },
    },
  })

  await db.conversation.update({
    where: { id },
    data: {
      lastMessageAt: new Date(),
      lastMessagePreview: previewText.slice(0, 100),
      status: 'IN_PROGRESS',
    },
  })

  pusherServer.trigger(`workspace-${session.user.workspaceId}`, 'message-sent', {
    conversationId: id,
    message,
  }).catch(err => console.error('[SEND_MESSAGE] pusher error:', err))

  return NextResponse.json({ ...message, sendError }, { status: 201 })
}
