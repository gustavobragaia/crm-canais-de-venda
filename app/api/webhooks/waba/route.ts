import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

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
// Papel simplificado: apenas status updates (sent/delivered/read/failed)
// Mensagens inbound chegam via UazAPI webhook (mesmo numero)
export async function POST(req: NextRequest) {
  // Always return 200 to Meta — otherwise Meta will retry
  try {
    const payload = await req.json()

    if (!payload.entry) {
      return NextResponse.json({ received: true })
    }

    for (const entry of payload.entry) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'messages') continue

        const value = change.value
        const phoneNumberId = value?.metadata?.phone_number_id
        if (!phoneNumberId) continue

        // Look up WabaChannel by phoneNumberId
        const wabaChannel = await db.wabaChannel.findFirst({
          where: { phoneNumberId, isActive: true },
        })
        if (!wabaChannel) continue

        // Handle status updates — sent → delivered → read → failed
        // These track delivery status of template messages sent by Disparador
        const statuses: Array<{ id: string; status: string; timestamp: string; errors?: Array<{ code: number; title: string }> }> = value?.statuses ?? []
        for (const status of statuses) {
          const message = await db.message.findFirst({
            where: { externalId: status.id },
          })
          if (!message) continue

          const updateData: Record<string, unknown> = {}
          if (status.status === 'delivered') {
            updateData.status = 'DELIVERED'
            updateData.deliveredAt = new Date(parseInt(status.timestamp) * 1000)
          } else if (status.status === 'read') {
            updateData.status = 'READ'
            updateData.readAt = new Date(parseInt(status.timestamp) * 1000)
          } else if (status.status === 'failed') {
            updateData.status = 'FAILED'
            if (status.errors?.length) {
              console.error('[WABA WEBHOOK] Message failed:', status.id, status.errors)
            }
          }

          if (Object.keys(updateData).length > 0) {
            await db.message.update({
              where: { id: message.id },
              data: updateData,
            }).catch((err) => console.error('[WABA WEBHOOK] Status update failed:', err))
          }
        }

        // Handle errors at the value level (rate limits, invalid numbers, etc.)
        if (value?.errors) {
          console.error('[WABA WEBHOOK] API errors:', JSON.stringify(value.errors))
        }

        // Inbound messages: log only — actual processing happens via UazAPI webhook
        // (same phone number is connected on both WABA and UazAPI)
        const messages = value?.messages ?? []
        if (messages.length > 0) {
          console.log(`[WABA WEBHOOK] Received ${messages.length} inbound message(s) on ${phoneNumberId} — handled by UazAPI`)
        }
      }
    }
  } catch (err) {
    console.error('[WABA WEBHOOK]', err)
  }

  return NextResponse.json({ received: true })
}
