import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.workspaceId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const { conversationId, enabled } = await req.json() as {
    conversationId: string
    enabled: boolean
  }

  const conversation = await db.conversation.findFirst({
    where: { id: conversationId, workspaceId: session.user.workspaceId },
    select: { id: true },
  })

  if (!conversation) {
    return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 })
  }

  await db.conversation.update({
    where: { id: conversationId },
    data: { aiSalesEnabled: enabled },
  })

  return NextResponse.json({ conversationId, aiSalesEnabled: enabled })
}
