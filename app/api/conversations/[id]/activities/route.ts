import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const conversation = await db.conversation.findFirst({
    where: { id, workspaceId: session.user.workspaceId },
  })
  if (!conversation) return NextResponse.json({ error: 'Não encontrada.' }, { status: 404 })

  const activities = await db.conversationActivity.findMany({
    where: { conversationId: id },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  return NextResponse.json(activities)
}
