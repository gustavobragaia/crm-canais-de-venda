import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const config = await db.agentConfig.findUnique({
      where: { workspaceId: session.user.workspaceId },
    })

    return NextResponse.json({ config })
  } catch (error) {
    console.error('[AI AGENT GET]', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json() as {
      name?: string
      objective?: string
      tone?: string
      knowledgeAreas?: string
      isActive?: boolean
      businessHoursStart?: number | null
      businessHoursEnd?: number | null
      maxAiMessages?: number
      offHoursMessage?: string
      gender?: string
      personality?: string
      autoAssign?: boolean
      handoffInstructions?: string
    }

    const config = await db.agentConfig.upsert({
      where: { workspaceId: session.user.workspaceId },
      create: {
        workspaceId: session.user.workspaceId,
        name: body.name ?? 'Assistente',
        objective: body.objective ?? '',
        tone: body.tone ?? 'humanizado',
        knowledgeAreas: body.knowledgeAreas ?? '',
        isActive: body.isActive ?? false,
        businessHoursStart: body.businessHoursStart ?? null,
        businessHoursEnd: body.businessHoursEnd ?? null,
        maxAiMessages: body.maxAiMessages ?? 20,
        offHoursMessage: body.offHoursMessage ?? 'Olá! No momento estamos fora do horário de atendimento. Retornaremos em breve.',
        gender: body.gender ?? 'neutro',
        personality: body.personality ?? '',
        autoAssign: body.autoAssign ?? false,
        handoffInstructions: body.handoffInstructions ?? '',
      },
      update: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.objective !== undefined && { objective: body.objective }),
        ...(body.tone !== undefined && { tone: body.tone }),
        ...(body.knowledgeAreas !== undefined && { knowledgeAreas: body.knowledgeAreas }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.businessHoursStart !== undefined && { businessHoursStart: body.businessHoursStart }),
        ...(body.businessHoursEnd !== undefined && { businessHoursEnd: body.businessHoursEnd }),
        ...(body.maxAiMessages !== undefined && { maxAiMessages: body.maxAiMessages }),
        ...(body.offHoursMessage !== undefined && { offHoursMessage: body.offHoursMessage }),
        ...(body.gender !== undefined && { gender: body.gender }),
        ...(body.personality !== undefined && { personality: body.personality }),
        ...(body.autoAssign !== undefined && { autoAssign: body.autoAssign }),
        ...(body.handoffInstructions !== undefined && { handoffInstructions: body.handoffInstructions }),
      },
    })

    return NextResponse.json({ config })
  } catch (error) {
    console.error('[AI AGENT POST]', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
