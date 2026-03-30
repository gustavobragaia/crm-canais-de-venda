import { Client, Receiver } from '@upstash/qstash'

if (!process.env.QSTASH_TOKEN) {
  console.warn('[QSTASH] QSTASH_TOKEN not set — queue publishing will be skipped in dev mode')
}

export const qstash = new Client({ token: process.env.QSTASH_TOKEN ?? 'placeholder' })

export const qstashReceiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY ?? '',
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY ?? '',
})

/**
 * Publica job na fila QStash. URL é construída automaticamente com NEXTAUTH_URL.
 * Em dev (sem QSTASH_TOKEN ou sem QSTASH_FORCE_PUBLISH), apenas loga — não faz HTTP.
 */
export async function publishToQueue(
  route: string,
  body: Record<string, unknown>,
  options?: {
    delay?: number        // segundos
    retries?: number      // default: 3
    deduplicationId?: string
    failureCallback?: string  // URL para chamar quando job falha permanentemente
  }
): Promise<void> {
  const isDevBypass =
    process.env.NODE_ENV !== 'production' && !process.env.QSTASH_FORCE_PUBLISH

  if (isDevBypass || !process.env.QSTASH_TOKEN) {
    console.log(`[QSTASH DEV] would publish to ${route}:`, JSON.stringify(body).slice(0, 200))
    return
  }

  const baseUrl = (process.env.NEXTAUTH_URL ?? '').replace(/\/$/, '')
  if (!baseUrl) throw new Error('NEXTAUTH_URL is required for QStash publishing')

  const result = await qstash.publishJSON({
    url: `${baseUrl}${route}`,
    body,
    retries: options?.retries ?? 3,
    ...(options?.delay !== undefined ? { delay: options.delay } : {}),
    ...(options?.deduplicationId ? { deduplicationId: options.deduplicationId } : {}),
    ...(options?.failureCallback ? { failureCallback: options.failureCallback } : {}),
  })
  console.log(`[QSTASH] job published jobId=${result.messageId} route=${route}`)
}
