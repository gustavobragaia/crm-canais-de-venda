import { NextRequest, NextResponse } from 'next/server'
import { type UazapiWebhookPayload, type UazapiWebhookMessagePayload, type UazapiWebhookConnectionPayload } from '@/lib/integrations/uazapi'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'

export async function GET() {
  return NextResponse.json({ status: 'OK' })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()
    console.log('[UAZAPI WEBHOOK] raw body:', body.slice(0, 2000))
    const payload = JSON.parse(body) as UazapiWebhookPayload
    console.log('[UAZAPI WEBHOOK] parsed:', JSON.stringify(payload))
    console.log('[UAZAPI WEBHOOK] event:', payload.event, '| instance:', payload.instance)

    if (payload.event === 'message' || payload.event === 'messages') {
      await handleMessage(payload as UazapiWebhookMessagePayload)
    } else if (payload.event === 'connection') {
      await handleConnection(payload as UazapiWebhookConnectionPayload)
    } else {
      console.log('[UAZAPI WEBHOOK] unhandled event dropped:', payload.event)
    }

    return NextResponse.json({ status: 'EVENT_RECEIVED' })
  } catch (error) {
    console.error('[UAZAPI WEBHOOK] error:', error)
    // Always return 200 — UazAPI will retry on non-200
    return NextResponse.json({ status: 'ERROR' })
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleMessage(payload: UazapiWebhookMessagePayload) {
  const { instance: instanceId, data: msg } = payload

  // Skip outgoing messages
  if (msg.fromMe) return

  console.log('[UAZAPI WEBHOOK] handleMessage data:', JSON.stringify(msg))

  const channel = await db.channel.findFirst({
    where: { instanceName: instanceId, provider: 'UAZAPI', type: 'WHATSAPP' },
  })
  if (!channel) {
    console.log('[UAZAPI WEBHOOK] no channel found for instance:', instanceId)
    return
  }

  // Accept field name variations between UazAPI versions
  const rawMsg = msg as Record<string, unknown>
  const chatid = (rawMsg.chatid ?? rawMsg.from ?? rawMsg.chatId ?? '') as string
  const messageId = (rawMsg.messageid ?? rawMsg.id ?? rawMsg.messageId ?? '') as string
  const textContent = ((rawMsg.text ?? rawMsg.message ?? rawMsg.body ?? '[Media]') as string) || '[Media]'
  const senderName = (rawMsg.senderName ?? rawMsg.pushName ?? rawMsg.name ?? undefined) as string | undefined

  if (!chatid) {
    console.log('[UAZAPI WEBHOOK] chatid missing, dropping message')
    return
  }

  const isGroup = chatid.endsWith('@g.us')
  const contactPhone = isGroup ? undefined : chatid.replace('@s.whatsapp.net', '').replace('@lid', '')
  const contactName = senderName ?? contactPhone ?? chatid.split('@')[0]

  // Deduplication
  if (messageId) {
    const existing = await db.message.findFirst({ where: { externalId: messageId } })
    if (existing) return
  }

  const conversation = await db.conversation.upsert({
    where: {
      workspaceId_channelId_externalId: {
        workspaceId: channel.workspaceId,
        channelId: channel.id,
        externalId: chatid,
      },
    },
    create: {
      workspaceId: channel.workspaceId,
      channelId: channel.id,
      externalId: chatid,
      contactName,
      contactPhone,
      status: 'UNASSIGNED',
    },
    update: { contactName },
  })

  const savedMessage = await db.message.create({
    data: {
      conversationId: conversation.id,
      workspaceId: channel.workspaceId,
      direction: 'INBOUND',
      content: textContent,
      externalId: messageId || undefined,
      status: 'DELIVERED',
    },
  })

  await db.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: new Date(),
      lastMessagePreview: textContent.slice(0, 100),
      unreadCount: { increment: 1 },
    },
  })

  await pusherServer.trigger(
    `workspace-${channel.workspaceId}`,
    'new-message',
    { conversationId: conversation.id, message: savedMessage }
  )
}

async function handleConnection(payload: UazapiWebhookConnectionPayload) {
  const { instance: instanceId, data } = payload

  const channel = await db.channel.findFirst({
    where: { instanceName: instanceId, provider: 'UAZAPI' },
  })
  if (!channel) return

  if (data.status === 'connected') {
    await db.channel.update({
      where: { id: channel.id },
      data: { isActive: true, webhookVerifiedAt: new Date() },
    })
  } else if (data.status === 'disconnected') {
    await db.channel.update({
      where: { id: channel.id },
      data: { isActive: false },
    })
    await pusherServer.trigger(
      `workspace-${channel.workspaceId}`,
      'channel-status-update',
      { channelId: channel.id, provider: 'UAZAPI', state: 'disconnected' }
    )
  }
}
