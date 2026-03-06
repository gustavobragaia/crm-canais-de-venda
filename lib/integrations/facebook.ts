const META_API_VERSION = 'v18.0'
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`

export async function sendFacebookMessage(
  recipientId: string,
  message: string,
  accessToken: string
): Promise<string> {
  const res = await fetch(`${META_BASE_URL}/me/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text: message },
      messaging_type: 'RESPONSE',
    }),
  })

  if (!res.ok) {
    const error = await res.json()
    throw new Error(`Facebook API error: ${JSON.stringify(error)}`)
  }

  const data = await res.json()
  return data.message_id ?? ''
}

export interface FacebookWebhookPayload {
  object: string
  entry: Array<{
    id: string
    time: number
    messaging: Array<{
      sender: { id: string }
      recipient: { id: string }
      timestamp: number
      message?: {
        mid: string
        text?: string
        attachments?: Array<{ type: string; payload: { url?: string } }>
      }
    }>
  }>
}
