import { db } from '@/lib/db'
import { consumeTokens } from '@/lib/billing/tokenService'

function shouldReset(resetDate: Date | null | undefined): boolean {
  if (!resetDate) return true
  return new Date() >= resetDate
}

async function resetMonthlyCount(workspaceId: string): Promise<void> {
  const nextReset = new Date()
  nextReset.setMonth(nextReset.getMonth() + 1)
  await db.workspace.update({
    where: { id: workspaceId },
    data: { soraUsedThisMonth: 0, soraResetDate: nextReset },
  })
}

export async function getSoraBillingStatus(workspaceId: string) {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      soraMonthlyLimit: true,
      soraUsedThisMonth: true,
      soraResetDate: true,
      tokenBalance: true,
    },
  })
  if (!workspace) return null

  const resetNeeded = shouldReset(workspace.soraResetDate)
  const used = resetNeeded ? 0 : workspace.soraUsedThisMonth
  const limit = workspace.soraMonthlyLimit
  const isOverflow = used >= limit

  return {
    used,
    limit,
    extras: workspace.tokenBalance,
    resetDate: workspace.soraResetDate,
    isOverflow,
    hasCapacity: !isOverflow || workspace.tokenBalance > 0,
  }
}

export async function consumeSoraAttendance(
  workspaceId: string,
  conversationId: string,
): Promise<{ source: 'plan' | 'token' | 'blocked' }> {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      soraMonthlyLimit: true,
      soraUsedThisMonth: true,
      soraResetDate: true,
      tokenBalance: true,
    },
  })
  if (!workspace) return { source: 'blocked' }

  // Reset monthly count if needed
  if (shouldReset(workspace.soraResetDate)) {
    await resetMonthlyCount(workspaceId)
    await db.workspace.update({
      where: { id: workspaceId },
      data: { soraUsedThisMonth: 1 },
    })
    return { source: 'plan' }
  }

  // Layer 1: plan-based attendances
  if (workspace.soraUsedThisMonth < workspace.soraMonthlyLimit) {
    await db.workspace.update({
      where: { id: workspaceId },
      data: { soraUsedThisMonth: { increment: 1 } },
    })
    return { source: 'plan' }
  }

  // Layer 2: overflow with tokens (1 token = 1 extra attendance)
  const consumed = await consumeTokens(
    workspaceId,
    1,
    'vendedor',
    conversationId,
    'Atendimento extra Sora',
  )
  if (consumed.success) return { source: 'token' }

  return { source: 'blocked' }
}
