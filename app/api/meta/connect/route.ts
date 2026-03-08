import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { encrypt } from '@/lib/crypto'

const GRAPH_URL = 'https://graph.facebook.com/v18.0'

async function exchangeCodeForToken(code: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    redirect_uri: `${process.env.NEXTAUTH_URL}/api/meta/connect`,
    code,
  })
  const res = await fetch(`${GRAPH_URL}/oauth/access_token?${params}`)
  const data = await res.json()
  if (!data.access_token) throw new Error(data.error?.message ?? 'Token exchange failed')
  return data.access_token
}

async function getLongLivedToken(shortToken: string): Promise<string> {
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    fb_exchange_token: shortToken,
  })
  const res = await fetch(`${GRAPH_URL}/oauth/access_token?${params}`)
  const data = await res.json()
  return data.access_token ?? shortToken
}


async function getPages(userToken: string): Promise<Array<{ id: string; name: string; access_token: string }>> {
  const res = await fetch(`${GRAPH_URL}/me/accounts?fields=id,name,access_token&access_token=${userToken}`)
  const data = await res.json()
  return data.data ?? []
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.workspaceId || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { code, accessToken: directToken, channelType, selectedId, channelName } = body as {
      code?: string
      accessToken?: string
      channelType: 'INSTAGRAM' | 'FACEBOOK'
      selectedId?: string
      channelName?: string
    }

    if (!channelType) {
      return NextResponse.json({ error: 'channelType é obrigatório.' }, { status: 400 })
    }

    // Step 1: Get user access token
    let userToken: string
    if (code) {
      const shortToken = await exchangeCodeForToken(code)
      userToken = await getLongLivedToken(shortToken)
    } else if (directToken) {
      userToken = await getLongLivedToken(directToken)
    } else {
      return NextResponse.json({ error: 'code ou accessToken é obrigatório.' }, { status: 400 })
    }

    const workspaceId = session.user.workspaceId

    // Instagram or Facebook — pages flow
    const pages = await getPages(userToken)

    if (!pages.length) {
      return NextResponse.json({ error: 'Nenhuma página encontrada nesta conta.' }, { status: 400 })
    }

    if (selectedId) {
      const selected = pages.find((p) => p.id === selectedId)
      if (!selected) {
        return NextResponse.json({ error: 'Página não encontrada.' }, { status: 400 })
      }

      // Use page-level access token (longer-lived, scoped to the page)
      const encryptedToken = encrypt(selected.access_token)
      const existing = await db.channel.findFirst({ where: { workspaceId, type: channelType } })
      const data = {
        name: channelName ?? selected.name,
        accessToken: encryptedToken,
        pageId: selected.id,
        pageName: selected.name,
        phoneNumberId: null,
        phoneNumber: null,
        businessAccountId: null,
      }

      const channel = existing
        ? await db.channel.update({ where: { id: existing.id }, data })
        : await db.channel.create({ data: { workspaceId, type: channelType, ...data } })

      return NextResponse.json({
        step: 'done',
        channel: {
          id: channel.id,
          type: channel.type,
          name: channel.name,
          pageId: channel.pageId,
          pageName: channel.pageName,
        },
      })
    }

    return NextResponse.json({
      step: 'select',
      channelType,
      userToken,
      options: pages.map((p) => ({ id: p.id, name: p.name })),
    })
  } catch (error) {
    console.error('[META CONNECT]', error)
    return NextResponse.json({ error: 'Erro ao conectar com a Meta. Verifique as credenciais.' }, { status: 500 })
  }
}
