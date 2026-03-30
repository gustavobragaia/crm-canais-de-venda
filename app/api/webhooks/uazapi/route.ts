import { NextRequest, NextResponse } from 'next/server'
import { type UazapiWebhookPayload, type UazapiWebhookMessagePayload, type UazapiWebhookConnectionPayload, type UazapiWebhookHistoryPayload } from '@/lib/integrations/uazapi'
import { publishToQueue } from '@/lib/qstash'
import { processMessageIngest } from '@/lib/queue/message-ingest-logic'
import type { MessageIngestPayload } from '@/lib/queue/types'

export async function GET() {
  return NextResponse.json({ status: 'OK' })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()
    const payload = JSON.parse(body) as UazapiWebhookPayload
    console.log('[UAZAPI WEBHOOK] EventType:', payload.EventType, '| token:', payload.token?.slice(0, 8))

    if (payload.EventType === 'messages') {
      await handleMessage(payload as UazapiWebhookMessagePayload, false)
    } else if (payload.EventType === 'history') {
      await handleMessage(payload as UazapiWebhookHistoryPayload, true)
    } else if (payload.EventType === 'messages_update') {
      await handleMessagesUpdate(payload)
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

function extractMediaType(messageType: string): string | null {
  const t = messageType.toLowerCase()
  if (t === 'image' || t.includes('image')) return 'image'
  if (t === 'video' || t.includes('video')) return 'video'
  if (t === 'document' || t.includes('document') || t.includes('pdf')) return 'document'
  if (t === 'audio' || t === 'ptt' || t === 'myaudio' || t.includes('audio') || t.includes('ptt') || t.includes('voice')) return 'audio'
  return null
}

async function handleMessage(
  payload: UazapiWebhookMessagePayload | UazapiWebhookHistoryPayload,
  isHistory: boolean,
) {
  const msg = payload.message

  // Skip API-sent messages (already saved when we sent them)
  if (!isHistory && msg.fromMe && msg.wasSentByApi) return

  const direction = msg.fromMe ? 'OUTBOUND' : 'INBOUND'
  const chatid = msg.chatid
  const isGroup = chatid.endsWith('@g.us')
  const chat = payload.chat ?? {}

  const contactPhone = isGroup
    ? undefined
    : chat.phone
      ? chat.phone.replace(/\D/g, '')
      : chatid.replace('@s.whatsapp.net', '').replace('@lid', '')

  const contactName = chat.wa_contactName || chat.wa_name || chat.name || msg.senderName || contactPhone || chatid.split('@')[0]
  const contactPhotoUrl = chat.imagePreview || chat.image || undefined

  const mediaType = extractMediaType(msg.messageType)
  const mediaUrl = msg.fileURL ?? msg.media?.url ?? undefined
  const mediaMime = msg.media?.mimetype ?? undefined
  const mediaName = msg.media?.filename ?? undefined

  const rawText = msg.text
    || (typeof msg.content === 'string' ? msg.content : '')
    || msg.media?.caption
    || ''
  const textContent = rawText === '[Media]' && mediaType ? '' : rawText

  // Build display content: use caption if present, fallback to placeholder, then generic
  const content = mediaType && !textContent
    ? `[${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)}]`
    : textContent || '[Mensagem]'

  const sentAt = msg.messageTimestamp
    ? new Date(msg.messageTimestamp > 1e12 ? msg.messageTimestamp : msg.messageTimestamp * 1000).toISOString()
    : new Date().toISOString()

  const ingestPayload: MessageIngestPayload = {
    provider: 'UAZAPI',
    channelIdentifier: payload.token,
    contactExternalId: chatid,
    contactName,
    contactPhone,
    contactPhotoUrl,
    externalId: msg.messageid,
    direction,
    content,
    senderName: msg.senderName,
    sentAt,
    mediaType: mediaType ?? undefined,
    mediaUrl,
    mediaMime,
    mediaName,
    isHistory,
    aiGenerated: false,
    instanceToken: payload.token,
    mediaMessageId: msg.messageid,
  }

  console.log(`[UAZAPI WEBHOOK] publishing to qstash externalId=${msg.messageid} direction=${direction}`)
  await publishToQueue('/api/queue/message-ingest', ingestPayload,
    msg.messageid ? { deduplicationId: `msg-${msg.messageid}` } : {}
  ).catch(async (err) => {
    console.error('[UAZAPI WEBHOOK] qstash failed, processing sync:', err)
    await processMessageIngest(ingestPayload).catch(e => console.error('[UAZAPI WEBHOOK] sync fallback error:', e))
  })
}

async function handleMessagesUpdate(payload: UazapiWebhookPayload) {
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

  await publishToQueue('/api/queue/message-status-update', {
    provider: 'UAZAPI',
    channelIdentifier: payload.token,
    externalIds: event.MessageIDs,
    status: newStatus,
  }).catch(err => console.error('[UAZAPI WEBHOOK] message-status-update publish error:', err))
}

async function handleConnection(payload: UazapiWebhookConnectionPayload) {
  const status = payload.data?.status
  if (!status) return

  await publishToQueue('/api/queue/channel-status-update', {
    provider: 'UAZAPI',
    channelIdentifier: payload.token,
    status,
  }).catch(err => console.error('[UAZAPI WEBHOOK] channel-status-update publish error:', err))
}
