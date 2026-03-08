import { NextRequest, NextResponse } from 'next/server'
import { inngest } from '@/lib/inngest'
import { verifyEvolutionSignature, type EvolutionWebhookPayload } from '@/lib/integrations/evolution'

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()

    // Optional HMAC verification — only enforced when secret is configured
    if (process.env.EVOLUTION_WEBHOOK_SECRET) {
      const signature = req.headers.get('x-hub-signature-256') ?? ''
      if (!verifyEvolutionSignature(body, signature, process.env.EVOLUTION_WEBHOOK_SECRET)) {
        return NextResponse.json({ error: 'Assinatura inválida.' }, { status: 401 })
      }
    }

    const payload = JSON.parse(body) as EvolutionWebhookPayload

    if (payload.event === 'MESSAGES_UPSERT') {
      await inngest.send({ name: 'evolution/message.received', data: payload })
    } else if (payload.event === 'CONNECTION_UPDATE') {
      await inngest.send({ name: 'evolution/connection.update', data: payload })
    } else if (payload.event === 'QRCODE_UPDATED') {
      await inngest.send({ name: 'evolution/qrcode.updated', data: payload })
    }
    // SEND_MESSAGE echoes are silently dropped

    return NextResponse.json({ status: 'EVENT_RECEIVED' })
  } catch (error) {
    console.error('[EVOLUTION WEBHOOK]', error)
    // Always return 200 — Evolution retries on non-200 responses
    return NextResponse.json({ status: 'ERROR' })
  }
}
