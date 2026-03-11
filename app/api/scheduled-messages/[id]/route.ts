import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const msg = await db.scheduledMessage.findFirst({
    where: { id, workspaceId: session.user.workspaceId },
  })
  if (!msg) return NextResponse.json({ error: 'Não encontrado.' }, { status: 404 })

  await db.scheduledMessage.update({ where: { id }, data: { status: 'CANCELLED' } })

  return NextResponse.json({ success: true })
}
