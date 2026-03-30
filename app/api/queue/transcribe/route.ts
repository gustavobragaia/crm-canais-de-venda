import { NextRequest, NextResponse } from 'next/server'
import { verifyQStashSignature, parseQStashBody } from '@/lib/queue/verify'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { persistMedia } from '@/lib/media'

export const maxDuration = 60

const BASE_URL = process.env.UAZAPI_BASE_URL?.replace(/\/$/, '') ?? ''

type TranscribePayload = {
  messageId: string
  conversationId: string
  workspaceId: string
  instanceToken: string
  mediaMessageId: string
}

export async function POST(req: NextRequest) {
  const authError = await verifyQStashSignature(req)
  if (authError) return authError

  const { messageId, conversationId, workspaceId, instanceToken, mediaMessageId } =
    await parseQStashBody<TranscribePayload>(req)

  console.log(`[QUEUE/TRANSCRIBE] messageId=${messageId}`)

  // Check if message exists (may have been deleted)
  const existing = await db.message.findUnique({
    where: { id: messageId },
    select: { id: true, mediaUrl: true },
  })
  if (!existing) {
    return NextResponse.json({ skipped: true, reason: 'message-not-found' })
  }

  const downloadBody: Record<string, unknown> = {
    id: mediaMessageId,
    generate_mp3: true,
    return_link: true,
  }
  if (process.env.OPENAI_API_KEY) {
    downloadBody.transcribe = true
    downloadBody.openai_apikey = process.env.OPENAI_API_KEY
  }

  const response = await fetch(`${BASE_URL}/message/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', token: instanceToken },
    body: JSON.stringify(downloadBody),
    signal: AbortSignal.timeout(30000),
  })

  if (!response.ok) {
    const errBody = await response.text()
    console.error(`[QUEUE/TRANSCRIBE] UazAPI error ${response.status}:`, errBody.slice(0, 200))
    // 4xx = media expired/not found — no point retrying
    if (response.status >= 400 && response.status < 500) {
      return NextResponse.json({ skipped: true, reason: 'media-unavailable' })
    }
    return NextResponse.json({ error: 'Download failed' }, { status: 502 })
  }

  const rawText = await response.text()
  const data = JSON.parse(rawText) as { transcription?: string; fileURL?: string }

  if (!data.fileURL && !data.transcription) {
    return NextResponse.json({ skipped: true, reason: 'no-media-url' })
  }

  const updateData: Record<string, string | null> = {}
  if (data.fileURL) {
    const permanentUrl = await persistMedia(data.fileURL, messageId, 'audio/mpeg')
    updateData.mediaUrl = permanentUrl ?? data.fileURL
  }
  if (data.transcription) updateData.transcription = data.transcription

  await db.message.update({ where: { id: messageId }, data: updateData })

  await pusherServer.trigger(
    `conversation-${conversationId}`,
    'message-updated',
    { messageId, transcription: data.transcription ?? null, mediaUrl: updateData.mediaUrl }
  ).catch(() => {})

  console.log(`[QUEUE/TRANSCRIBE] done messageId=${messageId}`)
  return NextResponse.json({ success: true, transcription: !!data.transcription })
}
