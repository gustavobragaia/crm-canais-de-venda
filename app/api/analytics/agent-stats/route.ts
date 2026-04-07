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

    const [users, conversationsThisMonth, activeConversations, outboundMessages] = await Promise.all([
      db.user.findMany({
        where: { workspaceId, isActive: true },
        select: { id: true, name: true, role: true },
      }),
      db.conversation.findMany({
        where: { workspaceId, assignedToId: { not: null }, lastMessageAt: { gte: startOfMonth } },
        select: {
          id: true,
          assignedToId: true,
          status: true,
          pipelineStage: true,
          createdAt: true,
        },
      }),
      db.conversation.findMany({
        where: {
          workspaceId,
          assignedToId: { not: null },
          status: { in: ['IN_PROGRESS', 'ASSIGNED'] },
        },
        select: { assignedToId: true },
      }),
      // All OUTBOUND messages by agents this month (for avg response time)
      db.message.findMany({
        where: {
          workspaceId,
          direction: 'OUTBOUND',
          sentById: { not: null },
          createdAt: { gte: startOfMonth },
        },
        select: {
          id: true,
          sentById: true,
          conversationId: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
    ])

    // Collect conversation IDs that appear in outbound messages for inbound lookup
    const relevantConversationIds = [...new Set(outboundMessages.map(m => m.conversationId))]

    // Fetch INBOUND messages from those conversations (within month) for response-time calculation
    const inboundMessages = relevantConversationIds.length > 0
      ? await db.message.findMany({
          where: {
            workspaceId,
            direction: 'INBOUND',
            conversationId: { in: relevantConversationIds },
            createdAt: { gte: startOfMonth },
          },
          select: {
            id: true,
            conversationId: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        })
      : []

    // Build inbound lookup: conversationId → sorted list of createdAt timestamps
    const inboundByConv = new Map<string, Date[]>()
    for (const m of inboundMessages) {
      const list = inboundByConv.get(m.conversationId) ?? []
      list.push(m.createdAt)
      inboundByConv.set(m.conversationId, list)
    }

    // For each user: compute response times
    // For each OUTBOUND message by the user, find the latest INBOUND before it in the same conv.
    // Response time = outbound.createdAt - that inbound.createdAt (in minutes).
    const responseTimesByUser = new Map<string, number[]>()

    for (const out of outboundMessages) {
      if (!out.sentById) continue
      const inboundList = inboundByConv.get(out.conversationId)
      if (!inboundList) continue

      // Binary-search for last inbound before out.createdAt
      let lo = 0, hi = inboundList.length - 1, found: Date | null = null
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2)
        if (inboundList[mid] < out.createdAt) {
          found = inboundList[mid]
          lo = mid + 1
        } else {
          hi = mid - 1
        }
      }

      if (found) {
        const diffMin = (out.createdAt.getTime() - found.getTime()) / 60000
        const list = responseTimesByUser.get(out.sentById) ?? []
        list.push(diffMin)
        responseTimesByUser.set(out.sentById, list)
      }
    }

    const stats = users.map(user => {
      const userConvs = conversationsThisMonth.filter(c => c.assignedToId === user.id)

      // Meetings: pipelineStage contains "reunião" or "reuniao" (case-insensitive)
      const meetingsScheduled = userConvs.filter(c => {
        const stage = (c.pipelineStage ?? '').toLowerCase()
        return stage.includes('reuni') // covers "reunião" and "reuniao"
      }).length

      // Closed contracts: pipelineStage contains "contrato" or "fechado" (case-insensitive)
      const closedContracts = userConvs.filter(c => {
        const stage = (c.pipelineStage ?? '').toLowerCase()
        return stage.includes('contrato') || stage.includes('fechado')
      }).length

      const active = activeConversations.filter(c => c.assignedToId === user.id).length

      // Avg response time in minutes
      const responseTimes = responseTimesByUser.get(user.id) ?? []
      const avgResponseTimeMin =
        responseTimes.length > 0
          ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
          : null

      return {
        userId: user.id,
        name: user.name,
        role: user.role,
        conversations: userConvs.length,
        meetingsScheduled,
        closedContracts,
        avgResponseTimeMin,
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
