import { inngest } from '@/lib/inngest'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { decrypt } from '@/lib/crypto'
import type { InstagramWebhookPayload } from '@/lib/integrations/instagram'
import type { FacebookWebhookPayload } from '@/lib/integrations/facebook'
import type {
  EvolutionMessageUpsertPayload,
  EvolutionConnectionUpdatePayload,
  EvolutionQRCodeUpdatedPayload,
} from '@/lib/integrations/evolution'

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

// ==================== EVOLUTION (WHATSAPP) ====================

export const processEvolutionMessage = inngest.createFunction(
  { id: 'process-evolution-message', retries: 3 },
  { event: 'evolution/message.received' },
  async ({ event }) => {
    const payload = event.data as EvolutionMessageUpsertPayload
    const { instance, data: msg } = payload

    // Skip outgoing echoes
    if (msg.key.fromMe) return

    const channel = await db.channel.findFirst({
      where: { instanceName: instance, provider: 'EVOLUTION', type: 'WHATSAPP' },
    })
    if (!channel) return

    const remoteJid = msg.key.remoteJid
    const isGroup = remoteJid.endsWith('@g.us')
    const contactPhone = isGroup ? undefined : remoteJid.replace('@s.whatsapp.net', '')
    const contactName = msg.pushName ?? contactPhone ?? remoteJid.split('@')[0]

    const textContent =
      msg.message?.conversation ??
      msg.message?.extendedTextMessage?.text ??
      '[Media]'

    // Deduplication
    const existing = await db.message.findFirst({ where: { externalId: msg.key.id } })
    if (existing) return

    const conversation = await db.conversation.upsert({
      where: {
        workspaceId_channelId_externalId: {
          workspaceId: channel.workspaceId,
          channelId: channel.id,
          externalId: remoteJid,
        },
      },
      create: {
        workspaceId: channel.workspaceId,
        channelId: channel.id,
        externalId: remoteJid,
        contactName,
        contactPhone,
        status: 'UNASSIGNED',
      },
      update: { contactName },
    })

    const savedMessage = await db.message.create({
      data: {
        conversationId: conversation.id,
        workspaceId: channel.workspaceId,
        direction: 'INBOUND',
        content: textContent,
        externalId: msg.key.id,
        status: 'DELIVERED',
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
  }
)

export const processEvolutionConnectionUpdate = inngest.createFunction(
  { id: 'process-evolution-connection-update', retries: 2 },
  { event: 'evolution/connection.update' },
  async ({ event }) => {
    const payload = event.data as EvolutionConnectionUpdatePayload
    const { instance, data } = payload

    const channel = await db.channel.findFirst({
      where: { instanceName: instance, provider: 'EVOLUTION' },
    })
    if (!channel) return

    if (data.state === 'open') {
      await db.channel.update({
        where: { id: channel.id },
        data: { isActive: true, webhookVerifiedAt: new Date() },
      })
    } else if (data.state === 'close') {
      await db.channel.update({
        where: { id: channel.id },
        data: { isActive: false },
      })
      await pusherServer.trigger(
        `workspace-${channel.workspaceId}`,
        'channel-status-update',
        { channelId: channel.id, provider: 'EVOLUTION', state: 'close' }
      )
    }
  }
)

export const processEvolutionQRCodeUpdated = inngest.createFunction(
  { id: 'process-evolution-qrcode-updated', retries: 1 },
  { event: 'evolution/qrcode.updated' },
  async ({ event }) => {
    const payload = event.data as EvolutionQRCodeUpdatedPayload
    const { instance, data } = payload

    const channel = await db.channel.findFirst({
      where: { instanceName: instance, provider: 'EVOLUTION' },
    })
    if (!channel) return

    // Broadcast updated QR so the UI modal can refresh without re-calling the API
    await pusherServer.trigger(
      `workspace-${channel.workspaceId}`,
      'evolution-qr-updated',
      { channelId: channel.id, qr: data.qrcode }
    )
  }
)
