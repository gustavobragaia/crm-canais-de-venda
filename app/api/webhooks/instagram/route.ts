import { NextRequest, NextResponse } from 'next/server'
import { inngest } from '@/lib/inngest'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ error: 'Verification failed' }, { status: 403 })
}

export async function POST(req: NextRequest) {
  const payload = await req.json()

  // Only process Instagram messages
  if (payload.object === 'instagram') {
    await inngest.send({ name: 'instagram/message.received', data: payload })
  }

  return NextResponse.json({ status: 'EVENT_RECEIVED' })
}
