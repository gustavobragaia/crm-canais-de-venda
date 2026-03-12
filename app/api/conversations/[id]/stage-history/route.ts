import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: conversationId } = await params

  // Verify the conversation belongs to this workspace
  const conversation = await db.conversation.findFirst({
    where: { id: conversationId, workspaceId: session.user.workspaceId },
    select: { id: true },
  })

  if (!conversation) {
    return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 })
  }

  const history = await db.stageHistory.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(history)
}
