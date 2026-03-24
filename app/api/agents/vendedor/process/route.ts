import { NextRequest, NextResponse } from 'next/server'
import { handleInboundWithDebounce } from '@/lib/agents/vendedor'

export const maxDuration = 60 // debounce (15s) + AI call + message send

export async function POST(req: NextRequest) {
  const { conversationId, message, workspaceId, debounceSeconds } = await req.json() as {
    conversationId: string
    message: string
    workspaceId: string
    debounceSeconds?: number
  }

  // Fire-and-forget: start debounce + processing
  handleInboundWithDebounce(conversationId, message, workspaceId, debounceSeconds)
    .catch(err => console.error('[VENDEDOR PROCESS] error:', err))

  return NextResponse.json({ started: true })
}
