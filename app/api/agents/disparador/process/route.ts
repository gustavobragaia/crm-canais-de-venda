import { NextRequest, NextResponse } from 'next/server'
import { processDispatch } from '@/lib/agents/disparador'

export async function POST(req: NextRequest) {
  const { dispatchId } = await req.json()
  if (!dispatchId) {
    return NextResponse.json({ error: 'dispatchId required' }, { status: 400 })
  }

  processDispatch(dispatchId).catch((err) =>
    console.error('[DISPARADOR] processDispatch error:', err),
  )

  return NextResponse.json({ started: true })
}
