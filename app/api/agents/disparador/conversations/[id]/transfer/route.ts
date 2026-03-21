import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.workspaceId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const { id } = await params
  const { target } = await req.json() as { target: 'inbox' | 'sdr' }

  const conversation = await db.conversation.findFirst({
    where: { id, workspaceId: session.user.workspaceId },
    select: { id: true, pipelineStage: true },
  })

  if (!conversation) {
    return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 })
  }

  const newStage = target === 'sdr' ? 'SDR Ativo' : 'Não Atribuído'

  await db.conversation.update({
    where: { id },
    data: {
      pipelineStage: newStage,
      ...(target === 'sdr' && { aiSalesEnabled: true }),
      ...(target === 'inbox' && { aiSalesEnabled: false }),
    },
  })

  await pusherServer.trigger(
    `workspace-${session.user.workspaceId}`,
    'dispatch-transfer',
    { conversationId: id, stage: newStage },
  ).catch(() => {})

  return NextResponse.json({ stage: newStage })
}
