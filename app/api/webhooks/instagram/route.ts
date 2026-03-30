import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import type { InstagramWebhookPayload } from '@/lib/integrations/instagram'
import { canCreateConversation, incrementConversationCount } from '@/lib/billing/conversationGate'
import { publishToQueue } from '@/lib/qstash'

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
        // Instagram sends entry.id = Instagram Business Account ID
        const channel = await db.channel.findFirst({
          where: { businessAccountId: entry.id, type: 'INSTAGRAM', isActive: true },
        })
        if (!channel) {
          console.warn('[IG WEBHOOK] No channel found for entry.id:', entry.id)
          continue
        }

        for (const messaging of entry.messaging) {
          // Skip echo messages (messages sent by the page itself)
          if (messaging.message?.is_echo) continue

          const hasText = !!messaging.message?.text
          const hasAttachment = (messaging.message?.attachments?.length ?? 0) > 0
          if (!hasText && !hasAttachment) continue

          const senderId = messaging.sender.id

          const allowed = await canCreateConversation(channel.workspaceId, channel.id, senderId)
          if (!allowed) continue

          const existingConv = await db.conversation.findUnique({
            where: { workspaceId_channelId_externalId: { workspaceId: channel.workspaceId, channelId: channel.id, externalId: senderId } },
            select: { id: true },
          })

          const conversation = await db.conversation.upsert({
            where: {
              workspaceId_channelId_externalId: {
                workspaceId: channel.workspaceId,
                channelId: channel.id,
                externalId: senderId,
              },
            },
            create: {
              workspaceId: channel.workspaceId,
              channelId: channel.id,
              externalId: senderId,
              contactName: `Instagram User ${senderId.slice(-6)}`,
              status: 'UNASSIGNED',
              pipelineStage: 'Não Atribuído',
            },
            update: {},
          })

          if (!existingConv) {
            await incrementConversationCount(channel.workspaceId)

            // Queue: fetch real contact name + photo with retry
            if (channel.accessToken) {
              await publishToQueue('/api/queue/profile-fetch', {
                conversationId: conversation.id,
                workspaceId: channel.workspaceId,
                senderId,
                channelType: 'INSTAGRAM',
                accessToken: channel.accessToken,
              }).catch((err) => console.error('[IG WEBHOOK] qstash profile-fetch error:', err))
            }
          }

          // Dedup by external message ID
          const existing = await db.message.findFirst({
            where: { externalId: messaging.message!.mid },
          })
          if (existing) continue

          // Process attachment if present
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
            content = '[Mídia temporária]' // EC-19: ephemeral/view-once
          } else if (attachment?.type === 'fallback') {
            content = '[Conteúdo não suportado]' // EC-24: fallback attachment
          } else {
            content = '[Mensagem]'
          }
          const preview = content.slice(0, 100)

          // Save message immediately — media URL will be updated async
          const savedMessage = await db.message.create({
            data: {
              conversationId: conversation.id,
              workspaceId: channel.workspaceId,
              direction: 'INBOUND',
              content,
              externalId: messaging.message!.mid,
              status: 'DELIVERED',
              ...(mediaType ? { mediaType } : {}),
            },
          })

          await db.conversation.update({
            where: { id: conversation.id },
            data: {
              lastMessageAt: new Date(),
              lastMessagePreview: preview,
              unreadCount: { increment: 1 },
            },
          })

          pusherServer.trigger(
            `workspace-${channel.workspaceId}`,
            'new-message',
            { conversationId: conversation.id, message: savedMessage }
          ).catch(err => console.error('[IG WEBHOOK] Pusher failed:', err))

          // Queue: download + persist media with retry
          if (hasMedia && attachment?.payload?.url) {
            await publishToQueue('/api/queue/media-persist', {
              messageId: savedMessage.id,
              conversationId: conversation.id,
              workspaceId: channel.workspaceId,
              source: 'meta',
              mediaUrl: attachment.payload.url,
              accessToken: channel.accessToken ?? '',
              mediaMime: attachment.type ?? 'application/octet-stream',
            }).catch((err) => console.error('[IG WEBHOOK] qstash media-persist error:', err))
          }
        }
      }
    }
  } catch (err) {
    console.error('[IG WEBHOOK]', err)
  }

  return NextResponse.json({ status: 'EVENT_RECEIVED' })
}
