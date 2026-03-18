import { NextRequest, NextResponse } from 'next/server'
import { type UazapiWebhookPayload, type UazapiWebhookMessagePayload, type UazapiWebhookConnectionPayload, type UazapiWebhookHistoryPayload, downloadUazapiMedia } from '@/lib/integrations/uazapi'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { canCreateConversation, incrementConversationCount } from '@/lib/billing/conversationGate'

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

  const allowed = await canCreateConversation(channel.workspaceId, channel.id, chatid)
  if (!allowed) {
    console.log('[UAZAPI WEBHOOK] conversation limit reached for workspace:', channel.workspaceId)
    return
  }

  const existingConv = await db.conversation.findUnique({
    where: { workspaceId_channelId_externalId: { workspaceId: channel.workspaceId, channelId: channel.id, externalId: chatid } },
    select: { id: true },
  })

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

  if (!existingConv) {
    await incrementConversationCount(channel.workspaceId)
  }

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
    // Audio: via /api/transcription (needs MP3 generation + optional OpenAI transcription)
    if (mediaType === 'audio' && msg.messageid && channel.instanceToken) {
      const baseUrl = (process.env.NEXTAUTH_URL ?? '').replace(/\/$/, '')
      console.log(`[UAZAPI WEBHOOK] triggering audio transcription | messageId=${savedMessage.id}`)
      fetch(`${baseUrl}/api/transcription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: savedMessage.id, externalId: msg.messageid, instanceToken: channel.instanceToken }),
      })
        .then(res => { if (!res.ok) res.text().then(b => console.error(`[UAZAPI WEBHOOK] transcription HTTP error: ${res.status} ${b.slice(0, 200)}`)) })
        .catch(err => console.error('[UAZAPI WEBHOOK] transcription trigger error:', err))
    }

    // Image/video/document: download media URL inline (avoids unreliable internal HTTP call)
    if ((mediaType === 'image' || mediaType === 'video' || mediaType === 'document') && msg.messageid && channel.instanceToken) {
      console.log(`[UAZAPI WEBHOOK] downloading media inline | messageId=${savedMessage.id} | mediaType=${mediaType}`)
      downloadUazapiMedia(channel.instanceToken, msg.messageid)
        .then(async ({ fileURL }) => {
          console.log(`[UAZAPI WEBHOOK] download result | messageId=${savedMessage.id} | fileURL=${!!fileURL} | url=${fileURL?.slice(0, 80)}`)
          if (!fileURL) return
          await db.message.update({ where: { id: savedMessage.id }, data: { mediaUrl: fileURL } })
          await pusherServer.trigger(
            `conversation-${savedMessage.conversationId}`,
            'message-updated',
            { messageId: savedMessage.id, mediaUrl: fileURL }
          )
          console.log(`[UAZAPI WEBHOOK] media URL saved | messageId=${savedMessage.id}`)
        })
        .catch(err => console.error('[UAZAPI WEBHOOK] inline media download error:', err))
    }

  }
}

async function handleMessagesUpdate(payload: UazapiWebhookPayload) {
  // Actual payload: payload.event.MessageIDs (array) + payload.event.Type (status string)
  const event = (payload as {
    event?: { MessageIDs?: string[]; Type?: string }
  }).event

  if (!event?.MessageIDs?.length) return

  const statusMap: Record<string, string> = {
    read: 'READ',
    delivered: 'DELIVERED',
    sent: 'SENT',
    failed: 'FAILED',
  }
  const newStatus = statusMap[event.Type?.toLowerCase() ?? ''] ?? null
  if (!newStatus) return

  for (const messageid of event.MessageIDs) {
    const message = await db.message.findFirst({ where: { externalId: messageid } })
    if (!message || newStatus === message.status) continue

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
