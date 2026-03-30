import { NextRequest, NextResponse } from 'next/server'
import { verifyQStashSignature, parseQStashBody } from '@/lib/queue/verify'
import type { MessageStatusUpdatePayload } from '@/lib/queue/types'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  const authError = await verifyQStashSignature(req)
  if (authError) return authError

  const payload = await parseQStashBody<MessageStatusUpdatePayload>(req)

  console.log(`[QUEUE/MESSAGE-STATUS-UPDATE] provider=${payload.provider} ids=${payload.externalIds.length} status=${payload.status}`)

  const statusMap: Record<string, 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'> = {
    SENT: 'SENT',
    DELIVERED: 'DELIVERED',
    READ: 'READ',
    FAILED: 'FAILED',
  }
  const newStatus = statusMap[payload.status]
  if (!newStatus) {
    return NextResponse.json({ skipped: true, reason: 'unknown-status' })
  }

  for (const externalId of payload.externalIds) {
    const message = await db.message.findFirst({
      where: { externalId },
      select: { id: true, status: true, workspaceId: true },
    })
    if (!message) continue
    if (message.status === newStatus) continue

    await db.message.update({
      where: { id: message.id },
      data: {
        status: newStatus,
        ...(newStatus === 'READ' ? { readAt: new Date() } : {}),
        ...(newStatus === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
      },
    })

    pusherServer.trigger(
      `workspace-${message.workspaceId}`,
      'message-updated',
      { messageId: message.id, status: newStatus }
    ).catch(err => console.error('[QUEUE/MESSAGE-STATUS-UPDATE] Pusher failed:', err))

    console.log(`[QUEUE/MESSAGE-STATUS-UPDATE] updated messageId=${message.id} → ${newStatus}`)
  }

  return NextResponse.json({ success: true })
}
