import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  createUazapiInstance,
  connectUazapiInstance,
  setUazapiWebhook,
  getUazapiStatus,
  deleteUazapiInstance,
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

    // TODO: remover limite quando suporte multi-instância for implementado
    const existingCount = await db.channel.count({
      where: { workspaceId, provider: 'UAZAPI' },
    })
    if (existingCount > 0) {
      return NextResponse.json(
        { error: 'Já existe um canal WhatsApp neste workspace. Remova-o antes de criar um novo.' },
        { status: 409 }
      )
    }

    const instanceName = `${workspaceId}-wa-${Date.now()}`
    const webhookUrl = `${process.env.NEXTAUTH_URL?.replace(/\/$/, '')}/api/webhooks/uazapi`
    console.log('[UAZAPI CONNECT] webhook URL:', webhookUrl)
    if (webhookUrl.includes('localhost')) {
      console.warn('[UAZAPI CONNECT] ATENÇÃO: webhook URL é localhost e não será acessível pela internet. Use /api/uazapi/fix-webhook após deployar em produção.')
    }

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

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.workspaceId || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const { channelId } = body

    if (!channelId || typeof channelId !== 'string') {
      return NextResponse.json({ error: 'channelId é obrigatório.' }, { status: 400 })
    }

    const channel = await db.channel.findFirst({
      where: { id: channelId, workspaceId: session.user.workspaceId, provider: 'UAZAPI' },
    })

    if (!channel) {
      return NextResponse.json({ error: 'Canal não encontrado.' }, { status: 404 })
    }

    // Best-effort: tenta deletar na UazAPI, mas não falha se der erro
    if (channel.instanceToken) {
      try {
        await deleteUazapiInstance(channel.instanceToken)
        console.log('[UAZAPI DELETE] instance deleted on UazAPI:', channel.instanceName)
      } catch (err) {
        console.warn('[UAZAPI DELETE] failed to delete on UazAPI (non-fatal):', err)
      }
    }

    await db.channel.delete({ where: { id: channel.id } })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[UAZAPI DELETE]', error)
    return NextResponse.json({ error: 'Erro ao deletar instância.' }, { status: 500 })
  }
}
