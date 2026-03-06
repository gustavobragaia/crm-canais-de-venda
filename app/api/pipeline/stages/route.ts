import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const stages = await db.pipelineStage.findMany({
    where: { workspaceId: session.user.workspaceId },
    orderBy: { position: 'asc' },
  })

  return NextResponse.json({ stages })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Apenas admins podem criar etapas.' }, { status: 403 })
  }

  const { name, color, isFinal } = await req.json()

  const maxPosition = await db.pipelineStage.aggregate({
    where: { workspaceId: session.user.workspaceId },
    _max: { position: true },
  })

  const stage = await db.pipelineStage.create({
    data: {
      workspaceId: session.user.workspaceId,
      name,
      color: color ?? '#3B82F6',
      position: (maxPosition._max.position ?? -1) + 1,
      isFinal: isFinal ?? false,
    },
  })

  return NextResponse.json(stage, { status: 201 })
}
