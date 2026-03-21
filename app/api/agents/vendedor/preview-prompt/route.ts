import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { buildSystemPrompt } from '@/lib/agents/vendedor-prompt'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.workspaceId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const body = await req.json()

  const prompt = buildSystemPrompt({
    agentName: body.agentName ?? null,
    tone: body.tone ?? 'informal',
    businessName: body.businessName ?? null,
    businessDescription: body.businessDescription ?? null,
    targetAudience: body.targetAudience ?? null,
    differentials: body.differentials ?? null,
    productsServices: body.productsServices ?? [],
    commonObjections: body.commonObjections ?? [],
    objectives: body.objectives ?? ['qualify', 'schedule'],
    calendarUrl: body.calendarUrl ?? null,
    systemPrompt: body.systemPrompt ?? null,
    useCustomPrompt: false, // Always show auto-generated for preview
  })

  return NextResponse.json({ prompt })
}
