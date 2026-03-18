import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import type { FacebookWebhookPayload } from '@/lib/integrations/facebook'
import { canCreateConversation, incrementConversationCount } from '@/lib/billing/conversationGate'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ error: 'Verification failed' }, { status: 403 })
}

export async function POST(req: NextRequest) {
  const payload = await req.json() as FacebookWebhookPayload

  if (payload.object === 'page') {
    for (const entry of payload.entry) {
      const channel = await db.channel.findFirst({
        where: { pageId: entry.id, type: 'FACEBOOK' },
      })
      if (!channel) continue

      for (const messaging of entry.messaging) {
        if (!messaging.message?.text) continue

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

        if (!existingConv) await incrementConversationCount(channel.workspaceId)

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

  return NextResponse.json({ status: 'EVENT_RECEIVED' })
}
