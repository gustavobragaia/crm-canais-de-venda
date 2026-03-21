import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { encrypt } from '@/lib/crypto'
import { exchangeForSystemUserToken, getWabaIdFromToken, getPhoneNumbers } from '@/lib/integrations/waba'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.workspaceId || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  try {
    const { accessToken } = await req.json()
    if (!accessToken) {
      return NextResponse.json({ error: 'accessToken é obrigatório.' }, { status: 400 })
    }

    const workspaceId = session.user.workspaceId

    // 1. Exchange for long-lived token
    const longLivedToken = await exchangeForSystemUserToken(accessToken)

    // 2. Get WABA ID
    const wabaId = await getWabaIdFromToken(longLivedToken)
    if (!wabaId) {
      return NextResponse.json({ error: 'Não foi possível identificar o WABA. Verifique as permissões.' }, { status: 400 })
    }

    // 3. Get phone numbers
    const phoneNumbers = await getPhoneNumbers(longLivedToken, wabaId)
    if (!phoneNumbers.length) {
      return NextResponse.json({ error: 'Nenhum número registrado neste WABA.' }, { status: 400 })
    }

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

    return NextResponse.json({
      channel: {
        id: channel.id,
        phoneNumber: channel.phoneNumber,
        displayName: channel.displayName,
        qualityRating: channel.qualityRating,
      },
    })
  } catch (error) {
    console.error('[WABA CONNECT]', error)
    return NextResponse.json({ error: 'Erro ao conectar WABA.' }, { status: 500 })
  }
}
