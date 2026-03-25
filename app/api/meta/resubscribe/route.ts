import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { decrypt } from '@/lib/crypto'
import { subscribePageToWebhooks } from '@/lib/integrations/meta-common'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.workspaceId || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  try {
    const { channelId } = await req.json() as { channelId?: string }

    const where = channelId
      ? { id: channelId, workspaceId: session.user.workspaceId, isActive: true }
      : { workspaceId: session.user.workspaceId, type: { in: ['FACEBOOK', 'INSTAGRAM'] as ('FACEBOOK' | 'INSTAGRAM')[] }, isActive: true }

    const channels = await db.channel.findMany({ where })

    const results: { channelId: string; type: string; success: boolean; error?: string }[] = []

    for (const channel of channels) {
      if (!channel.pageId || !channel.accessToken) {
        results.push({ channelId: channel.id, type: channel.type, success: false, error: 'pageId ou accessToken ausente' })
        continue
      }
      try {
        const token = decrypt(channel.accessToken)
        await subscribePageToWebhooks(channel.pageId, token)
        results.push({ channelId: channel.id, type: channel.type, success: true })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        results.push({ channelId: channel.id, type: channel.type, success: false, error: msg })
      }
    }

    return NextResponse.json({ results })
  } catch (err) {
    console.error('[META RESUBSCRIBE]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
