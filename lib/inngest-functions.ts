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
        const { value } = change
        if (!value.messages) continue

        const channel = await db.channel.findFirst({
          where: { phoneNumberId: value.metadata.phone_number_id, type: 'WHATSAPP' },
        })
        if (!channel) continue

        for (const msg of value.messages) {
          if (msg.type !== 'text') continue

          const contactName =
            value.contacts?.find((c) => c.wa_id === msg.from)?.profile?.name ?? msg.from

          const conversation = await db.conversation.upsert({
            where: {
              workspaceId_channelId_externalId: {
                workspaceId: channel.workspaceId,
                channelId: channel.id,
                externalId: msg.from,
              },
            },
            create: {
              workspaceId: channel.workspaceId,
              channelId: channel.id,
              externalId: msg.from,
              contactName,
              contactPhone: msg.from,
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
