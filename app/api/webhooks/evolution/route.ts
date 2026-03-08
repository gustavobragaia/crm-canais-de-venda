import { NextRequest, NextResponse } from 'next/server'
import { verifyEvolutionSignature, type EvolutionWebhookPayload, type EvolutionMessageUpsertPayload, type EvolutionConnectionUpdatePayload, type EvolutionQRCodeUpdatedPayload } from '@/lib/integrations/evolution'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()

    // Optional HMAC verification — only enforced when secret is configured
    if (process.env.EVOLUTION_WEBHOOK_SECRET) {
      const signature = req.headers.get('x-hub-signature-256') ?? ''
      if (!verifyEvolutionSignature(body, signature, process.env.EVOLUTION_WEBHOOK_SECRET)) {
        return NextResponse.json({ error: 'Assinatura inválida.' }, { status: 401 })
      }
    }

    const payload = JSON.parse(body) as EvolutionWebhookPayload
    console.log('[EVOLUTION WEBHOOK] event:', payload.event, '| instance:', payload.instance)

    if (payload.event === 'messages.upsert') {
      await handleMessageUpsert(payload as EvolutionMessageUpsertPayload)
    } else if (payload.event === 'connection.update') {
      await handleConnectionUpdate(payload as EvolutionConnectionUpdatePayload)
    } else if (payload.event === 'qrcode.updated') {
      await handleQRCodeUpdated(payload as EvolutionQRCodeUpdatedPayload)
    } else {
      console.log('[EVOLUTION WEBHOOK] unhandled event dropped:', payload.event)
    }

    return NextResponse.json({ status: 'EVENT_RECEIVED' })
  } catch (error) {
    console.error('[EVOLUTION WEBHOOK] error:', error)
    // Always return 200 — Evolution retries on non-200 responses
    return NextResponse.json({ status: 'ERROR' })
  }
}

async function handleMessageUpsert(payload: EvolutionMessageUpsertPayload) {
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

async function handleConnectionUpdate(payload: EvolutionConnectionUpdatePayload) {
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

async function handleQRCodeUpdated(payload: EvolutionQRCodeUpdatedPayload) {
  const { instance, data } = payload

  const channel = await db.channel.findFirst({
    where: { instanceName: instance, provider: 'EVOLUTION' },
  })
  if (!channel) return

  await pusherServer.trigger(
    `workspace-${channel.workspaceId}`,
    'evolution-qr-updated',
    { channelId: channel.id, qr: data.qrcode }
  )
}
