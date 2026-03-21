import { db } from '@/lib/db'
import { TokenTransactionType } from '../../generated/prisma/enums'

export async function getTokenBalance(workspaceId: string): Promise<number> {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { tokenBalance: true },
  })
  return workspace?.tokenBalance ?? 0
}

export async function canConsumeTokens(workspaceId: string, amount: number): Promise<boolean> {
  const balance = await getTokenBalance(workspaceId)
  return balance >= amount
}

export async function consumeTokens(
  workspaceId: string,
  amount: number,
  referenceType: 'disparador' | 'vendedor' | 'buscador',
  referenceId: string,
  description?: string,
): Promise<{ success: boolean; newBalance: number }> {
  return await db.$transaction(async (tx) => {
    const workspace = await tx.workspace.findUnique({
      where: { id: workspaceId },
      select: { tokenBalance: true },
    })
    if (!workspace || workspace.tokenBalance < amount) {
      return { success: false, newBalance: workspace?.tokenBalance ?? 0 }
    }

    const balanceBefore = workspace.tokenBalance
    const balanceAfter = balanceBefore - amount

    await tx.workspace.update({
      where: { id: workspaceId },
      data: { tokenBalance: balanceAfter },
    })

    await tx.tokenTransaction.create({
      data: {
        workspaceId,
        type: TokenTransactionType.CONSUMPTION,
        amount: -amount,
        balanceBefore,
        balanceAfter,
        referenceType,
        referenceId,
        description: description ?? `Consumo ${referenceType}`,
      },
    })

    return { success: true, newBalance: balanceAfter }
  })
}

export async function addTokens(
  workspaceId: string,
  amount: number,
  type: TokenTransactionType,
  referenceId?: string,
  description?: string,
): Promise<{ newBalance: number }> {
  return await db.$transaction(async (tx) => {
    const workspace = await tx.workspace.findUnique({
      where: { id: workspaceId },
      select: { tokenBalance: true },
    })
    const balanceBefore = workspace?.tokenBalance ?? 0
    const balanceAfter = Math.max(0, balanceBefore + amount)

    await tx.workspace.update({
      where: { id: workspaceId },
      data: { tokenBalance: balanceAfter },
    })

    await tx.tokenTransaction.create({
      data: {
        workspaceId,
        type,
        amount,
        balanceBefore,
        balanceAfter,
        referenceId,
        referenceType: type === TokenTransactionType.PURCHASE ? 'kirvano_purchase'
          : type === TokenTransactionType.REFUND ? 'kirvano_refund'
          : undefined,
        description,
      },
    })

    return { newBalance: balanceAfter }
  })
}

export async function getTransactionHistory(
  workspaceId: string,
  page: number = 1,
  limit: number = 20,
): Promise<{ transactions: Awaited<ReturnType<typeof db.tokenTransaction.findMany>>; total: number }> {
  const skip = (page - 1) * limit

  const [transactions, total] = await Promise.all([
    db.tokenTransaction.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    db.tokenTransaction.count({ where: { workspaceId } }),
  ])

  return { transactions, total }
}
