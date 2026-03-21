import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { decrypt } from '@/lib/crypto'
import { pusherServer } from '@/lib/pusher'
import { put } from '@vercel/blob'
import type { FacebookWebhookPayload } from '@/lib/integrations/facebook'
import { canCreateConversation, incrementConversationCount } from '@/lib/billing/conversationGate'
import { fetchMetaUserProfile, downloadMetaMedia } from '@/lib/integrations/meta-common'

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
    const payload = await req.json() as FacebookWebhookPayload

    if (payload.object === 'page') {
      for (const entry of payload.entry) {
        const channel = await db.channel.findFirst({
          where: { pageId: entry.id, type: 'FACEBOOK', isActive: true },
        })
        if (!channel) continue

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
              contactName: `Facebook User ${senderId.slice(-6)}`,
              status: 'UNASSIGNED',
            },
            update: {},
          })

          if (!existingConv) {
            await incrementConversationCount(channel.workspaceId)

            // Fire-and-forget: fetch real contact name + photo
            if (channel.accessToken) {
              const token = decrypt(channel.accessToken)
              fetchMetaUserProfile(senderId, token, 'FACEBOOK')
                .then((profile) =>
                  db.conversation.update({
                    where: { id: conversation.id },
                    data: { contactName: profile.name, contactPhotoUrl: profile.photoUrl },
                  })
                )
                .catch(() => {})
            }
          }

          // Dedup by external message ID
          const existing = await db.message.findFirst({
            where: { externalId: messaging.message!.mid },
          })
          if (existing) continue

          // Process attachment if present
          let mediaType: string | undefined
          let mediaUrl: string | undefined
          let mediaMime: string | undefined
          const attachment = messaging.message?.attachments?.[0]

          if (attachment?.payload?.url && attachment.type !== 'fallback') {
            const rawType = MEDIA_TYPE_MAP[attachment.type] ?? 'document'
            try {
              const accessToken = channel.accessToken ? decrypt(channel.accessToken) : ''
              const { buffer, contentType } = await downloadMetaMedia(attachment.payload.url, accessToken)
              const ext = contentType.split('/')[1]?.split(';')[0] ?? 'bin'
              const filename = `meta-fb-${Date.now()}.${ext}`
              const blob = await put(`media/${filename}`, buffer, { access: 'public', contentType })
              mediaType = rawType
              mediaUrl = blob.url
              mediaMime = contentType
            } catch (err) {
              console.error('[FB WEBHOOK] Failed to download/upload media:', err)
            }
          }

          const textContent = messaging.message?.text ?? ''
          const content = textContent || (mediaType ? (MEDIA_PLACEHOLDER[mediaType] ?? '[Mídia]') : '')
          const preview = content.slice(0, 100)

          const savedMessage = await db.message.create({
            data: {
              conversationId: conversation.id,
              workspaceId: channel.workspaceId,
              direction: 'INBOUND',
              content,
              externalId: messaging.message!.mid,
              status: 'DELIVERED',
              ...(mediaType ? { mediaType, mediaUrl, mediaMime } : {}),
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

          await pusherServer.trigger(
            `workspace-${channel.workspaceId}`,
            'new-message',
            { conversationId: conversation.id, message: savedMessage }
          )
        }
      }
    }
  } catch (err) {
    console.error('[FB WEBHOOK]', err)
  }

  return NextResponse.json({ status: 'EVENT_RECEIVED' })
}
