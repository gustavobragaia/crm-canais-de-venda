import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'

// Called by Vercel Cron every 10 minutes
export async function GET(req: NextRequest) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000)

  // Find dispatches stuck in SENDING for >15 min
  const stuckDispatches = await db.templateDispatch.findMany({
    where: {
      status: 'SENDING',
      startedAt: { lt: fifteenMinutesAgo },
    },
    select: {
      id: true,
      workspaceId: true,
      sentCount: true,
      failedCount: true,
      totalRecipients: true,
    },
  })

  let fixed = 0
  for (const dispatch of stuckDispatches) {
    const total = dispatch.sentCount + dispatch.failedCount
    if (total >= dispatch.totalRecipients) {
      // All jobs processed — mark COMPLETED
      await db.templateDispatch.updateMany({
        where: { id: dispatch.id, status: 'SENDING' },
        data: { status: 'COMPLETED', completedAt: new Date() },
      })
      await pusherServer.trigger(`workspace-${dispatch.workspaceId}`, 'dispatch-completed', {
        dispatchId: dispatch.id,
      }).catch(() => {})
      fixed++
    } else {
      // Still running but stuck — log for investigation
      console.warn(`[CRON/FIX-STUCK] dispatch ${dispatch.id} stuck: ${total}/${dispatch.totalRecipients} processed after 15min`)
    }
  }

  return NextResponse.json({
    checked: stuckDispatches.length,
    fixed,
    timestamp: new Date().toISOString(),
  })
}
