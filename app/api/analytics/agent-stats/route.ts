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

    const [users, conversationsThisMonth, messagesSentThisMonth, activeConversations] = await Promise.all([
      db.user.findMany({
        where: { workspaceId, isActive: true },
        select: { id: true, name: true, role: true },
      }),
      db.conversation.findMany({
        where: { workspaceId, assignedToId: { not: null }, createdAt: { gte: startOfMonth } },
        select: {
          id: true,
          assignedToId: true,
          status: true,
          assignedAt: true,
          createdAt: true,
          aiMessageCount: true,
        },
      }),
      db.message.findMany({
        where: {
          workspaceId,
          direction: 'OUTBOUND',
          aiGenerated: false,
          sentById: { not: null },
          createdAt: { gte: startOfMonth },
        },
        select: { sentById: true },
      }),
      db.conversation.findMany({
        where: {
          workspaceId,
          assignedToId: { not: null },
          status: { in: ['IN_PROGRESS', 'ASSIGNED'] },
        },
        select: { assignedToId: true },
      }),
    ])

    const stats = users.map(user => {
      const userConvs = conversationsThisMonth.filter(c => c.assignedToId === user.id)
      const resolved = userConvs.filter(c => c.status === 'RESOLVED').length
      const resolutionRate = userConvs.length > 0 ? Math.round((resolved / userConvs.length) * 100) : 0
      const messagesSent = messagesSentThisMonth.filter(m => m.sentById === user.id).length
      const aiAssisted = userConvs.filter(c => c.aiMessageCount > 0).length

      // avg first response in minutes: (assignedAt - createdAt) for convs with both dates
      const responseTimes = userConvs
        .filter(c => c.assignedAt)
        .map(c => (c.assignedAt!.getTime() - c.createdAt.getTime()) / 60000)
      const avgFirstResponseMin =
        responseTimes.length > 0
          ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
          : null

      const active = activeConversations.filter(c => c.assignedToId === user.id).length

      return {
        userId: user.id,
        name: user.name,
        role: user.role,
        conversations: userConvs.length,
        resolved,
        resolutionRate,
        messagesSent,
        avgFirstResponseMin,
        aiAssistedConversations: aiAssisted,
        activeConversations: active,
      }
    })

    // Sort by conversations desc
    stats.sort((a, b) => b.conversations - a.conversations)

    return NextResponse.json(stats)
  } catch (err) {
    console.error('[/api/analytics/agent-stats GET]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
