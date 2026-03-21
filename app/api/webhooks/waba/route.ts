import { NextRequest, NextResponse } from 'next/server'

// WABA webhook verification (GET)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.WABA_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ error: 'Verification failed' }, { status: 403 })
}

// WABA webhook events (POST)
export async function POST(req: NextRequest) {
  const payload = await req.json()

  // Handle message status updates
  if (payload.entry) {
    for (const entry of payload.entry) {
      for (const change of entry.changes ?? []) {
        if (change.field === 'messages') {
          const statuses = change.value?.statuses ?? []
          for (const status of statuses) {
            console.info(`[WABA WEBHOOK] Message ${status.id}: ${status.status}`)
          }
        }
      }
    }
  }

  return NextResponse.json({ received: true })
}
