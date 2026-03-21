import { NextRequest, NextResponse } from 'next/server'
import { processScrapingJob } from '@/lib/agents/buscador'

export async function POST(req: NextRequest) {
  const { jobId } = await req.json()
  if (!jobId) {
    return NextResponse.json({ error: 'jobId required' }, { status: 400 })
  }

  // Process asynchronously — don't await
  processScrapingJob(jobId).catch((err) =>
    console.error('[BUSCADOR] processScrapingJob error:', err),
  )

  return NextResponse.json({ started: true })
}
