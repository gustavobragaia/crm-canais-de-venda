import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspaceId = session.user.workspaceId
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const [
    totalUnassigned,
    totalInProgress,
    totalResolved,
    totalConversations,
    leadsThisMonth,
    closedLeads,
    statusGroups,
    agentGroups,
    channelGroups,
    workspaceData,
    allUsers,
    allChannels,
  ] = await Promise.all([
    db.conversation.count({ where: { workspaceId, status: 'UNASSIGNED' } }),
    db.conversation.count({ where: { workspaceId, status: 'IN_PROGRESS' } }),
    db.conversation.count({ where: { workspaceId, status: 'RESOLVED' } }),
    db.conversation.count({ where: { workspaceId } }),
    db.conversation.count({ where: { workspaceId, createdAt: { gte: startOfMonth } } }),
    db.lead.count({ where: { workspaceId, convertedAt: { not: null } } }),
    db.conversation.groupBy({
      by: ['status'],
      where: { workspaceId },
      _count: { id: true },
    }),
    db.conversation.groupBy({
      by: ['assignedToId'],
      where: { workspaceId, assignedToId: { not: null } },
      _count: { id: true },
    }),
    db.conversation.groupBy({
      by: ['channelId'],
      where: { workspaceId, createdAt: { gte: startOfMonth } },
      _count: { id: true },
    }),
    db.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        conversationsThisMonth: true,
        maxConversationsPerMonth: true,
        subscriptionStatus: true,
        trialEndsAt: true,
      },
    }),
    db.user.findMany({
      where: { workspaceId, isActive: true },
      select: { id: true, name: true, role: true },
    }),
    db.channel.findMany({
      where: { workspaceId },
      select: { id: true, type: true, name: true },
    }),
  ])

  // Map agent stats with user names
  const userMap = Object.fromEntries(allUsers.map((u) => [u.id, u]))
  const agentStats = agentGroups.map((g) => ({
    userId: g.assignedToId,
    name: g.assignedToId ? (userMap[g.assignedToId]?.name ?? 'Desconhecido') : 'Não atribuído',
    role: g.assignedToId ? (userMap[g.assignedToId]?.role ?? '') : '',
    conversations: g._count.id,
  })).sort((a, b) => b.conversations - a.conversations)

  // Map channel stats with type
  const channelMap = Object.fromEntries(allChannels.map((c) => [c.id, c]))
  const trafficByChannel = channelGroups.reduce<Record<string, number>>((acc, g) => {
    const type = channelMap[g.channelId]?.type ?? 'UNKNOWN'
    acc[type] = (acc[type] ?? 0) + g._count.id
    return acc
  }, {})

  // Status breakdown as map
  const statusMap = Object.fromEntries(statusGroups.map((s) => [s.status, s._count.id]))

  const attended = (statusMap['ASSIGNED'] ?? 0) + (statusMap['IN_PROGRESS'] ?? 0) + (statusMap['RESOLVED'] ?? 0) + (statusMap['WAITING_CLIENT'] ?? 0)
  const notAttended = statusMap['UNASSIGNED'] ?? 0
  const totalAll = attended + notAttended

  return NextResponse.json({
    unassigned: totalUnassigned,
    inProgress: totalInProgress,
    resolved: totalResolved,
    total: totalConversations,
    leadsThisMonth,
    closedLeads,
    attendedPercent: totalAll > 0 ? Math.round((attended / totalAll) * 100) : 0,
    notAttendedPercent: totalAll > 0 ? Math.round((notAttended / totalAll) * 100) : 0,
    trafficByChannel,
    agentStats,
    conversationsThisMonth: workspaceData?.conversationsThisMonth ?? 0,
    maxConversationsPerMonth: workspaceData?.maxConversationsPerMonth ?? 0,
    subscriptionStatus: workspaceData?.subscriptionStatus,
    trialEndsAt: workspaceData?.trialEndsAt,
  })
}
