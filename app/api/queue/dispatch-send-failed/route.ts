import { NextRequest, NextResponse } from 'next/server'
import { verifyQStashSignature, parseQStashBody } from '@/lib/queue/verify'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'

export const maxDuration = 15

// QStash failure callback payload
type DispatchSendFailedPayload = {
  dispatchId: string
  workspaceId: string
}

export async function POST(req: NextRequest) {
  const authError = await verifyQStashSignature(req)
  if (authError) return authError

  // QStash sends the original job body as the callback body
  const body = await parseQStashBody<DispatchSendFailedPayload>(req)
  const { dispatchId, workspaceId } = body

  if (!dispatchId) {
    console.warn('[QUEUE/DISPATCH-SEND-FAILED] missing dispatchId in callback body')
    return NextResponse.json({ skipped: true })
  }

  console.log(`[QUEUE/DISPATCH-SEND-FAILED] incrementing failedCount dispatchId=${dispatchId}`)

  const updated = await db.templateDispatch.update({
    where: { id: dispatchId },
    data: { failedCount: { increment: 1 } },
    select: { sentCount: true, failedCount: true, totalRecipients: true },
  })

  await pusherServer.trigger(`workspace-${workspaceId}`, 'dispatch-progress', {
    dispatchId,
    sentCount: updated.sentCount,
    failedCount: updated.failedCount,
    total: updated.totalRecipients,
  }).catch(() => {})

  if (updated.sentCount + updated.failedCount >= updated.totalRecipients) {
    await db.templateDispatch.updateMany({
      where: { id: dispatchId, status: 'SENDING' },
      data: { status: 'COMPLETED', completedAt: new Date() },
    })
    await pusherServer.trigger(`workspace-${workspaceId}`, 'dispatch-completed', {
      dispatchId,
    }).catch(() => {})
  }

  return NextResponse.json({ success: true })
}
