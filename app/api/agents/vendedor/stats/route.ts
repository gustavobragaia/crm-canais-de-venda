import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.workspaceId) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
    }

    const wid = session.user.workspaceId

    const [tokensUsed, activeConversations, avgScore, handoffs] = await Promise.all([
      db.tokenTransaction.aggregate({
        where: { workspaceId: wid, referenceType: 'vendedor', type: 'CONSUMPTION' },
        _sum: { amount: true },
      }),
      db.conversation.count({
        where: { workspaceId: wid, aiSalesEnabled: true },
      }),
      db.conversation.aggregate({
        where: { workspaceId: wid, qualificationScore: { not: null } },
        _avg: { qualificationScore: true },
      }),
      db.conversation.count({
        where: {
          workspaceId: wid,
          aiSalesEnabled: false,
          aiSalesMessageCount: { gt: 0 },
        },
      }),
    ])

    return NextResponse.json({
      tokensUsed: Math.abs(tokensUsed._sum.amount ?? 0),
      activeConversations,
      avgScore: avgScore._avg.qualificationScore
        ? Math.round(avgScore._avg.qualificationScore * 10) / 10
        : null,
      handoffs,
    })
  } catch (error) {
    console.error('[VENDEDOR STATS]', error)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
