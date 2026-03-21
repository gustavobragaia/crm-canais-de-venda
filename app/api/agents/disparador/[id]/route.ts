import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user?.workspaceId) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
    }

    const { id } = await params

    const dispatch = await db.templateDispatch.findFirst({
      where: { id, workspaceId: session.user.workspaceId },
      include: {
        dispatchList: { select: { name: true, contactCount: true } },
      },
    })

    if (!dispatch) {
      return NextResponse.json({ error: 'Disparo não encontrado.' }, { status: 404 })
    }

    return NextResponse.json({ dispatch })
  } catch (error) {
    console.error('[DISPARADOR DISPATCH]', error)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
