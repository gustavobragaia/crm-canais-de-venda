const META_API_VERSION = 'v21.0'
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`

const MEDIA_TYPE_MAP: Record<string, string> = {
  image: 'image',
  video: 'video',
  audio: 'audio',
  document: 'file',
}

export async function sendInstagramMedia(
  recipientId: string,
  mediaType: string,
  mediaUrl: string,
  accessToken: string
): Promise<string> {
  const attachmentType = MEDIA_TYPE_MAP[mediaType] ?? 'file'
  const res = await fetch(`${META_BASE_URL}/me/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: {
        attachment: {
          type: attachmentType,
          payload: { url: mediaUrl, is_reusable: true },
        },
      },
      messaging_type: 'RESPONSE',
    }),
  })

  if (!res.ok) {
    const error = await res.json()
    throw new Error(`Instagram API error: ${JSON.stringify(error)}`)
  }

  const data = await res.json()
  return data.message_id ?? ''
}

export async function sendInstagramMessage(
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
    throw new Error(`Instagram API error: ${JSON.stringify(error)}`)
  }

  const data = await res.json()
  return data.message_id ?? ''
}

export interface InstagramWebhookPayload {
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
        is_echo?: boolean
        attachments?: Array<{ type: string; payload: { url?: string } }>
      }
    }>
  }>
}
