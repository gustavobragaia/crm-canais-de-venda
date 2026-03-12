import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'

const BASE_URL = process.env.UAZAPI_BASE_URL?.replace(/\/$/, '') ?? ''

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      messageId: string
      externalId?: string
      instanceToken?: string
    }
    const { messageId } = body
    let { externalId, instanceToken } = body

    if (!messageId) {
      return NextResponse.json({ error: 'messageId is required' }, { status: 400 })
    }

    // If externalId/instanceToken not provided, look them up from DB
    if (!externalId || !instanceToken) {
      const msg = await db.message.findUnique({
        where: { id: messageId },
        select: {
          externalId: true,
          conversation: {
            select: { channel: { select: { instanceToken: true } } },
          },
        },
      })
      if (!msg?.externalId || !msg.conversation.channel?.instanceToken) {
        return NextResponse.json({ error: 'Cannot resolve externalId or instanceToken for this message' }, { status: 400 })
      }
      externalId = msg.externalId
      instanceToken = msg.conversation.channel.instanceToken
    }

    // Always download to get a permanent fileURL for audio playback
    // Transcribe only if OPENAI_API_KEY is available
    const downloadBody: Record<string, unknown> = {
      id: externalId,
      generate_mp3: true,
      return_link: true,
    }
    if (process.env.OPENAI_API_KEY) {
      downloadBody.transcribe = true
      downloadBody.openai_apikey = process.env.OPENAI_API_KEY
    }

    const response = await fetch(`${BASE_URL}/message/download`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        token: instanceToken,
      },
      body: JSON.stringify(downloadBody),
      signal: AbortSignal.timeout(30000),
    })

    if (!response.ok) {
      const body = await response.text()
      console.error('[TRANSCRIPTION] UazAPI error:', response.status, body)
      return NextResponse.json({ error: 'Download failed' }, { status: 502 })
    }

    const data = await response.json() as { transcription?: string; fileURL?: string }
    const transcription = data.transcription ?? null

    // Persist fileURL (always) and transcription (if available)
    const updateData: Record<string, string | null> = {}
    if (data.fileURL) updateData.mediaUrl = data.fileURL
    if (transcription) updateData.transcription = transcription

    if (Object.keys(updateData).length === 0) {
      console.log('[TRANSCRIPTION] no data to update for message:', messageId)
      return NextResponse.json({ transcription: null })
    }

    const updatedMessage = await db.message.update({
      where: { id: messageId },
      data: updateData,
      select: { id: true, conversationId: true },
    })

    // Notify clients in real-time
    await pusherServer.trigger(
      `conversation-${updatedMessage.conversationId}`,
      'message-updated',
      { messageId: updatedMessage.id, transcription, mediaUrl: data.fileURL }
    )

    console.log('[TRANSCRIPTION] completed for message:', messageId, '| transcription chars:', transcription?.length ?? 0, '| fileURL:', !!data.fileURL)

    return NextResponse.json({ transcription })
  } catch (err) {
    console.error('[TRANSCRIPTION] error:', err)
    return NextResponse.json({ error: 'Transcription failed' }, { status: 500 })
  }
}
