import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { findUazapiMessages } from '@/lib/integrations/uazapi'

function extractMediaType(messageType: string): string | null {
  switch (messageType) {
    case 'image': return 'image'
    case 'audio':
    case 'ptt': return 'audio'
    case 'document': return 'document'
    case 'video': return 'video'
    default: return null
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { conversationId } = await req.json() as { conversationId?: string }
  if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })

  const conversation = await db.conversation.findFirst({
    where: { id: conversationId, workspaceId: session.user.workspaceId },
    include: { channel: true },
  })

  if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const channel = conversation.channel
  if (!channel || channel.provider !== 'UAZAPI' || !channel.instanceToken) {
    return NextResponse.json({ synced: 0 })
  }

  let messages: Awaited<ReturnType<typeof findUazapiMessages>>
  try {
    messages = await findUazapiMessages(channel.instanceToken, conversation.externalId, 50)
  } catch (err) {
    console.error('[UAZAPI SYNC] findUazapiMessages error:', err)
    return NextResponse.json({ synced: 0 })
  }

  let synced = 0

  for (const msg of messages) {
    // Skip messages sent via API — already in DB from when we sent them
    if (msg.wasSentByApi) continue
    // Skip messages without a stable ID (can't dedup)
    if (!msg.messageid) continue

    const existing = await db.message.findFirst({ where: { externalId: msg.messageid } })
    if (existing) continue

    const direction = msg.fromMe ? 'OUTBOUND' : 'INBOUND'
    const mediaType = extractMediaType(msg.messageType)
    const textContent = typeof msg.text === 'string' ? msg.text : ''
    // /message/find uses fileURL (not media.url like the webhook)
    const mediaUrl = msg.fileURL ?? undefined

    // messageTimestamp from /message/find is in milliseconds per the spec
    const sentAt = msg.messageTimestamp
      ? new Date(msg.messageTimestamp > 1e12 ? msg.messageTimestamp : msg.messageTimestamp * 1000)
      : new Date()

    await db.message.create({
      data: {
        conversationId: conversation.id,
        workspaceId: channel.workspaceId,
        direction,
        content: textContent,
        externalId: msg.messageid,
        status: direction === 'OUTBOUND' ? 'SENT' : 'DELIVERED',
        senderName: msg.senderName ?? null,
        sentAt,
        ...(mediaType ? { mediaType, mediaUrl } : {}),
      },
    })

    synced++
  }

  if (synced > 0) {
    console.log(`[UAZAPI SYNC] synced ${synced} messages for conversation ${conversationId}`)
  }

  return NextResponse.json({ synced })
}
