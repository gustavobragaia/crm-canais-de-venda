import { NextRequest, NextResponse } from 'next/server'
import { verifyQStashSignature, parseQStashBody } from '@/lib/queue/verify'
import {
  getDebounceBuffer,
  clearDebounceBuffer,
  getDebounceTimestamp,
} from '@/lib/agents/vendedor-redis'
import { processAiResponse } from '@/lib/agents/vendedor'

export const maxDuration = 60

type VendedorCheckPayload = {
  conversationId: string
  workspaceId: string
  scheduledAt: number
}

export async function POST(req: NextRequest) {
  const authError = await verifyQStashSignature(req)
  if (authError) return authError

  const { conversationId, workspaceId, scheduledAt } =
    await parseQStashBody<VendedorCheckPayload>(req)

  console.log(`[QUEUE/VENDEDOR-CHECK] conversationId=${conversationId} scheduledAt=${scheduledAt}`)

  // Debounce: check if a newer message arrived after this job was scheduled
  const storedTs = await getDebounceTimestamp(conversationId)
  if (storedTs !== null && storedTs > scheduledAt) {
    console.log(`[QUEUE/VENDEDOR-CHECK] newer message exists (${storedTs} > ${scheduledAt}), skipping`)
    return NextResponse.json({ skipped: true, reason: 'newer-message' })
  }

  const buffer = await getDebounceBuffer(conversationId)
  if (!buffer.length) {
    return NextResponse.json({ skipped: true, reason: 'empty-buffer' })
  }

  // Clear buffer BEFORE processing to avoid duplicate sends on retry
  await clearDebounceBuffer(conversationId)

  const concatenated = buffer.join(' ')
  console.log(`[QUEUE/VENDEDOR-CHECK] processing ${buffer.length} messages for convId=${conversationId}`)

  await processAiResponse(workspaceId, conversationId, concatenated)

  return NextResponse.json({ success: true, processed: buffer.length })
}
