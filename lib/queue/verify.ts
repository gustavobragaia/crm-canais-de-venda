import { qstashReceiver } from '@/lib/qstash'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Verifica assinatura QStash. Usar no início de cada worker route.
 * Em dev (sem QSTASH_CURRENT_SIGNING_KEY), bypass automático.
 * Retorna null se válido/bypass, ou NextResponse 401 se inválido.
 */
export async function verifyQStashSignature(req: NextRequest): Promise<NextResponse | null> {
  if (!process.env.QSTASH_CURRENT_SIGNING_KEY) {
    console.warn('[QUEUE] QStash signature verification skipped (dev mode — no signing key)')
    return null
  }

  const signature = req.headers.get('upstash-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing QStash signature' }, { status: 401 })
  }

  const body = await req.clone().text()

  try {
    const isValid = await qstashReceiver.verify({ signature, body })
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid QStash signature' }, { status: 401 })
    }
    return null
  } catch (err) {
    console.error('[QUEUE] QStash signature verification error:', err)
    return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 })
  }
}

/**
 * Parse do body JSON da request. Safe para usar após verifyQStashSignature.
 */
export async function parseQStashBody<T>(req: NextRequest): Promise<T> {
  const body = await req.text()
  return JSON.parse(body) as T
}
