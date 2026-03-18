import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { getPlanConfig, getNextPlan } from '@/lib/billing/planService'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspace = await db.workspace.findUnique({
    where: { id: session.user.workspaceId },
    select: {
      plan: true,
      subscriptionStatus: true,
      currentPeriodEnd: true,
      maxUsers: true,
      trialEndsAt: true,
      conversationsThisMonth: true,
      maxConversationsPerMonth: true,
    },
  })

  if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const activeUsers = await db.user.count({
    where: { workspaceId: session.user.workspaceId, isActive: true },
  })

  const planConfig = getPlanConfig(workspace.plan)
  const nextPlan = getNextPlan(workspace.plan)

  return NextResponse.json({
    plan: workspace.plan,
    planName: planConfig.name,
    subscriptionStatus: workspace.subscriptionStatus,
    currentPeriodEnd: workspace.currentPeriodEnd,
    trialEndsAt: workspace.trialEndsAt,
    maxUsers: workspace.maxUsers,
    activeUsers,
    conversationsThisMonth: workspace.conversationsThisMonth,
    maxConversationsPerMonth: workspace.maxConversationsPerMonth,
    nextPlan,
  })
}
