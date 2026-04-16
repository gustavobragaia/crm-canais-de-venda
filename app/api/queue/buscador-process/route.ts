import { NextRequest, NextResponse } from 'next/server'
import { verifyQStashSignature, parseQStashBody } from '@/lib/queue/verify'
import { processScrapingJob } from '@/lib/agents/buscador'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const authError = await verifyQStashSignature(req)
  if (authError) return authError

  const { jobId } = await parseQStashBody<{ jobId: string }>(req)
  console.log(`[QUEUE/BUSCADOR-PROCESS] jobId=${jobId}`)

  await processScrapingJob(jobId)

  return NextResponse.json({ success: true })
}
