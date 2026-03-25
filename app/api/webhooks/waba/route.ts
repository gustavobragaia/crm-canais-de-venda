import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { canCreateConversation, incrementConversationCount } from '@/lib/billing/conversationGate'
import { handleDispatchResponse } from '@/lib/agents/disparador'

// WABA webhook verification (GET)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.WABA_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ error: 'Verification failed' }, { status: 403 })
}

// WABA webhook events (POST) — EC-29/30/31/32/33
export async function POST(req: NextRequest) {
  // Always return 200 to Meta — otherwise Meta will retry
  try {
    const payload = await req.json()

    if (!payload.entry) {
      return NextResponse.json({ received: true })
    }

    for (const entry of payload.entry) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'messages') continue

        const value = change.value
        const phoneNumberId = value?.metadata?.phone_number_id
        if (!phoneNumberId) continue

        // Look up WabaChannel by phoneNumberId (EC-30)
        const wabaChannel = await db.wabaChannel.findFirst({
          where: { phoneNumberId, isActive: true },
        })
        if (!wabaChannel) continue

        // EC-33: Handle status updates — sent → delivered → read
        const statuses: Array<{ id: string; status: string; timestamp: string }> = value?.statuses ?? []
        for (const status of statuses) {
          const message = await db.message.findFirst({
            where: { externalId: status.id },
          })
          if (!message) continue

          const updateData: Record<string, unknown> = {}
          if (status.status === 'delivered') {
            updateData.status = 'DELIVERED'
            updateData.deliveredAt = new Date(parseInt(status.timestamp) * 1000)
          } else if (status.status === 'read') {
            updateData.status = 'READ'
            updateData.readAt = new Date(parseInt(status.timestamp) * 1000)
          } else if (status.status === 'failed') {
            updateData.status = 'FAILED'
          }

          if (Object.keys(updateData).length > 0) {
            await db.message.update({
              where: { id: message.id },
              data: updateData,
            }).catch((err) => console.error('[WABA WEBHOOK] Status update failed:', err))
          }
        }

        // EC-31/32: Handle inbound messages
        const messages: Array<{
          id: string
          from: string
          type: string
          timestamp: string
          text?: { body: string }
          image?: { id: string; mime_type: string; caption?: string }
          video?: { id: string; mime_type: string; caption?: string }
          audio?: { id: string; mime_type: string }
          document?: { id: string; mime_type: string; filename?: string; caption?: string }
        }> = value?.messages ?? []

        for (const message of messages) {
          // Skip non-inbound message types
          if (!['text', 'image', 'video', 'audio', 'document', 'sticker'].includes(message.type)) continue

          const externalId = `${message.from}@s.whatsapp.net`

          // Billing gate
          const allowed = await canCreateConversation(wabaChannel.workspaceId, wabaChannel.id, externalId)
          if (!allowed) continue

          // Upsert conversation (following Disparador pattern — channelId = wabaChannel.id)
          const existingConv = await db.conversation.findFirst({
            where: {
              workspaceId: wabaChannel.workspaceId,
              externalId,
              channelId: wabaChannel.id,
            },
            select: { id: true, templateDispatchId: true },
          })

          const conversation = await db.conversation.upsert({
            where: {
              workspaceId_channelId_externalId: {
                workspaceId: wabaChannel.workspaceId,
                channelId: wabaChannel.id,
                externalId,
              },
            },
            create: {
              workspaceId: wabaChannel.workspaceId,
              channelId: wabaChannel.id,
              externalId,
              contactName: `WhatsApp ${message.from.slice(-4)}`,
              contactPhone: message.from,
              status: 'UNASSIGNED',
              pipelineStage: 'Não Atribuído',
            },
            update: {},
          })

          if (!existingConv) {
            await incrementConversationCount(wabaChannel.workspaceId)
          }

          // Dedup by message ID
          const existing = await db.message.findFirst({
            where: { externalId: message.id },
          })
          if (existing) continue

          // Determine content from message type
          let content = ''
          let mediaType: string | undefined
          if (message.type === 'text') {
            content = message.text?.body ?? ''
          } else if (message.type === 'image') {
            content = message.image?.caption || '[Imagem]'
            mediaType = 'image'
          } else if (message.type === 'video') {
            content = message.video?.caption || '[Vídeo]'
            mediaType = 'video'
          } else if (message.type === 'audio') {
            content = '[Áudio]'
            mediaType = 'audio'
          } else if (message.type === 'document') {
            content = message.document?.caption || message.document?.filename || '[Arquivo]'
            mediaType = 'document'
          } else if (message.type === 'sticker') {
            content = '[Figurinha]'
          }

          if (!content) content = '[Mensagem]'

          const savedMessage = await db.message.create({
            data: {
              conversationId: conversation.id,
              workspaceId: wabaChannel.workspaceId,
              direction: 'INBOUND',
              content,
              externalId: message.id,
              status: 'DELIVERED',
              ...(mediaType ? { mediaType } : {}),
            },
          })

          await db.conversation.update({
            where: { id: conversation.id },
            data: {
              lastMessageAt: new Date(parseInt(message.timestamp) * 1000),
              lastMessagePreview: content.slice(0, 100),
              unreadCount: { increment: 1 },
            },
          })

          pusherServer.trigger(
            `workspace-${wabaChannel.workspaceId}`,
            'new-message',
            { conversationId: conversation.id, message: savedMessage },
          ).catch((err) => console.error('[WABA WEBHOOK] Pusher failed:', err))

          // Fire-and-forget: handle dispatch response if this is a dispatch conversation
          if (existingConv?.templateDispatchId) {
            handleDispatchResponse(conversation.id, wabaChannel.workspaceId).catch(() => {})
          }
        }
      }
    }
  } catch (err) {
    console.error('[WABA WEBHOOK]', err)
  }

  return NextResponse.json({ received: true })
}
