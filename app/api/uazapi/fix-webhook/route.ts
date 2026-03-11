import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { setUazapiWebhook } from '@/lib/integrations/uazapi'

export async function POST(req: NextRequest) {
  void req
  const session = await auth()
  if (!session?.user?.workspaceId || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const baseUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, '')
  if (!baseUrl || baseUrl.includes('localhost')) {
    return NextResponse.json(
      { error: `NEXTAUTH_URL está configurado como "${baseUrl ?? '(vazio)'}". Para receber webhooks, use a URL de produção (ex: https://seudominio.com).` },
      { status: 400 }
    )
  }

  const webhookUrl = `${baseUrl}/api/webhooks/uazapi`

  const channel = await db.channel.findFirst({
    where: { workspaceId: session.user.workspaceId, provider: 'UAZAPI' },
  })

  if (!channel || !channel.instanceToken) {
    return NextResponse.json({ error: 'Nenhum canal WhatsApp encontrado neste workspace.' }, { status: 404 })
  }

  try {
    await setUazapiWebhook(channel.instanceToken, webhookUrl)
    console.log('[UAZAPI FIX-WEBHOOK] webhook re-registrado:', webhookUrl, '| canal:', channel.id)
    return NextResponse.json({ ok: true, webhookUrl })
  } catch (error) {
    console.error('[UAZAPI FIX-WEBHOOK]', error)
    return NextResponse.json({ error: 'Erro ao registrar webhook na UazAPI.' }, { status: 500 })
  }
}
