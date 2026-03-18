import { put } from '@vercel/blob'

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/ogg; codecs=opus': 'ogg',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
}

function getExtension(mime?: string | null, fallback = 'bin'): string {
  if (!mime) return fallback
  return MIME_TO_EXT[mime.toLowerCase()] ?? mime.split('/')[1]?.split(';')[0] ?? fallback
}

/**
 * Downloads media from a temporary URL and persists it to Vercel Blob.
 * Returns the permanent public URL, or null if the download/upload fails.
 */
export async function persistMedia(
  fileURL: string,
  messageId: string,
  mime?: string | null,
): Promise<string | null> {
  try {
    const res = await fetch(fileURL)
    if (!res.ok) {
      console.error(`[persistMedia] fetch failed: ${res.status} ${res.statusText} | url=${fileURL.slice(0, 80)}`)
      return null
    }

    const contentType = mime || res.headers.get('content-type') || 'application/octet-stream'
    const ext = getExtension(contentType)

    const blob = await put(`media/inbound/${messageId}.${ext}`, res.body!, {
      access: 'public',
      contentType,
    })

    console.log(`[persistMedia] uploaded | messageId=${messageId} | url=${blob.url.slice(0, 80)}`)
    return blob.url
  } catch (err) {
    console.error('[persistMedia] error:', err)
    return null
  }
}
