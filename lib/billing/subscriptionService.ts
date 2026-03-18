import { db } from '@/lib/db'
import { getPlanConfig } from './planService'

export async function activatePlan(
  workspaceId: string,
  plan: string,
  providerSubscriptionId?: string,
  currentPeriodEnd?: Date,
) {
  const config = getPlanConfig(plan)
  const periodEnd = currentPeriodEnd ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

  await db.$transaction([
    db.workspace.update({
      where: { id: workspaceId },
      data: {
        plan,
        subscriptionStatus: 'ACTIVE',
        maxUsers: config.userLimit,
        maxConversationsPerMonth: config.conversationLimit,
        currentPeriodEnd: periodEnd,
        kirvanoSubscriptionId: providerSubscriptionId ?? undefined,
      },
    }),
    db.subscription.create({
      data: {
        workspaceId,
        plan,
        status: 'ACTIVE',
        providerSubscriptionId: providerSubscriptionId ?? null,
        currentPeriodEnd: periodEnd,
      },
    }),
  ])
}

export async function cancelPlan(workspaceId: string) {
  await db.workspace.update({
    where: { id: workspaceId },
    data: { subscriptionStatus: 'CANCELED' },
  })
  await db.subscription.updateMany({
    where: { workspaceId, status: 'ACTIVE' },
    data: { status: 'CANCELED' },
  })
}

export async function checkUserLimit(workspaceId: string): Promise<{
  allowed: boolean
  activeUsers: number
  maxUsers: number
  plan: string
}> {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { maxUsers: true, plan: true },
  })
  if (!workspace) return { allowed: false, activeUsers: 0, maxUsers: 0, plan: 'trial' }

  const activeUsers = await db.user.count({
    where: { workspaceId, isActive: true },
  })

  return {
    allowed: activeUsers < workspace.maxUsers,
    activeUsers,
    maxUsers: workspace.maxUsers,
    plan: workspace.plan,
  }
}
