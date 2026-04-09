import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.workspaceId || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json() as { aiAutoActivate?: boolean }

  const channel = await db.channel.findFirst({
    where: { id, workspaceId: session.user.workspaceId },
  })
  if (!channel) {
    return NextResponse.json({ error: 'Canal não encontrado.' }, { status: 404 })
  }

  const updated = await db.channel.update({
    where: { id },
    data: {
      ...(body.aiAutoActivate !== undefined && { aiAutoActivate: body.aiAutoActivate }),
    },
    select: { id: true, aiAutoActivate: true },
  })

  // When disabling a channel, stop Sora in all open conversations on it
  if (body.aiAutoActivate === false) {
    await db.conversation.updateMany({
      where: {
        channelId: id,
        workspaceId: session.user.workspaceId,
        status: { not: 'ARCHIVED' },
        aiSalesEnabled: true,
      },
      data: { aiSalesEnabled: false },
    })
  }

  return NextResponse.json({ channel: updated })
}
