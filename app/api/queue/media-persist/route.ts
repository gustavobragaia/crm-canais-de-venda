import { NextRequest, NextResponse } from 'next/server'
import { verifyQStashSignature, parseQStashBody } from '@/lib/queue/verify'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { persistMedia } from '@/lib/media'
import { decrypt } from '@/lib/crypto'
import { put } from '@vercel/blob'
import { downloadMetaMedia } from '@/lib/integrations/meta-common'

export const maxDuration = 60

const UAZAPI_BASE = process.env.UAZAPI_BASE_URL?.replace(/\/$/, '') ?? ''

type MediaPersistPayload = {
  messageId: string
  conversationId: string
  workspaceId: string
  source: 'uazapi' | 'meta'
  // UazAPI
  instanceToken?: string
  mediaMessageId?: string
  // Meta
  mediaUrl?: string
  accessToken?: string
  mediaMime?: string
}

export async function POST(req: NextRequest) {
  const authError = await verifyQStashSignature(req)
  if (authError) return authError

  const payload = await parseQStashBody<MediaPersistPayload>(req)
  const { messageId, conversationId, workspaceId, source, mediaMime } = payload

  console.log(`[QUEUE/MEDIA-PERSIST] messageId=${messageId} source=${source}`)

  // Dedup: if mediaUrl already persisted, skip
  const existing = await db.message.findUnique({
    where: { id: messageId },
    select: { id: true, mediaUrl: true },
  })
  if (!existing) {
    return NextResponse.json({ skipped: true, reason: 'message-not-found' })
  }

  let finalUrl: string
  let finalMime = mediaMime ?? 'application/octet-stream'

  if (source === 'uazapi') {
    const { instanceToken, mediaMessageId } = payload
    if (!instanceToken || !mediaMessageId) {
      return NextResponse.json({ error: 'instanceToken and mediaMessageId required for uazapi' }, { status: 400 })
    }

    const res = await fetch(`${UAZAPI_BASE}/message/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: instanceToken },
      body: JSON.stringify({ id: mediaMessageId, return_link: true }),
      signal: AbortSignal.timeout(30000),
    })

    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        return NextResponse.json({ skipped: true, reason: 'media-unavailable' })
      }
      return NextResponse.json({ error: 'UazAPI download failed' }, { status: 502 })
    }

    const data = await res.json() as { fileURL?: string; mimetype?: string }
    if (!data.fileURL) {
      return NextResponse.json({ skipped: true, reason: 'no-file-url' })
    }

    const permanentUrl = await persistMedia(data.fileURL, messageId, data.mimetype ?? finalMime)
    finalUrl = permanentUrl ?? data.fileURL
    if (data.mimetype) finalMime = data.mimetype
  } else {
    // meta
    const { mediaUrl, accessToken } = payload
    if (!mediaUrl) {
      return NextResponse.json({ skipped: true, reason: 'no-media-url' })
    }

    const token = accessToken ? decrypt(accessToken) : ''
    let buffer: Buffer
    let contentType: string

    try {
      const result = await downloadMetaMedia(mediaUrl, token)
      buffer = result.buffer as Buffer
      contentType = result.contentType
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      // 401/403 = token expired or URL expired — no point retrying
      if (msg.includes('401') || msg.includes('403')) {
        return NextResponse.json({ skipped: true, reason: 'media-url-expired' })
      }
      throw err
    }

    finalMime = contentType
    const ext = contentType.split('/')[1]?.split(';')[0] ?? 'bin'
    const filename = `meta-${Date.now()}-${messageId}.${ext}`
    const blob = await put(`media/${filename}`, buffer, { access: 'public', contentType })
    finalUrl = blob.url
  }

  await db.message.update({
    where: { id: messageId },
    data: { mediaUrl: finalUrl, mediaMime: finalMime },
  })

  await pusherServer.trigger(
    `workspace-${workspaceId}`,
    'message-updated',
    { conversationId, messageId, mediaUrl: finalUrl, mediaMime: finalMime }
  ).catch(() => {})

  console.log(`[QUEUE/MEDIA-PERSIST] done messageId=${messageId}`)
  return NextResponse.json({ success: true })
}
