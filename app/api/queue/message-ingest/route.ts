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

  try {
    await processMessageIngest(payload)
    console.log(`[QUEUE/MESSAGE-INGEST] completed successfully externalId=${payload.externalId}`)
  } catch (err) {
    console.error(`[QUEUE/MESSAGE-INGEST] FATAL ERROR externalId=${payload.externalId}`, err)
    throw err
  }

  return NextResponse.json({ success: true })
}
