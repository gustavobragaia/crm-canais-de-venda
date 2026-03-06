const META_API_VERSION = 'v18.0'
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`

export async function sendWhatsAppMessage(
  phoneNumberId: string,
  to: string,
  message: string,
  accessToken: string
): Promise<string> {
  const res = await fetch(`${META_BASE_URL}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body: message },
    }),
  })

  if (!res.ok) {
    const error = await res.json()
    throw new Error(`WhatsApp API error: ${JSON.stringify(error)}`)
  }

  const data = await res.json()
  return data.messages?.[0]?.id ?? ''
}

export function verifyWhatsAppSignature(payload: string, signature: string): boolean {
  const { createHmac } = require('crypto')
  const secret = process.env.WHATSAPP_APP_SECRET!
  const expected = createHmac('sha256', secret).update(payload).digest('hex')
  return `sha256=${expected}` === signature
}

export interface WhatsAppWebhookPayload {
  object: string
  entry: Array<{
    id: string
    changes: Array<{
      value: {
        messaging_product: string
        metadata: { display_phone_number: string; phone_number_id: string }
        contacts?: Array<{ profile: { name: string }; wa_id: string }>
        messages?: Array<{
          from: string
          id: string
          timestamp: string
          text?: { body: string }
          type: string
          image?: { id: string; mime_type: string; sha256: string }
          audio?: { id: string; mime_type: string }
          document?: { id: string; filename: string; mime_type: string }
        }>
        statuses?: Array<{
          id: string
          status: string
          timestamp: string
          recipient_id: string
        }>
      }
      field: string
    }>
  }>
}
