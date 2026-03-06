import { NextRequest, NextResponse } from 'next/server'
import { inngest } from '@/lib/inngest'
import { verifyWhatsAppSignature } from '@/lib/integrations/whatsapp'

// Meta webhook verification
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

// Receive messages
export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get('x-hub-signature-256') ?? ''

  // Verify signature (skip in dev if secret not set)
  if (process.env.WHATSAPP_APP_SECRET && !verifyWhatsAppSignature(body, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // CRITICAL: Return 200 immediately (Meta requires < 20s)
  const payload = JSON.parse(body)

  // Send to Inngest for async processing
  await inngest.send({ name: 'whatsapp/message.received', data: payload })

  return NextResponse.json({ status: 'EVENT_RECEIVED' })
}
