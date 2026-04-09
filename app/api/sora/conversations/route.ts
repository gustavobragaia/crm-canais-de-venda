import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  const session = await auth()
  if (!session?.user?.workspaceId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const workspaceId = session.user.workspaceId

  const conversations = await db.conversation.findMany({
    where: { workspaceId, aiSalesEnabled: true },
    select: {
      id: true,
      contactName: true,
      aiSalesMessageCount: true,
      qualificationScore: true,
      pipelineStage: true,
      channel: { select: { type: true } },
    },
    orderBy: { lastMessageAt: 'desc' },
    take: 50,
  })

  const mapped = conversations.map(c => ({
    id: c.id,
    contactName: c.contactName,
    channelType: c.channel?.type ?? 'WHATSAPP',
    aiSalesMessageCount: c.aiSalesMessageCount,
    qualificationScore: c.qualificationScore,
    pipelineStage: c.pipelineStage,
  }))

  // Compute stats
  const scored = mapped.filter(c => c.qualificationScore !== null)
  const avgScore = scored.length
    ? scored.reduce((s, c) => s + (c.qualificationScore ?? 0), 0) / scored.length
    : 0
  const qualified = scored.filter(c => (c.qualificationScore ?? 0) >= 7).length
  const qualificationRate = scored.length ? Math.round((qualified / scored.length) * 100) : 0

  return NextResponse.json({
    conversations: mapped,
    stats: {
      activeConversations: mapped.length,
      avgScore: Math.round(avgScore * 10) / 10,
      handoffsThisMonth: 0, // TODO: track in DB
      qualificationRate,
    },
  })
}
