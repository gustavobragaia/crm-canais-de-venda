import { NextRequest, NextResponse } from 'next/server'
import { verifyQStashSignature, parseQStashBody } from '@/lib/queue/verify'
import type { MessageIngestPayload } from '@/lib/queue/types'
import { processMessageIngest } from '@/lib/queue/message-ingest-logic'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const authError = await verifyQStashSignature(req)
  if (authError) return authError

  const payload = await parseQStashBody<MessageIngestPayload>(req)

  console.log(`[QUEUE/MESSAGE-INGEST] provider=${payload.provider} externalId=${payload.externalId} direction=${payload.direction}`)

  await processMessageIngest(payload)

  return NextResponse.json({ success: true })
}
