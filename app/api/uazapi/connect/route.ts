import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  createUazapiInstance,
  connectUazapiInstance,
  setUazapiWebhook,
  getUazapiStatus,
} from '@/lib/integrations/uazapi'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.workspaceId || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const rawName = typeof body.channelName === 'string' ? body.channelName.trim().slice(0, 100) : ''
    const channelName = rawName || 'WhatsApp'

    const workspaceId = session.user.workspaceId
    const instanceName = `${workspaceId}-wa-${Date.now()}`
    const webhookUrl = `${process.env.NEXTAUTH_URL?.replace(/\/$/, '')}/api/webhooks/uazapi`

    // Step 1: Create instance (requires admintoken)
    const { id: instanceId, token: instanceToken } = await createUazapiInstance(instanceName)
    console.log('[UAZAPI CONNECT] instance created:', instanceId)

    // Step 2: Connect to get QR code
    const { qrcode } = await connectUazapiInstance(instanceToken)
    console.log('[UAZAPI CONNECT] connect called, qrcode present:', !!qrcode)

    // Step 3: Register webhook
    try {
      await setUazapiWebhook(instanceToken, webhookUrl)
      console.log('[UAZAPI CONNECT] webhook set:', webhookUrl)
    } catch (err) {
      console.warn('[UAZAPI CONNECT] webhook setup failed (non-fatal):', err)
    }

    // Save channel to DB — inactive until connection confirmed
    const channel = await db.channel.create({
      data: {
        workspaceId,
        type: 'WHATSAPP',
        provider: 'UAZAPI',
        instanceName: instanceId,
        instanceToken,
        name: channelName,
        isActive: false,
      },
    })

    return NextResponse.json({
      instanceName: instanceId,
      channelId: channel.id,
      qr: { base64: qrcode ?? '' },
    })
  } catch (error) {
    console.error('[UAZAPI CONNECT POST]', error)
    return NextResponse.json({ error: 'Erro ao criar instância UazAPI.' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.workspaceId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const instanceName = searchParams.get('instanceName')

  if (!instanceName || typeof instanceName !== 'string') {
    return NextResponse.json({ error: 'instanceName é obrigatório.' }, { status: 400 })
  }

  const channel = await db.channel.findFirst({
    where: { workspaceId: session.user.workspaceId, instanceName },
  })
  if (!channel || !channel.instanceToken) {
    return NextResponse.json({ error: 'Instância não encontrada.' }, { status: 404 })
  }

  try {
    const { status, qrcode } = await getUazapiStatus(channel.instanceToken)

    if (status === 'connected' && !channel.isActive) {
      await db.channel.update({
        where: { id: channel.id },
        data: { isActive: true, webhookVerifiedAt: new Date() },
      })
    }

    return NextResponse.json({
      state: status,
      channelId: channel.id,
      qr: qrcode ? { base64: qrcode } : undefined,
    })
  } catch (error) {
    console.error('[UAZAPI CONNECT GET]', error)
    return NextResponse.json({ state: 'disconnected', channelId: channel.id })
  }
}
