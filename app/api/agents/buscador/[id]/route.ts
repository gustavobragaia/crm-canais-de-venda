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

    const job = await db.scrapingJob.findFirst({
      where: { id, workspaceId: session.user.workspaceId },
    })

    if (!job) {
      return NextResponse.json({ error: 'Job não encontrado' }, { status: 404 })
    }

    return NextResponse.json({ job })
  } catch (error) {
    console.error('[BUSCADOR JOB]', error)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
