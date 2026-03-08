import { createHmac } from 'crypto'

const BASE_URL = process.env.EVOLUTION_API_URL?.replace(/\/$/, '') ?? ''
const API_KEY = process.env.EVOLUTION_API_KEY ?? ''

const WEBHOOK_EVENTS = ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED']

// ---- Types ----

export interface EvolutionMessageUpsertPayload {
  event: 'MESSAGES_UPSERT'
  instance: string
  data: {
    key: {
      remoteJid: string
      fromMe: boolean
      id: string
    }
    pushName?: string
    message?: {
      conversation?: string
      extendedTextMessage?: { text: string }
      imageMessage?: { caption?: string }
      audioMessage?: Record<string, unknown>
      documentMessage?: { title?: string }
    }
    messageType: string
    messageTimestamp: number
  }
}

export interface EvolutionConnectionUpdatePayload {
  event: 'CONNECTION_UPDATE'
  instance: string
  data: {
    state: 'open' | 'connecting' | 'close'
    statusReason?: number
  }
}

export interface EvolutionQRCodeUpdatedPayload {
  event: 'QRCODE_UPDATED'
  instance: string
  data: {
    qrcode: {
      base64: string
      code: string
    }
  }
}

export type EvolutionWebhookPayload =
  | EvolutionMessageUpsertPayload
  | EvolutionConnectionUpdatePayload
  | EvolutionQRCodeUpdatedPayload
  | { event: 'SEND_MESSAGE'; instance: string; data: unknown }

// ---- Internal fetch helper ----

async function evolutionFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      apikey: API_KEY,
      ...(options?.headers ?? {}),
    },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Evolution API error [${res.status}] ${path}: ${body}`)
  }

  return res.json() as Promise<T>
}

// ---- Public API ----

export async function createEvolutionInstance(
  instanceName: string
): Promise<{ qrcode?: { base64: string; code: string } }> {
  return evolutionFetch<{ qrcode?: { base64: string; code: string } }>('/instance/create', {
    method: 'POST',
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
    }),
  })
}

export async function setEvolutionWebhook(
  instanceName: string,
  webhookUrl: string
): Promise<void> {
  await evolutionFetch<unknown>(`/webhook/set/${instanceName}`, {
    method: 'POST',
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        webhook_by_events: false,
        webhook_base64: true,
        events: WEBHOOK_EVENTS,
      },
    }),
  })
}

export async function getEvolutionQR(
  instanceName: string
): Promise<{ base64: string; code: string }> {
  const data = await evolutionFetch<{ base64?: string; code?: string; qrcode?: { base64: string; code: string } }>(
    `/instance/connect/${instanceName}`
  )
  // Evolution may return either { base64, code } or { qrcode: { base64, code } }
  return {
    base64: data.base64 ?? data.qrcode?.base64 ?? '',
    code: data.code ?? data.qrcode?.code ?? '',
  }
}

export async function getEvolutionConnectionState(
  instanceName: string
): Promise<'open' | 'connecting' | 'close'> {
  const data = await evolutionFetch<{ instance?: { state?: string }; state?: string }>(
    `/instance/connectionState/${instanceName}`
  )
  const raw = data.instance?.state ?? data.state ?? 'close'
  if (raw === 'open') return 'open'
  if (raw === 'connecting') return 'connecting'
  return 'close'
}

export async function sendEvolutionMessage(
  instanceName: string,
  to: string,
  text: string
): Promise<string> {
  const data = await evolutionFetch<{ key?: { id?: string } }>(
    `/message/sendText/${instanceName}`,
    {
      method: 'POST',
      body: JSON.stringify({ number: to, text }),
    }
  )
  return data.key?.id ?? ''
}

export async function logoutEvolutionInstance(instanceName: string): Promise<void> {
  await evolutionFetch<unknown>(`/instance/logout/${instanceName}`, { method: 'DELETE' })
}

export async function deleteEvolutionInstance(instanceName: string): Promise<void> {
  await evolutionFetch<unknown>(`/instance/delete/${instanceName}`, { method: 'DELETE' })
}

export function verifyEvolutionSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected = createHmac('sha256', secret).update(payload).digest('hex')
  return `sha256=${expected}` === signature
}
