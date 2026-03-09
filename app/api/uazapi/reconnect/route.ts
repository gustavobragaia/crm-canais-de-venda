import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  createUazapiInstance,
  connectUazapiInstance,
  setUazapiWebhook,
} from '@/lib/integrations/uazapi'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.workspaceId || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  try {
    const { channelId } = await req.json()
    const webhookUrl = `${process.env.NEXTAUTH_URL?.replace(/\/$/, '')}/api/webhooks/uazapi`

    const channel = await db.channel.findFirst({
      where: { id: channelId, workspaceId: session.user.workspaceId, provider: 'UAZAPI' },
    })
    if (!channel) {
      return NextResponse.json({ error: 'Canal não encontrado.' }, { status: 404 })
    }

    let instanceName = channel.instanceName ?? ''
    let instanceToken = channel.instanceToken ?? ''
    let qrcode: string | undefined

    // Try to reconnect existing instance
    if (instanceToken) {
      try {
        const result = await connectUazapiInstance(instanceToken)
        qrcode = result.qrcode
        console.log('[UAZAPI RECONNECT] reconnected existing instance, qr:', !!qrcode)
      } catch (err) {
        console.log('[UAZAPI RECONNECT] existing instance expired, creating new:', err)
        instanceToken = ''
      }
    }

    // If existing instance failed, create a new one
    if (!instanceToken) {
      const created = await createUazapiInstance(channel.name)
      instanceName = created.id
      instanceToken = created.token

      const result = await connectUazapiInstance(instanceToken)
      qrcode = result.qrcode

      try {
        await setUazapiWebhook(instanceToken, webhookUrl)
      } catch (err) {
        console.warn('[UAZAPI RECONNECT] webhook setup failed (non-fatal):', err)
      }

      await db.channel.update({
        where: { id: channel.id },
        data: { instanceName, instanceToken, isActive: false },
      })

      console.log('[UAZAPI RECONNECT] new instance created:', instanceName)
    }

    return NextResponse.json({
      instanceName,
      channelId: channel.id,
      qr: { base64: qrcode ?? '' },
    })
  } catch (error) {
    console.error('[UAZAPI RECONNECT POST]', error)
    return NextResponse.json({ error: 'Erro ao reconectar instância.' }, { status: 500 })
  }
}
