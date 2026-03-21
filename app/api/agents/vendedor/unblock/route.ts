import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { unblockAI } from '@/lib/agents/vendedor-redis'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.workspaceId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const { conversationId } = await req.json() as { conversationId: string }

  const conversation = await db.conversation.findFirst({
    where: { id: conversationId, workspaceId: session.user.workspaceId },
    select: { id: true },
  })

  if (!conversation) {
    return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 })
  }

  await unblockAI(conversationId)

  return NextResponse.json({ conversationId, unblocked: true })
}
