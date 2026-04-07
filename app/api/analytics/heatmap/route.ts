import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const workspaceId = session.user.workspaceId

    // Count only the FIRST inbound message per (conversation, day) in São Paulo timezone.
    // This shows when contacts first initiate contact each day, not all message volume.
    const rows = await db.$queryRaw<Array<{ day: number | bigint; hour: number | bigint; count: number | bigint }>>`
      SELECT
        EXTRACT(DOW FROM first_msg_time AT TIME ZONE 'America/Sao_Paulo')::int AS day,
        EXTRACT(HOUR FROM first_msg_time AT TIME ZONE 'America/Sao_Paulo')::int AS hour,
        COUNT(*)::int AS count
      FROM (
        SELECT
          "conversationId",
          DATE(COALESCE("sentAt", "createdAt") AT TIME ZONE 'America/Sao_Paulo') AS msg_date,
          MIN(COALESCE("sentAt", "createdAt")) AS first_msg_time
        FROM messages
        WHERE "workspaceId" = ${workspaceId}
          AND direction = 'INBOUND'
          AND COALESCE("sentAt", "createdAt") >= NOW() - INTERVAL '7 days'
        GROUP BY "conversationId", msg_date
      ) AS first_msgs
      GROUP BY day, hour
    `

    const normalized = rows.map(r => ({
      day: Number(r.day),
      hour: Number(r.hour),
      count: Number(r.count),
    }))

    return NextResponse.json(normalized)
  } catch (err) {
    console.error('[/api/analytics/heatmap GET]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
