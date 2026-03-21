import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { decrypt } from '@/lib/crypto'

const GRAPH_URL = 'https://graph.facebook.com/v21.0'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.workspaceId || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  try {
    const { channelId } = await req.json()
    if (!channelId) return NextResponse.json({ error: 'channelId é obrigatório.' }, { status: 400 })

    const channel = await db.channel.findFirst({
      where: { id: channelId, workspaceId: session.user.workspaceId },
    })
    if (!channel) return NextResponse.json({ error: 'Canal não encontrado.' }, { status: 404 })

    // Try to unsubscribe from Meta webhooks (non-blocking on failure)
    if (channel.pageId && channel.accessToken) {
      try {
        const token = decrypt(channel.accessToken)
        await fetch(`${GRAPH_URL}/${channel.pageId}/subscribed_apps?access_token=${token}`, {
          method: 'DELETE',
        })
      } catch (err) {
        console.warn('[META DISCONNECT] Failed to unsubscribe webhooks (non-blocking):', err)
      }
    }

    await db.channel.update({
      where: { id: channelId },
      data: { isActive: false, accessToken: null },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[META DISCONNECT]', error)
    return NextResponse.json({ error: 'Erro ao desconectar canal.' }, { status: 500 })
  }
}
