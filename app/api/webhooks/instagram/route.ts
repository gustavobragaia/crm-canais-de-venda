import { NextRequest, NextResponse } from 'next/server'
import type { InstagramWebhookPayload } from '@/lib/integrations/instagram'
import { publishToQueue } from '@/lib/qstash'
import { processMessageIngest } from '@/lib/queue/message-ingest-logic'
import type { MessageIngestPayload } from '@/lib/queue/types'

const MEDIA_TYPE_MAP: Record<string, string> = {
  image: 'image',
  video: 'video',
  audio: 'audio',
  file: 'document',
}

const MEDIA_PLACEHOLDER: Record<string, string> = {
  image: '[Imagem]',
  video: '[Vídeo]',
  audio: '[Áudio]',
  document: '[Arquivo]',
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === (process.env.META_VERIFY_TOKEN ?? process.env.WHATSAPP_VERIFY_TOKEN)) {
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ error: 'Verification failed' }, { status: 403 })
}

export async function POST(req: NextRequest) {
  // Always return 200 to Meta — otherwise Meta will retry
  try {
    const payload = await req.json() as InstagramWebhookPayload

    console.log('[IG WEBHOOK] Received:', payload.object, 'entries:', payload.entry?.length ?? 0)

    if (payload.object === 'instagram') {
      for (const entry of payload.entry) {
        for (const messaging of entry.messaging) {
          // Skip echo messages
          if (messaging.message?.is_echo) continue

          const hasText = !!messaging.message?.text
          const hasAttachment = (messaging.message?.attachments?.length ?? 0) > 0
          if (!hasText && !hasAttachment) continue

          const senderId = messaging.sender.id
          const mid = messaging.message?.mid

          // Determine content + media
          const attachment = messaging.message?.attachments?.[0]
          const hasMedia = !!(attachment?.payload?.url && attachment.type !== 'fallback')
          const mediaType = hasMedia ? (MEDIA_TYPE_MAP[attachment!.type] ?? 'document') : undefined

          const textContent = messaging.message?.text ?? ''
          let content: string
          if (textContent) {
            content = textContent
          } else if (mediaType) {
            content = MEDIA_PLACEHOLDER[mediaType] ?? '[Mídia]'
          } else if (attachment && !attachment.payload?.url) {
            content = '[Mídia temporária]'
          } else if (attachment?.type === 'fallback') {
            content = '[Conteúdo não suportado]'
          } else {
            content = '[Mensagem]'
          }

          const ingestPayload: MessageIngestPayload = {
            provider: 'INSTAGRAM',
            channelIdentifier: entry.id, // businessAccountId
            contactExternalId: senderId,
            contactName: `Instagram User ${senderId.slice(-6)}`,
            externalId: mid ?? '',
            direction: 'INBOUND',
            content,
            sentAt: new Date(messaging.timestamp || Date.now()).toISOString(),
            mediaType,
            attachmentUrl: hasMedia ? attachment?.payload?.url : undefined,
            attachmentType: attachment?.type,
          }

          await publishToQueue('/api/queue/message-ingest', ingestPayload,
            mid ? { deduplicationId: `msg-${mid}` } : {}
          ).catch(async (err) => {
            console.error('[IG WEBHOOK] qstash failed, processing sync:', err)
            await processMessageIngest(ingestPayload).catch(e => console.error('[IG WEBHOOK] sync fallback error:', e))
          })
        }
      }
    }
  } catch (err) {
    console.error('[IG WEBHOOK]', err)
  }

  return NextResponse.json({ status: 'EVENT_RECEIVED' })
}
