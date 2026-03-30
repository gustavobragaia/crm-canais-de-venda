import { NextRequest, NextResponse } from 'next/server'
import { verifyQStashSignature, parseQStashBody } from '@/lib/queue/verify'
import { handleDispatchResponse } from '@/lib/agents/disparador'

export const maxDuration = 30

type DispatchResponsePayload = {
  conversationId: string
  workspaceId: string
}

export async function POST(req: NextRequest) {
  const authError = await verifyQStashSignature(req)
  if (authError) return authError

  const { conversationId, workspaceId } = await parseQStashBody<DispatchResponsePayload>(req)

  console.log(`[QUEUE/DISPATCH-RESPONSE] conversationId=${conversationId}`)

  await handleDispatchResponse(conversationId, workspaceId)

  return NextResponse.json({ success: true })
}
