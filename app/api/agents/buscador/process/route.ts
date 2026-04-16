import { NextRequest, NextResponse } from 'next/server'
import { processScrapingJob } from '@/lib/agents/buscador'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const { jobId } = await req.json()
  if (!jobId) {
    return NextResponse.json({ error: 'jobId required' }, { status: 400 })
  }

  await processScrapingJob(jobId)

  return NextResponse.json({ started: true })
}
