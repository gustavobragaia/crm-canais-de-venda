import { NextRequest, NextResponse } from 'next/server'
import { verifyQStashSignature, parseQStashBody } from '@/lib/queue/verify'
import type { ChannelStatusUpdatePayload } from '@/lib/queue/types'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  const authError = await verifyQStashSignature(req)
  if (authError) return authError

  const payload = await parseQStashBody<ChannelStatusUpdatePayload>(req)

  console.log(`[QUEUE/CHANNEL-STATUS-UPDATE] provider=${payload.provider} identifier=${payload.channelIdentifier} status=${payload.status}`)

  const channel = await db.channel.findFirst({
    where: { instanceToken: payload.channelIdentifier, provider: 'UAZAPI' },
  })
  if (!channel) {
    console.log(`[QUEUE/CHANNEL-STATUS-UPDATE] channel not found for identifier=${payload.channelIdentifier}`)
    return NextResponse.json({ skipped: true, reason: 'channel-not-found' })
  }

  if (payload.status === 'connected') {
    await db.channel.update({
      where: { id: channel.id },
      data: { isActive: true, webhookVerifiedAt: new Date() },
    })
  } else if (payload.status === 'disconnected') {
    await db.channel.update({
      where: { id: channel.id },
      data: { isActive: false },
    })
    pusherServer.trigger(
      `workspace-${channel.workspaceId}`,
      'channel-status-update',
      { channelId: channel.id, provider: 'UAZAPI', state: 'disconnected' }
    ).catch(err => console.error('[QUEUE/CHANNEL-STATUS-UPDATE] Pusher failed:', err))
  }

  console.log(`[QUEUE/CHANNEL-STATUS-UPDATE] channelId=${channel.id} → ${payload.status}`)
  return NextResponse.json({ success: true })
}
