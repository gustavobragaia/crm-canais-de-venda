import { NextRequest, NextResponse } from 'next/server'
import { verifyQStashSignature, parseQStashBody } from '@/lib/queue/verify'
import { detectHumanTakeover } from '@/lib/agents/vendedor-redis'

export const maxDuration = 15

type HumanTakeoverPayload = {
  conversationId: string
  textContent: string
}

export async function POST(req: NextRequest) {
  const authError = await verifyQStashSignature(req)
  if (authError) return authError

  const { conversationId, textContent } = await parseQStashBody<HumanTakeoverPayload>(req)

  const wasHuman = await detectHumanTakeover(conversationId, textContent)
  console.log(`[QUEUE/HUMAN-TAKEOVER] conversationId=${conversationId} wasHuman=${wasHuman}`)

  return NextResponse.json({ success: true, wasHuman })
}
