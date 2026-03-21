import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.workspaceId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const stage = searchParams.get('stage')
  const listId = searchParams.get('listId')

  const where: Record<string, unknown> = {
    workspaceId: session.user.workspaceId,
    source: 'dispatch',
    pipelineStage: { not: null },
  }

  if (stage) where.pipelineStage = stage
  if (listId) where.dispatchListId = listId

  const conversations = await db.conversation.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: 100,
    select: {
      id: true,
      contactName: true,
      contactPhone: true,
      pipelineStage: true,
      dispatchListId: true,
      templateDispatchId: true,
      aiSalesEnabled: true,
      aiSalesMessageCount: true,
      lastMessageAt: true,
      lastMessagePreview: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  return NextResponse.json({ conversations })
}
