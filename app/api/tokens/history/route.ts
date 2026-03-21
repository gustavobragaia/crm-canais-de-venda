import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getTransactionHistory } from '@/lib/billing/tokenService'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.workspaceId) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit')) || 20))

    const { transactions, total } = await getTransactionHistory(
      session.user.workspaceId,
      page,
      limit,
    )

    return NextResponse.json({
      transactions,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('[TOKENS HISTORY]', error)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
