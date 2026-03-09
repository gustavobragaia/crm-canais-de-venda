const BASE_URL = process.env.UAZAPI_BASE_URL?.replace(/\/$/, '') ?? ''
const ADMIN_TOKEN = process.env.UAZAPI_ADMIN_TOKEN ?? ''

// ---- Types ----

export interface UazapiInstance {
  id: string
  token: string
  status: 'connected' | 'connecting' | 'disconnected'
  qrcode?: string
  name: string
  profileName?: string
}

export interface UazapiWebhookMessagePayload {
  EventType: 'messages'
  instanceName: string  // display name (e.g. "cHzfhm")
  token: string         // instance token — use this to look up the channel
  owner: string
  message: {
    messageid: string
    chatid: string
    sender: string
    senderName?: string
    fromMe: boolean
    text: string
    content?: string
    messageType: string
    messageTimestamp: number
    isGroup: boolean
  }
}

export interface UazapiWebhookConnectionPayload {
  EventType: 'connection'
  instanceName: string
  token: string
  data?: {
    status: 'connected' | 'connecting' | 'disconnected'
    instance?: UazapiInstance
  }
}

export type UazapiWebhookPayload =
  | UazapiWebhookMessagePayload
  | UazapiWebhookConnectionPayload
  | { EventType: string; instanceName: string; token: string; [key: string]: unknown }

// ---- Internal fetch helpers ----

async function uazapiFetch<T>(path: string, options?: RequestInit & { adminAuth?: boolean; instanceToken?: string }): Promise<T> {
  const { adminAuth, instanceToken, ...fetchOptions } = options ?? {}
  const url = `${BASE_URL}${path}`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string> ?? {}),
  }

  if (adminAuth) {
    headers['admintoken'] = ADMIN_TOKEN
  } else if (instanceToken) {
    headers['token'] = instanceToken
  }

  const res = await fetch(url, {
    ...fetchOptions,
    signal: AbortSignal.timeout(15000),
    headers,
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`UazAPI error [${res.status}] ${path}: ${body}`)
  }

  return res.json() as Promise<T>
}

// ---- Public API ----

export async function createUazapiInstance(
  name: string
): Promise<{ id: string; token: string }> {
  const data = await uazapiFetch<{ instance: UazapiInstance; token: string }>(
    '/instance/init',
    { method: 'POST', adminAuth: true, body: JSON.stringify({ name }) }
  )
  return { id: data.instance.id, token: data.token }
}

export async function connectUazapiInstance(
  instanceToken: string
): Promise<{ qrcode?: string }> {
  const data = await uazapiFetch<{ instance: UazapiInstance }>(
    '/instance/connect',
    { method: 'POST', instanceToken }
  )
  return { qrcode: data.instance.qrcode }
}

export async function getUazapiStatus(
  instanceToken: string
): Promise<{ status: 'connected' | 'connecting' | 'disconnected'; qrcode?: string }> {
  const data = await uazapiFetch<{ instance: UazapiInstance; status: { connected: boolean; loggedIn: boolean } }>(
    '/instance/status',
    { instanceToken }
  )
  return {
    status: data.instance.status,
    qrcode: data.instance.qrcode,
  }
}

export async function setUazapiWebhook(
  instanceToken: string,
  webhookUrl: string
): Promise<void> {
  await uazapiFetch<unknown>('/webhook', {
    method: 'POST',
    instanceToken,
    body: JSON.stringify({
      url: webhookUrl,
      events: ['messages', 'connection'],
      excludeMessages: ['wasSentByApi'],
      enabled: true,
    }),
  })
}

export async function sendUazapiMessage(
  instanceToken: string,
  number: string,
  text: string
): Promise<string> {
  const data = await uazapiFetch<{ messageid?: string }>(
    '/send/text',
    {
      method: 'POST',
      instanceToken,
      body: JSON.stringify({ number, text }),
    }
  )
  return data.messageid ?? ''
}

export async function disconnectUazapiInstance(
  instanceToken: string
): Promise<void> {
  await uazapiFetch<unknown>('/instance/disconnect', {
    method: 'POST',
    instanceToken,
  })
}
