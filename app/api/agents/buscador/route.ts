  import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { canSearch, processScrapingJob } from '@/lib/agents/buscador'
import { publishToQueue } from '@/lib/qstash'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.workspaceId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const { query, city, zip, maxLeads: rawMaxLeads } = await req.json()
  if (!query || !city) {
    return NextResponse.json({ error: 'query e city são obrigatórios' }, { status: 400 })
  }

  const maxLeads = Math.min(Math.max(Number(rawMaxLeads) || 20, 1), 100)
  const workspaceId = session.user.workspaceId

  // Check if can search
  const { allowed, isFree } = await canSearch(workspaceId, maxLeads)
  if (!allowed) {
    const tokensNeeded = Math.ceil(maxLeads / 2)
    return NextResponse.json({ error: `Saldo insuficiente. Você precisa de ${tokensNeeded} tokens para buscar ${maxLeads} leads.` }, { status: 402 })
  }

  // Create job
  const job = await db.scrapingJob.create({
    data: { workspaceId, query, city, zip: zip || null, maxLeads },
  })

  // Enqueue via QStash (durable, with retries)
  try {
    await publishToQueue('/api/queue/buscador-process', { jobId: job.id }, { retries: 2 })
  } catch (err) {
    console.error('[BUSCADOR] QStash publish failed, falling back:', err)
    processScrapingJob(job.id).catch((e) => console.error('[BUSCADOR] fallback error:', e))
  }

  return NextResponse.json({ jobId: job.id, isFree })
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.workspaceId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const workspaceId = session.user.workspaceId

  const [jobs, workspace] = await Promise.all([
    db.scrapingJob.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        query: true,
        city: true,
        status: true,
        totalFound: true,
        validLeads: true,
        listId: true,
        createdAt: true,
        completedAt: true,
        error: true,
      },
    }),
    db.workspace.findUnique({
      where: { id: workspaceId },
      select: { hasUsedFreeScraping: true },
    }),
  ])

  return NextResponse.json({ jobs, hasUsedFreeScraping: workspace?.hasUsedFreeScraping ?? false })
}
