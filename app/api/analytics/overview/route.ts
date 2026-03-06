import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspaceId = session.user.workspaceId

  const [
    totalUnassigned,
    totalInProgress,
    totalResolved,
    totalConversations,
    workspaceData,
  ] = await Promise.all([
    db.conversation.count({ where: { workspaceId, status: 'UNASSIGNED' } }),
    db.conversation.count({ where: { workspaceId, status: 'IN_PROGRESS' } }),
    db.conversation.count({ where: { workspaceId, status: 'RESOLVED' } }),
    db.conversation.count({ where: { workspaceId } }),
    db.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        conversationsThisMonth: true,
        maxConversationsPerMonth: true,
        subscriptionStatus: true,
        trialEndsAt: true,
      },
    }),
  ])

  // Channel breakdown
  const channelStats = await db.conversation.groupBy({
    by: ['channelId'],
    where: { workspaceId },
    _count: { id: true },
  })

  return NextResponse.json({
    unassigned: totalUnassigned,
    inProgress: totalInProgress,
    resolved: totalResolved,
    total: totalConversations,
    conversationsThisMonth: workspaceData?.conversationsThisMonth ?? 0,
    maxConversationsPerMonth: workspaceData?.maxConversationsPerMonth ?? 0,
    subscriptionStatus: workspaceData?.subscriptionStatus,
    trialEndsAt: workspaceData?.trialEndsAt,
  })
}
