import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sendUazapiMessage } from '@/lib/integrations/uazapi'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  const pending = await db.scheduledMessage.findMany({
    where: { status: 'PENDING', scheduledAt: { lte: now } },
    include: {
      conversation: { include: { channel: true } },
    },
    take: 50,
  })

  const results = await Promise.allSettled(
    pending.map(async (sm) => {
      try {
        const { conversation } = sm
        const channel = conversation.channel

        if (channel.provider === 'UAZAPI' && channel.instanceToken) {
          await sendUazapiMessage(
            channel.instanceToken,
            conversation.externalId,
            sm.content,
          )
        }

        await db.message.create({
          data: {
            conversationId: conversation.id,
            workspaceId: sm.workspaceId,
            direction: 'OUTBOUND',
            content: sm.content,
            status: 'SENT',
          },
        })

        await db.conversation.update({
          where: { id: conversation.id },
          data: {
            lastMessageAt: new Date(),
            lastMessagePreview: sm.content.slice(0, 100),
          },
        })

        await db.scheduledMessage.update({
          where: { id: sm.id },
          data: { status: 'SENT', sentAt: new Date() },
        })
      } catch (err) {
        console.error('[CRON] failed to send scheduled message', sm.id, err)
        await db.scheduledMessage.update({
          where: { id: sm.id },
          data: { status: 'FAILED' },
        })
      }
    })
  )

  const sent = results.filter((r) => r.status === 'fulfilled').length
  const failed = results.filter((r) => r.status === 'rejected').length

  return NextResponse.json({ sent, failed, total: pending.length })
}
