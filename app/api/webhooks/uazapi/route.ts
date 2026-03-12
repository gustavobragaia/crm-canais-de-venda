import { NextRequest, NextResponse } from 'next/server'
import { type UazapiWebhookPayload, type UazapiWebhookMessagePayload, type UazapiWebhookConnectionPayload, type UazapiWebhookHistoryPayload } from '@/lib/integrations/uazapi'
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
    console.log('[UAZAPI WEBHOOK] raw payload:', JSON.stringify(payload).slice(0, 800))
    console.log('[UAZAPI WEBHOOK] EventType:', payload.EventType, '| token:', payload.token?.slice(0, 8))

    if (payload.EventType === 'messages') {
      await processMessage(payload as UazapiWebhookMessagePayload, { isHistory: false })
    } else if (payload.EventType === 'history') {
      await processMessage(payload as UazapiWebhookHistoryPayload, { isHistory: true })
    } else if (payload.EventType === 'connection') {
      await handleConnection(payload as UazapiWebhookConnectionPayload)
    } else if (payload.EventType === 'messages_update') {
      await handleMessagesUpdate(payload)
    } else {
      console.log('[UAZAPI WEBHOOK] unhandled EventType:', payload.EventType)
    }

    return NextResponse.json({ status: 'EVENT_RECEIVED' })
  } catch (error) {
    console.error('[UAZAPI WEBHOOK] error:', error)
    return NextResponse.json({ status: 'ERROR' })
  }
}

function extractMediaType(messageType: string): string | null {
  const t = messageType.toLowerCase()
  if (t === 'image' || t.includes('image')) return 'image'
  if (t === 'video' || t.includes('video')) return 'video'
  if (t === 'document' || t.includes('document') || t.includes('pdf')) return 'document'
  if (t === 'audio' || t === 'ptt' || t === 'myaudio' || t.includes('audio') || t.includes('ptt') || t.includes('voice')) return 'audio'
  return null
}

async function processMessage(
  payload: UazapiWebhookMessagePayload | UazapiWebhookHistoryPayload,
  { isHistory }: { isHistory: boolean }
) {
  const msg = payload.message

  // Skip only API-sent messages (already saved when we sent them).
  // Phone messages (fromMe=true, wasSentByApi=false/undefined) are allowed through.
  // wasSentByApi=true messages are also excluded at webhook level via excludeMessages config.
  if (!isHistory && msg.fromMe && msg.wasSentByApi) return

  const direction = msg.fromMe ? 'OUTBOUND' : 'INBOUND'

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

  // Detect media
  const mediaType = extractMediaType(msg.messageType)
  const mediaUrl = msg.fileURL ?? msg.media?.url ?? undefined

  console.log(
    `[UAZAPI WEBHOOK] messageType="${msg.messageType}" → mediaType=${mediaType ?? 'text'} | fileURL=${!!msg.fileURL} | media.url=${!!msg.media?.url}`
  )
  const mediaMime = msg.media?.mimetype ?? undefined
  const mediaName = msg.media?.filename ?? undefined

  // Content: use caption or text for media messages; empty string if pure media with no caption
  const rawText = msg.text
    || (typeof msg.content === 'string' ? msg.content : '')
    || msg.media?.caption
    || ''
  const textContent = rawText === '[Media]' && mediaType ? '' : rawText

  // Deduplication
  if (msg.messageid) {
    const existing = await db.message.findFirst({ where: { externalId: msg.messageid } })
    if (existing) return
  }

  // sentAt from webhook timestamp — handle both seconds and milliseconds
  const sentAt = msg.messageTimestamp
    ? new Date(msg.messageTimestamp > 1e12 ? msg.messageTimestamp : msg.messageTimestamp * 1000)
    : new Date()

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
      direction,
      content: textContent,
      externalId: msg.messageid || undefined,
      status: direction === 'OUTBOUND' ? 'SENT' : 'DELIVERED',
      senderName: msg.senderName ?? null,
      sentAt,
      ...(mediaType ? { mediaType, mediaUrl, mediaMime, mediaName } : {}),
    },
  })

  const previewText = mediaType && !textContent
    ? `[${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)}]`
    : textContent

  await db.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: sentAt,
      lastMessagePreview: previewText.slice(0, 100),
      ...(direction === 'INBOUND' ? { unreadCount: { increment: 1 } } : {}),
    },
  })

  await pusherServer.trigger(
    `workspace-${channel.workspaceId}`,
    isHistory ? 'history-message' : 'new-message',
    { conversationId: conversation.id, message: savedMessage }
  )

  console.log(
    `[UAZAPI WEBHOOK] ${isHistory ? 'history' : 'message'} saved:`,
    savedMessage.id, '| conversation:', conversation.id,
    '| direction:', direction,
    '| mediaType:', mediaType ?? 'none'
  )

  // Only for real-time inbound messages (not history):
  if (!isHistory) {
    // Trigger media download/transcription asynchronously for audio (always) and
    // image/video/document when fileURL was not delivered in the webhook payload
    if (msg.messageid && channel.instanceToken && (
      mediaType === 'audio' ||
      ((mediaType === 'image' || mediaType === 'video' || mediaType === 'document') && !mediaUrl)
    )) {
      const baseUrl = (process.env.NEXTAUTH_URL ?? '').replace(/\/$/, '')
      fetch(`${baseUrl}/api/transcription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: savedMessage.id, externalId: msg.messageid, instanceToken: channel.instanceToken }),
      }).catch(err => console.error('[UAZAPI WEBHOOK] media download trigger error:', err))
    }

    // Trigger AI agent asynchronously — only for text/mixed-media inbound messages
    if (direction === 'INBOUND' && (!mediaType || textContent)) {
      processAiResponse(conversation.id, channel.workspaceId, textContent).catch(err =>
        console.error('[UAZAPI WEBHOOK] AI agent error:', err)
      )
    }
  }
}

async function handleMessagesUpdate(payload: UazapiWebhookPayload) {
  const msg = (payload as { message?: { messageid?: string; status?: string } }).message
  if (!msg?.messageid) return

  const message = await db.message.findFirst({ where: { externalId: msg.messageid } })
  if (!message) return

  const statusMap: Record<string, string> = {
    read: 'READ',
    delivered: 'DELIVERED',
    sent: 'SENT',
    failed: 'FAILED',
  }
  const newStatus = statusMap[msg.status?.toLowerCase() ?? ''] ?? null
  if (!newStatus || newStatus === message.status) return

  await db.message.update({
    where: { id: message.id },
    data: {
      status: newStatus as 'SENT' | 'DELIVERED' | 'READ' | 'FAILED',
      ...(newStatus === 'READ' ? { readAt: new Date() } : {}),
      ...(newStatus === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
    },
  })

  await pusherServer.trigger(
    `workspace-${message.workspaceId}`,
    'message-updated',
    { messageId: message.id, status: newStatus }
  )

  console.log('[UAZAPI WEBHOOK] message status updated:', message.id, '→', newStatus)
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
