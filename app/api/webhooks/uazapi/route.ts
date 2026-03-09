import { NextRequest, NextResponse } from 'next/server'
import { type UazapiWebhookPayload, type UazapiWebhookMessagePayload, type UazapiWebhookConnectionPayload } from '@/lib/integrations/uazapi'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()
    console.log('[UAZAPI WEBHOOK] raw body:', body.slice(0, 500))
    const payload = JSON.parse(body) as UazapiWebhookPayload
    console.log('[UAZAPI WEBHOOK] event:', payload.event, '| instance:', payload.instance)

    if (payload.event === 'message') {
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

async function handleMessage(payload: UazapiWebhookMessagePayload) {
  const { instance: instanceId, data: msg } = payload

  // Skip outgoing messages
  if (msg.fromMe) return

  const channel = await db.channel.findFirst({
    where: { instanceName: instanceId, provider: 'UAZAPI', type: 'WHATSAPP' },
  })
  if (!channel) return

  const chatid = msg.chatid
  const isGroup = chatid.endsWith('@g.us')
  const contactPhone = isGroup ? undefined : chatid.replace('@s.whatsapp.net', '').replace('@lid', '')
  const contactName = msg.senderName ?? contactPhone ?? chatid.split('@')[0]

  const textContent = msg.text || '[Media]'

  // Deduplication
  const existing = await db.message.findFirst({ where: { externalId: msg.messageid } })
  if (existing) return

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
      externalId: msg.messageid,
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
