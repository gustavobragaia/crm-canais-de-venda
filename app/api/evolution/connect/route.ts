import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  createEvolutionInstance,
  setEvolutionWebhook,
  getEvolutionQR,
  getEvolutionConnectionState,
} from '@/lib/integrations/evolution'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.workspaceId || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const rawName = typeof body.channelName === 'string' ? body.channelName.trim().slice(0, 100) : ''
    const channelName = rawName || 'WhatsApp (Evolution)'

    const workspaceId = session.user.workspaceId
    const instanceName = `${workspaceId}-wa-${Date.now()}`
    const webhookUrl = `${process.env.NEXTAUTH_URL}/api/webhooks/evolution`

    // Create instance in Evolution — webhook included in payload to avoid race condition
    // (QRCODE_UPDATED fires immediately after creation; registering webhook after would miss it)
    const created = await createEvolutionInstance(instanceName, webhookUrl)
    console.log('[EVOLUTION CONNECT] createEvolutionInstance response:', JSON.stringify(created))

    // Belt-and-suspenders: also set webhook via separate call in case the create payload didn't apply it
    try {
      await setEvolutionWebhook(instanceName, webhookUrl)
    } catch (err) {
      console.warn('[EVOLUTION CONNECT] webhook setup failed (non-fatal):', err)
    }

    // Get QR code — may already be in the create response
    // Delay 2s to allow Baileys to initialize before fetching QR
    let qr = created.qrcode
    if (!qr?.base64) {
      await new Promise((r) => setTimeout(r, 2000))
      qr = await getEvolutionQR(instanceName)
      console.log('[EVOLUTION CONNECT] getEvolutionQR response:', JSON.stringify(qr))
    }

    // Save channel to DB (inactive until CONNECTION_UPDATE confirms open)
    const channel = await db.channel.create({
      data: {
        workspaceId,
        type: 'WHATSAPP',
        provider: 'EVOLUTION',
        instanceName,
        name: channelName,
        isActive: false,
      },
    })

    return NextResponse.json({
      instanceName,
      channelId: channel.id,
      qr: { base64: qr?.base64 ?? '', code: qr?.code ?? '' },
    })
  } catch (error) {
    console.error('[EVOLUTION CONNECT POST]', error)
    return NextResponse.json({ error: 'Erro ao criar instância Evolution.' }, { status: 500 })
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

  // Validate that this instance belongs to this workspace
  const channel = await db.channel.findFirst({
    where: { workspaceId: session.user.workspaceId, instanceName },
  })
  if (!channel) {
    return NextResponse.json({ error: 'Instância não encontrada.' }, { status: 404 })
  }

  try {
    const state = await getEvolutionConnectionState(instanceName)

    if (state === 'open' && !channel.isActive) {
      await db.channel.update({
        where: { id: channel.id },
        data: { isActive: true, webhookVerifiedAt: new Date() },
      })
    }

    let qr: { base64: string; code: string } | null = null
    if (state !== 'open') {
      try { qr = await getEvolutionQR(instanceName) } catch { /* QR ainda não disponível */ }
    }
    return NextResponse.json({ state, channelId: channel.id, qr })
  } catch (error) {
    console.error('[EVOLUTION CONNECT GET]', error)
    return NextResponse.json({ state: 'close', channelId: channel.id })
  }
}
