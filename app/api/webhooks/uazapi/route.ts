import { NextRequest, NextResponse } from 'next/server'
import { type UazapiWebhookPayload, type UazapiWebhookMessagePayload, type UazapiWebhookConnectionPayload } from '@/lib/integrations/uazapi'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { processAiResponse } from '@/lib/ai/agent'

export async function GET() {
  return NextResponse.json({ status: 'OK' })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()
    const payload = JSON.parse(body) as UazapiWebhookPayload
    console.log('[UAZAPI WEBHOOK] EventType:', payload.EventType, '| token:', payload.token?.slice(0, 8))

    if (payload.EventType === 'messages') {
      await handleMessage(payload as UazapiWebhookMessagePayload)
    } else if (payload.EventType === 'connection') {
      await handleConnection(payload as UazapiWebhookConnectionPayload)
    } else {
      console.log('[UAZAPI WEBHOOK] unhandled EventType:', payload.EventType)
    }

    return NextResponse.json({ status: 'EVENT_RECEIVED' })
  } catch (error) {
    console.error('[UAZAPI WEBHOOK] error:', error)
    return NextResponse.json({ status: 'ERROR' })
  }
}

async function handleMessage(payload: UazapiWebhookMessagePayload) {
  const msg = payload.message

  // Skip outgoing messages
  if (msg.fromMe) return

  // Look up channel by instanceToken (most reliable identifier)
  const channel = await db.channel.findFirst({
    where: { instanceToken: payload.token, provider: 'UAZAPI', type: 'WHATSAPP' },
  })
  if (!channel) {
    console.log('[UAZAPI WEBHOOK] no channel found for token:', payload.token?.slice(0, 8))
    return
  }

  const chatid = msg.chatid
  const isGroup = chatid.endsWith('@g.us')
  const chat = payload.chat ?? {}

  // Phone: prefer formatted from chat object, fallback to chatid
  const contactPhone = isGroup ? undefined
    : chat.phone
      ? chat.phone.replace(/\D/g, '')
      : chatid.replace('@s.whatsapp.net', '').replace('@lid', '')

  // Name: saved contact name > WA display name > senderName
  const contactName = chat.wa_contactName || chat.wa_name || chat.name || msg.senderName || contactPhone || chatid.split('@')[0]

  // Profile photo from chat object
  const contactPhotoUrl = chat.imagePreview || chat.image || undefined

  const textContent = msg.text || msg.content || '[Media]'

  // Deduplication
  if (msg.messageid) {
    const existing = await db.message.findFirst({ where: { externalId: msg.messageid } })
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
      contactPhotoUrl,
      status: 'UNASSIGNED',
    },
    update: { contactName, contactPhotoUrl },
  })

  const savedMessage = await db.message.create({
    data: {
      conversationId: conversation.id,
      workspaceId: channel.workspaceId,
      direction: 'INBOUND',
      content: textContent,
      externalId: msg.messageid || undefined,
      status: 'DELIVERED',
      senderName: msg.senderName ?? null,
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

  console.log('[UAZAPI WEBHOOK] message saved:', savedMessage.id, '| conversation:', conversation.id)

  // Trigger AI agent asynchronously (non-blocking)
  processAiResponse(conversation.id, channel.workspaceId, textContent).catch(err =>
    console.error('[UAZAPI WEBHOOK] AI agent error:', err)
  )
}

async function handleConnection(payload: UazapiWebhookConnectionPayload) {
  const channel = await db.channel.findFirst({
    where: { instanceToken: payload.token, provider: 'UAZAPI' },
  })
  if (!channel) return

  const status = payload.data?.status
  if (status === 'connected') {
    await db.channel.update({
      where: { id: channel.id },
      data: { isActive: true, webhookVerifiedAt: new Date() },
    })
  } else if (status === 'disconnected') {
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
