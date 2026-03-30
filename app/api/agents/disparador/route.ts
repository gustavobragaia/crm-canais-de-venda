import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { canConsumeTokens } from '@/lib/billing/tokenService'
import { publishToQueue } from '@/lib/qstash'
import { dispatchRateLimit } from '@/lib/ratelimit'

export const maxDuration = 30 // reduced: now just enqueues, doesn't process

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.workspaceId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const { success: rateLimitOk } = await dispatchRateLimit.limit(session.user.workspaceId)
  if (!rateLimitOk) {
    return NextResponse.json({ error: 'Muitos disparos recentes. Aguarde 1 minuto.' }, { status: 429 })
  }

  const { wabaChannelId, templateName, listIds, enableSdr } = await req.json() as {
    wabaChannelId: string
    templateName: string
    listIds: string[]
    enableSdr?: boolean
  }

  if (!wabaChannelId || !templateName || !listIds?.length) {
    return NextResponse.json({ error: 'wabaChannelId, templateName e listIds são obrigatórios.' }, { status: 400 })
  }

  const workspaceId = session.user.workspaceId

  // Count total contacts across all selected lists
  const totalContacts = await db.dispatchListContact.count({
    where: { listId: { in: listIds } },
  })

  if (totalContacts === 0) {
    return NextResponse.json({ error: 'Nenhum contato nas listas selecionadas.' }, { status: 400 })
  }

  // Check token balance
  const hasTokens = await canConsumeTokens(workspaceId, totalContacts)
  if (!hasTokens) {
    return NextResponse.json({ error: `Saldo insuficiente. Necessário: ${totalContacts} tokens.` }, { status: 402 })
  }

  // Create dispatch (use first list as primary, but contacts come from all)
  const dispatch = await db.templateDispatch.create({
    data: {
      workspaceId,
      wabaChannelId,
      dispatchListId: listIds[0],
      templateName,
      totalRecipients: totalContacts,
      enableSdr: enableSdr ?? false,
    },
  })

  // Enqueue via QStash (durable, with retries)
  try {
    await publishToQueue('/api/queue/dispatch-fan-out', { dispatchId: dispatch.id }, { retries: 1 })
  } catch (err) {
    // Fallback: fire-and-forget HTTP (como antes)
    console.error('[DISPARADOR] QStash publish failed, falling back to fire-and-forget:', err)
    const baseUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, '') ?? ''
    fetch(`${baseUrl}/api/agents/disparador/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dispatchId: dispatch.id }),
    }).catch(() => {})
  }

  return NextResponse.json({ dispatchId: dispatch.id, totalContacts })
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.workspaceId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const dispatches = await db.templateDispatch.findMany({
    where: { workspaceId: session.user.workspaceId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      templateName: true,
      status: true,
      totalRecipients: true,
      sentCount: true,
      failedCount: true,
      respondedCount: true,
      tokensConsumed: true,
      createdAt: true,
      completedAt: true,
      dispatchList: { select: { name: true } },
    },
  })

  return NextResponse.json({ dispatches })
}
