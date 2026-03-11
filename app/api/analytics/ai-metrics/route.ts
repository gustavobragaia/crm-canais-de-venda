import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const workspaceId = session.user.workspaceId
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const [aiConversations, aiMessages, allConvThisMonth] = await Promise.all([
      db.conversation.count({
        where: { workspaceId, aiMessageCount: { gt: 0 }, createdAt: { gte: startOfMonth } },
      }),
      db.message.count({
        where: { workspaceId, aiGenerated: true, createdAt: { gte: startOfMonth } },
      }),
      db.conversation.findMany({
        where: { workspaceId, createdAt: { gte: startOfMonth } },
        select: { id: true, tags: true },
      }),
    ])

    const aiQualified = allConvThisMonth.filter(c => c.tags.includes('QUALIFICADO')).length
    const aiTransferred = allConvThisMonth.filter(c => c.tags.includes('TRANSFERIDO_HUMANO')).length
    const hoursSaved = Math.round((aiMessages * 3) / 60)
    const qualificationRate = aiConversations > 0 ? Math.round((aiQualified / aiConversations) * 100) : 0

    return NextResponse.json({
      aiConversations,
      aiMessages,
      hoursSaved,
      aiQualified,
      aiTransferred,
      qualificationRate,
    })
  } catch (err) {
    console.error('[/api/analytics/ai-metrics GET]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
