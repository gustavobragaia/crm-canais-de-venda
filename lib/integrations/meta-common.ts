const GRAPH_URL = 'https://graph.facebook.com/v21.0'
const TIMEOUT_MS = 10_000

async function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Subscribe a Facebook Page to messaging webhook events.
 * Must be called after connecting a channel to receive incoming messages.
 */
export async function subscribePageToWebhooks(pageId: string, accessToken: string): Promise<void> {
  const url = `${GRAPH_URL}/${pageId}/subscribed_apps?subscribed_fields=messages,messaging_postbacks&access_token=${accessToken}`
  const res = await fetchWithTimeout(url, { method: 'POST' })
  const data = await res.json()
  if (!res.ok || !data.success) {
    throw new Error(`[META] Failed to subscribe page ${pageId} to webhooks: ${JSON.stringify(data)}`)
  }
}

/**
 * Get the Instagram Business Account ID linked to a Facebook Page.
 * Returns null if the page has no linked Instagram account.
 */
export async function getInstagramBusinessAccountId(pageId: string, accessToken: string): Promise<string | null> {
  const url = `${GRAPH_URL}/${pageId}?fields=instagram_business_account&access_token=${accessToken}`
  const res = await fetchWithTimeout(url)
  if (!res.ok) return null
  const data = await res.json()
  return data.instagram_business_account?.id ?? null
}

/**
 * Fetch a Meta user's profile (name + photo).
 * Uses different fields for Instagram vs Facebook.
 */
export async function fetchMetaUserProfile(
  userId: string,
  accessToken: string,
  channelType: 'INSTAGRAM' | 'FACEBOOK'
): Promise<{ name: string; photoUrl?: string }> {
  const fields =
    channelType === 'INSTAGRAM'
      ? 'name,username,profile_picture_url'
      : 'first_name,last_name,profile_pic'

  const url = `${GRAPH_URL}/${userId}?fields=${fields}&access_token=${accessToken}`
  const res = await fetchWithTimeout(url)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`[META] Failed to fetch user profile ${userId}: ${JSON.stringify(err)}`)
  }
  const data = await res.json()

  let name: string
  if (channelType === 'FACEBOOK') {
    const parts = [data.first_name, data.last_name].filter(Boolean)
    name = parts.length > 0 ? parts.join(' ') : 'Facebook User'
  } else {
    name = data.name ?? data.username ?? 'Instagram User'
  }
  const photoUrl: string | undefined =
    data.profile_picture_url ?? data.profile_pic ?? undefined

  return { name, photoUrl }
}

/**
 * Download media from Meta CDN.
 * Meta CDN URLs are temporary (~15min) and require the access token.
 */
export async function downloadMetaMedia(
  url: string,
  accessToken: string
): Promise<{ buffer: Buffer; contentType: string }> {
  const separator = url.includes('?') ? '&' : '?'
  const fullUrl = `${url}${separator}access_token=${accessToken}`

  const res = await fetchWithTimeout(fullUrl)
  if (!res.ok) {
    throw new Error(`[META] Failed to download media from CDN (status ${res.status}): ${url}`)
  }

  const contentType = res.headers.get('content-type') ?? 'application/octet-stream'
  const arrayBuffer = await res.arrayBuffer()
  return { buffer: Buffer.from(arrayBuffer), contentType }
}
