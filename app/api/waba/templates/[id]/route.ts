import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { decrypt } from '@/lib/crypto'
import { deleteTemplate } from '@/lib/integrations/waba'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.workspaceId || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const { id } = await params

  const template = await db.wabaTemplate.findFirst({
    where: { id, workspaceId: session.user.workspaceId },
  })
  if (!template) {
    return NextResponse.json({ error: 'Template não encontrado.' }, { status: 404 })
  }

  const channel = await db.wabaChannel.findFirst({
    where: { workspaceId: session.user.workspaceId, isActive: true },
  })
  if (!channel) {
    return NextResponse.json({ error: 'WABA não conectado.' }, { status: 400 })
  }

  try {
    const accessToken = decrypt(channel.accessToken)
    await deleteTemplate(accessToken, channel.wabaId, template.name)
    await db.wabaTemplate.delete({ where: { id } })
    return NextResponse.json({ deleted: true })
  } catch (error) {
    console.error('[WABA DELETE TEMPLATE]', error)
    return NextResponse.json({ error: 'Erro ao deletar template.' }, { status: 500 })
  }
}
