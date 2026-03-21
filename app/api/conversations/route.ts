import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const assignedTo = searchParams.get('assignedTo')
    const channelType = searchParams.get('channel')
    const source = searchParams.get('source') // 'all' | 'organic' | 'dispatch'
    const dispatchListId = searchParams.get('dispatchListId')
    const pipelineStage = searchParams.get('pipelineStage')
    const page = parseInt(searchParams.get('page') ?? '1')
    const limit = 30

    const where: Record<string, unknown> = {
      workspaceId: session.user.workspaceId,
    }

    // Agents only see their assigned conversations
    if (session.user.role === 'AGENT') {
      where.assignedToId = session.user.id
    } else if (assignedTo === 'me') {
      where.assignedToId = session.user.id
    } else if (assignedTo) {
      where.assignedToId = assignedTo
    }

    if (status) where.status = status
    if (channelType) where.channel = { type: channelType }
    if (source === 'organic') where.source = { not: { equals: 'dispatch' } }
    else if (source === 'dispatch') where.source = 'dispatch'
    if (dispatchListId) where.dispatchListId = dispatchListId
    if (pipelineStage) where.pipelineStage = pipelineStage

    const [conversations, total] = await Promise.all([
      db.conversation.findMany({
        where,
        include: {
          channel: { select: { id: true, type: true, name: true } },
          assignedTo: { select: { id: true, name: true, avatarUrl: true } },
          conversationTags: { include: { tag: { select: { id: true, name: true, color: true } } }, take: 3 },
        },
        orderBy: { lastMessageAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.conversation.count({ where }),
    ])

    return NextResponse.json({ conversations, total, page, limit })
  } catch (error) {
    console.error('[CONVERSATIONS GET]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
