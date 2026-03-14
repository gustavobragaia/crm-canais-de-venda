import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { downloadUazapiMedia } from '@/lib/integrations/uazapi'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const message = await db.message.findFirst({
    where: { id, workspaceId: session.user.workspaceId },
    select: {
      mediaUrl: true,
      externalId: true,
      conversation: { select: { channel: { select: { instanceToken: true } } } },
    },
  })

  if (!message) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Use cached URL if available
  if (message.mediaUrl) {
    return NextResponse.redirect(message.mediaUrl)
  }

  // On-demand download from UazAPI
  const instanceToken = message.conversation.channel?.instanceToken
  if (!message.externalId || !instanceToken) {
    return NextResponse.json({ error: 'Cannot resolve media' }, { status: 400 })
  }

  const { fileURL } = await downloadUazapiMedia(instanceToken, message.externalId)
  if (!fileURL) return NextResponse.json({ error: 'Media not available' }, { status: 404 })

  // Cache for next time
  await db.message.update({ where: { id }, data: { mediaUrl: fileURL } })

  return NextResponse.redirect(fileURL)
}
