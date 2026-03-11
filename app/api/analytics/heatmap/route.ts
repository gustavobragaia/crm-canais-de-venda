import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const workspaceId = session.user.workspaceId

    const rows = await db.$queryRaw<Array<{ day: number | bigint; hour: number | bigint; count: number | bigint }>>`
      SELECT
        EXTRACT(DOW FROM "createdAt" AT TIME ZONE 'America/Sao_Paulo')::int AS day,
        EXTRACT(HOUR FROM "createdAt" AT TIME ZONE 'America/Sao_Paulo')::int AS hour,
        COUNT(*)::int AS count
      FROM messages
      WHERE "workspaceId" = ${workspaceId}
        AND direction = 'INBOUND'
        AND "createdAt" >= NOW() - INTERVAL '30 days'
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
