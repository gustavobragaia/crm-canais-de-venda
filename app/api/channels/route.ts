import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { encrypt } from '@/lib/crypto'

export async function GET() {
  const session = await auth()
  if (!session?.user?.workspaceId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  try {
    const channels = await db.channel.findMany({
      where: { workspaceId: session.user.workspaceId },
      select: {
        id: true,
        type: true,
        provider: true,
        name: true,
        phoneNumberId: true,
        phoneNumber: true,
        pageId: true,
        pageName: true,
        instanceName: true,
        isActive: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ channels })
  } catch (error) {
    console.error('[CHANNELS GET]', error)
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.workspaceId || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { type, name, accessToken, phoneNumberId, phoneNumber, pageId, pageName } = body as {
      type: 'WHATSAPP' | 'INSTAGRAM' | 'FACEBOOK'
      name: string
      accessToken: string
      phoneNumberId?: string
      phoneNumber?: string
      pageId?: string
      pageName?: string
    }

    if (!type || !name || !accessToken) {
      return NextResponse.json({ error: 'type, name e accessToken são obrigatórios.' }, { status: 400 })
    }

    const encryptedToken = encrypt(accessToken)
    const workspaceId = session.user.workspaceId

    const existing = await db.channel.findFirst({ where: { workspaceId, type } })

    const data = {
      name,
      accessToken: encryptedToken,
      phoneNumberId: phoneNumberId ?? null,
      phoneNumber: phoneNumber ?? null,
      pageId: pageId ?? null,
      pageName: pageName ?? null,
    }

    const channel = existing
      ? await db.channel.update({ where: { id: existing.id }, data })
      : await db.channel.create({ data: { workspaceId, type, ...data } })

    return NextResponse.json({
      channel: {
        id: channel.id,
        type: channel.type,
        name: channel.name,
        phoneNumberId: channel.phoneNumberId,
        phoneNumber: channel.phoneNumber,
        pageId: channel.pageId,
        pageName: channel.pageName,
        isActive: channel.isActive,
      },
    })
  } catch (error) {
    console.error('[CHANNELS POST]', error)
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
  }
}
