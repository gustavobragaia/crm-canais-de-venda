import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { encrypt } from '@/lib/crypto'
import { exchangeCodeForToken, exchangeForSystemUserToken, getWabaIdFromToken, getPhoneNumbers } from '@/lib/integrations/waba'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.workspaceId || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  try {
    const body = await req.json()
    // Accepts either { code } (Embedded Signup code flow) or { accessToken } (legacy)
    const { code, accessToken } = body
    if (!code && !accessToken) {
      return NextResponse.json({ error: 'code ou accessToken é obrigatório.' }, { status: 400 })
    }

    const workspaceId = session.user.workspaceId
    console.log('[WABA CONNECT] Starting connection for workspace:', workspaceId)

    // 1. Exchange code → user token → long-lived token
    console.log('[WABA CONNECT] Step 1: Exchanging token...')
    let longLivedToken: string
    try {
      if (code) {
        // Embedded Signup code flow: code → short-lived token → long-lived token
        console.log('[WABA CONNECT] Using code flow (Embedded Signup)')
        const userToken = await exchangeCodeForToken(code)
        longLivedToken = await exchangeForSystemUserToken(userToken)
      } else {
        // Legacy: direct short-lived token → long-lived token
        longLivedToken = await exchangeForSystemUserToken(accessToken)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error('[WABA CONNECT] Token exchange failed:', msg)
      return NextResponse.json({ error: `Falha na troca de token: ${msg}` }, { status: 400 })
    }

    // 2. Get WABA ID
    console.log('[WABA CONNECT] Step 2: Getting WABA ID...')
    const wabaId = await getWabaIdFromToken(longLivedToken)
    if (!wabaId) {
      return NextResponse.json({
        error: 'Não foi possível identificar o WABA. Verifique se o app tem a permissão whatsapp_business_management e se o Business está verificado.',
      }, { status: 400 })
    }
    console.log('[WABA CONNECT] WABA ID:', wabaId)

    // 3. Get phone numbers
    console.log('[WABA CONNECT] Step 3: Fetching phone numbers...')
    const phoneNumbers = await getPhoneNumbers(longLivedToken, wabaId)
    if (!phoneNumbers.length) {
      return NextResponse.json({
        error: 'Nenhum número registrado neste WABA. Adicione um número no Meta Business Manager primeiro.',
      }, { status: 400 })
    }
    console.log('[WABA CONNECT] Found', phoneNumbers.length, 'number(s):', phoneNumbers.map(p => p.display_phone_number).join(', '))

    // 4. Save first phone number as WabaChannel
    const phone = phoneNumbers[0]
    const encryptedToken = encrypt(longLivedToken)

    const channel = await db.wabaChannel.upsert({
      where: {
        workspaceId_phoneNumberId: {
          workspaceId,
          phoneNumberId: phone.id,
        },
      },
      create: {
        workspaceId,
        wabaId,
        phoneNumberId: phone.id,
        phoneNumber: phone.display_phone_number,
        displayName: phone.verified_name,
        accessToken: encryptedToken,
        qualityRating: phone.quality_rating,
      },
      update: {
        accessToken: encryptedToken,
        displayName: phone.verified_name,
        qualityRating: phone.quality_rating,
        isActive: true,
      },
    })

    console.log('[WABA CONNECT] Channel saved:', channel.id, phone.display_phone_number)

    return NextResponse.json({
      channel: {
        id: channel.id,
        phoneNumber: channel.phoneNumber,
        displayName: channel.displayName,
        qualityRating: channel.qualityRating,
      },
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('[WABA CONNECT] Unexpected error:', msg, error)
    return NextResponse.json({ error: `Erro ao conectar WABA: ${msg}` }, { status: 500 })
  }
}
