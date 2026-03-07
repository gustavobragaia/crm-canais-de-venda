import { inngest } from '@/lib/inngest'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { decrypt } from '@/lib/crypto'
import type { WhatsAppWebhookPayload } from '@/lib/integrations/whatsapp'
import type { InstagramWebhookPayload } from '@/lib/integrations/instagram'
import type { FacebookWebhookPayload } from '@/lib/integrations/facebook'

// ==================== WHATSAPP ====================

export const processWhatsAppMessage = inngest.createFunction(
  { id: 'process-whatsapp-message', retries: 3 },
  { event: 'whatsapp/message.received' },
  async ({ event }) => {
    const payload = event.data as WhatsAppWebhookPayload

    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        const { value, field } = change

        // ---- Group lifecycle: group created/archived/deleted ----
        if (field === 'group_lifecycle_update' && value.group_id && value.metadata) {
          const channel = await db.channel.findFirst({
            where: { phoneNumberId: value.metadata.phone_number_id, type: 'WHATSAPP' },
          })
          if (!channel) continue

          if (value.event === 'group_created') {
            await db.conversation.upsert({
              where: {
                workspaceId_channelId_externalId: {
                  workspaceId: channel.workspaceId,
                  channelId: channel.id,
                  externalId: value.group_id,
                },
              },
              create: {
                workspaceId: channel.workspaceId,
                channelId: channel.id,
                externalId: value.group_id,
                contactName: `Grupo ${value.group_id.slice(-6)}`,
                status: 'UNASSIGNED',
              },
              update: {},
            })
          } else if (value.event === 'group_archived' || value.event === 'group_deleted') {
            await db.conversation.updateMany({
              where: {
                workspaceId: channel.workspaceId,
                channelId: channel.id,
                externalId: value.group_id,
              },
              data: { status: 'ARCHIVED' },
            })
          }
          continue
        }

        // ---- Group settings: name/subject changed ----
        if (field === 'group_settings_update' && value.group_id && value.metadata) {
          const channel = await db.channel.findFirst({
            where: { phoneNumberId: value.metadata.phone_number_id, type: 'WHATSAPP' },
          })
          if (!channel || !value.subject) continue

          await db.conversation.updateMany({
            where: {
              workspaceId: channel.workspaceId,
              channelId: channel.id,
              externalId: value.group_id,
            },
            data: { contactName: value.subject },
          })
          continue
        }

        // ---- Group participants: member added/removed ----
        if (field === 'group_participants_update' && value.group_id && value.metadata) {
          const channel = await db.channel.findFirst({
            where: { phoneNumberId: value.metadata.phone_number_id, type: 'WHATSAPP' },
          })
          if (!channel) continue

          const conversation = await db.conversation.findFirst({
            where: {
              workspaceId: channel.workspaceId,
              channelId: channel.id,
              externalId: value.group_id,
            },
          })
          if (!conversation) continue

          const participantIds = (value.participants ?? []).map((p) => p.wa_id).join(', ')
          const action = value.event === 'participant_added' ? 'entrou no grupo' : 'saiu do grupo'
          const content = `[Sistema] ${participantIds} ${action}`

          await db.message.create({
            data: {
              conversationId: conversation.id,
              workspaceId: channel.workspaceId,
              direction: 'INBOUND',
              content,
              status: 'DELIVERED',
            },
          })

          await db.conversation.update({
            where: { id: conversation.id },
            data: { lastMessageAt: new Date(), lastMessagePreview: content.slice(0, 100) },
          })
          continue
        }

        // ---- Regular and group messages ----
        if (!value.messages) continue

        const channel = await db.channel.findFirst({
          where: { phoneNumberId: value.metadata?.phone_number_id, type: 'WHATSAPP' },
        })
        if (!channel) continue

        for (const msg of value.messages) {
          if (msg.type !== 'text') continue

          const isGroup = !!msg.group
          const externalId = isGroup ? msg.group!.id : msg.from
          const contactName = isGroup
            ? (msg.group!.subject || `Grupo ${msg.group!.id.slice(-6)}`)
            : (value.contacts?.find((c) => c.wa_id === msg.from)?.profile?.name ?? msg.from)

          const conversation = await db.conversation.upsert({
            where: {
              workspaceId_channelId_externalId: {
                workspaceId: channel.workspaceId,
                channelId: channel.id,
                externalId,
              },
            },
            create: {
              workspaceId: channel.workspaceId,
              channelId: channel.id,
              externalId,
              contactName,
              contactPhone: isGroup ? undefined : msg.from,
              status: 'UNASSIGNED',
            },
            update: { contactName },
          })

          // Deduplication
          const existing = await db.message.findFirst({ where: { externalId: msg.id } })
          if (existing) continue

          const savedMessage = await db.message.create({
            data: {
              conversationId: conversation.id,
              workspaceId: channel.workspaceId,
              direction: 'INBOUND',
              content: msg.text?.body ?? '[Media]',
              externalId: msg.id,
              status: 'DELIVERED',
            },
          })

          await db.conversation.update({
            where: { id: conversation.id },
            data: {
              lastMessageAt: new Date(),
              lastMessagePreview: (msg.text?.body ?? '[Media]').slice(0, 100),
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
  }
)

// ==================== INSTAGRAM ====================

export const processInstagramMessage = inngest.createFunction(
  { id: 'process-instagram-message', retries: 3 },
  { event: 'instagram/message.received' },
  async ({ event }) => {
    const payload = event.data as InstagramWebhookPayload

    for (const entry of payload.entry) {
      const channel = await db.channel.findFirst({
        where: { pageId: entry.id, type: 'INSTAGRAM' },
      })
      if (!channel) continue

      for (const messaging of entry.messaging) {
        if (!messaging.message?.text) continue

        const senderId = messaging.sender.id

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
          },
          update: {},
        })

        const existing = await db.message.findFirst({
          where: { externalId: messaging.message.mid },
        })
        if (existing) continue

        const savedMessage = await db.message.create({
          data: {
            conversationId: conversation.id,
            workspaceId: channel.workspaceId,
            direction: 'INBOUND',
            content: messaging.message.text,
            externalId: messaging.message.mid,
            status: 'DELIVERED',
          },
        })

        await db.conversation.update({
          where: { id: conversation.id },
          data: {
            lastMessageAt: new Date(),
            lastMessagePreview: messaging.message.text.slice(0, 100),
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
)

// ==================== FACEBOOK ====================

export const processFacebookMessage = inngest.createFunction(
  { id: 'process-facebook-message', retries: 3 },
  { event: 'facebook/message.received' },
  async ({ event }) => {
    const payload = event.data as FacebookWebhookPayload

    for (const entry of payload.entry) {
      const channel = await db.channel.findFirst({
        where: { pageId: entry.id, type: 'FACEBOOK' },
      })
      if (!channel) continue

      for (const messaging of entry.messaging) {
        if (!messaging.message?.text) continue

        const senderId = messaging.sender.id

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

        const existing = await db.message.findFirst({
          where: { externalId: messaging.message.mid },
        })
        if (existing) continue

        const savedMessage = await db.message.create({
          data: {
            conversationId: conversation.id,
            workspaceId: channel.workspaceId,
            direction: 'INBOUND',
            content: messaging.message.text,
            externalId: messaging.message.mid,
            status: 'DELIVERED',
          },
        })

        await db.conversation.update({
          where: { id: conversation.id },
          data: {
            lastMessageAt: new Date(),
            lastMessagePreview: messaging.message.text.slice(0, 100),
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
)
