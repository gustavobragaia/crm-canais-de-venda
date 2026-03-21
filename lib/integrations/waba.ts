const GRAPH_URL = 'https://graph.facebook.com/v21.0'

// ─── Phone Formatting ───

export function formatPhoneForWaba(phone: string): string {
  const raw = phone.replace(/\D/g, '')
  if (!raw.startsWith('55') || raw.length < 13) return raw
  const ddd = raw.slice(2, 4)
  let number = raw.slice(4)
  // Remove 9th digit from BR mobile numbers
  if (number.length === 9 && number.startsWith('9')) number = number.slice(1)
  return `55${ddd}${number}`
}

// ─── Send Template Message ───

export async function sendTemplateMessage(
  accessToken: string,
  phoneNumberId: string,
  to: string,
  templateName: string,
  language: string = 'pt_BR',
  components?: Record<string, unknown>[],
): Promise<{ messageId: string }> {
  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    to: formatPhoneForWaba(to),
    type: 'template',
    template: {
      name: templateName,
      language: { code: language },
      ...(components && { components }),
    },
  }

  const res = await fetch(`${GRAPH_URL}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const error = await res.json()
    console.error('[WABA] sendTemplateMessage error:', JSON.stringify(error))
    throw new Error(error.error?.message ?? `WABA API error: ${res.status}`)
  }

  const data = await res.json()
  return { messageId: data.messages?.[0]?.id ?? '' }
}

// ─── Templates ───

export interface WabaTemplateResponse {
  id: string
  name: string
  language: string
  category: string
  status: string
  components: Record<string, unknown>[]
}

export async function getTemplates(
  accessToken: string,
  wabaId: string,
): Promise<WabaTemplateResponse[]> {
  const res = await fetch(
    `${GRAPH_URL}/${wabaId}/message_templates?fields=id,name,language,category,status,components`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )

  if (!res.ok) {
    const error = await res.text()
    console.error('[WABA] getTemplates error:', error)
    throw new Error(`Failed to fetch templates: ${res.status}`)
  }

  const data = await res.json()
  return data.data ?? []
}

export async function createTemplate(
  accessToken: string,
  wabaId: string,
  template: {
    name: string
    language: string
    category: string
    components: Record<string, unknown>[]
  },
): Promise<{ id: string }> {
  const res = await fetch(`${GRAPH_URL}/${wabaId}/message_templates`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(template),
  })

  if (!res.ok) {
    const error = await res.json()
    console.error('[WABA] createTemplate error:', JSON.stringify(error))
    throw new Error(error.error?.message ?? `Failed to create template: ${res.status}`)
  }

  const data = await res.json()
  return { id: data.id }
}

export async function deleteTemplate(
  accessToken: string,
  wabaId: string,
  templateName: string,
): Promise<void> {
  const res = await fetch(
    `${GRAPH_URL}/${wabaId}/message_templates?name=${encodeURIComponent(templateName)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  )

  if (!res.ok) {
    const error = await res.text()
    console.error('[WABA] deleteTemplate error:', error)
    throw new Error(`Failed to delete template: ${res.status}`)
  }
}

// ─── Phone Numbers ───

export interface WabaPhoneNumber {
  id: string
  display_phone_number: string
  verified_name: string
  quality_rating: string
  messaging_limit?: string
}

export async function getPhoneNumbers(
  accessToken: string,
  wabaId: string,
): Promise<WabaPhoneNumber[]> {
  const res = await fetch(
    `${GRAPH_URL}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )

  if (!res.ok) {
    const error = await res.text()
    console.error('[WABA] getPhoneNumbers error:', error)
    throw new Error(`Failed to fetch phone numbers: ${res.status}`)
  }

  const data = await res.json()
  return data.data ?? []
}

// ─── Token Exchange (Embedded Signup) ───

export async function exchangeForSystemUserToken(userToken: string): Promise<string> {
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    fb_exchange_token: userToken,
  })

  const res = await fetch(`${GRAPH_URL}/oauth/access_token?${params}`)
  const data = await res.json()
  return data.access_token ?? userToken
}

// ─── Get WABA ID from token ───

export async function getWabaIdFromToken(accessToken: string): Promise<string | null> {
  // Get shared WABA accounts
  const res = await fetch(
    `${GRAPH_URL}/debug_token?input_token=${accessToken}`,
    { headers: { Authorization: `Bearer ${process.env.META_APP_ID}|${process.env.META_APP_SECRET}` } },
  )

  if (!res.ok) return null

  const data = await res.json()
  const granularScopes = data.data?.granular_scopes ?? []
  const wabaScope = granularScopes.find(
    (s: { scope: string; target_ids?: string[] }) => s.scope === 'whatsapp_business_management',
  )

  return wabaScope?.target_ids?.[0] ?? null
}
