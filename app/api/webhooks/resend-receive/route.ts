import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email/resend'

const FORWARD_TO = process.env.RESEND_FORWARD_TO ?? 'gustavobragaia12@gmail.com'
const INBOX_ADDRESS = 'gustavo@closiocrm.com'

export async function POST(req: NextRequest) {
  try {
    const event = await req.json()

    if (event.type !== 'email.received') {
      return NextResponse.json({ status: 'IGNORED' })
    }

    const data = event.data as {
      email_id: string
      from: string
      to: string[]
      subject: string
      message_id: string
    }

    // Only process emails addressed to our inbox
    const isForUs = data.to?.some((addr: string) =>
      addr.toLowerCase().includes(INBOX_ADDRESS)
    )
    if (!isForUs) {
      return NextResponse.json({ status: 'IGNORED' })
    }

    await sendEmail({
      to: FORWARD_TO,
      subject: `[Encaminhado] ${data.subject ?? '(sem assunto)'}`,
      html: `
        <p><strong>De:</strong> ${data.from}</p>
        <p><strong>Para:</strong> ${data.to?.join(', ')}</p>
        <p><strong>Assunto:</strong> ${data.subject}</p>
        <hr />
        <p><em>Email recebido em ${INBOX_ADDRESS} e encaminhado automaticamente.</em></p>
      `,
    })

    return NextResponse.json({ status: 'OK' })
  } catch (error) {
    console.error('[RESEND-RECEIVE] error:', error)
    return NextResponse.json({ status: 'ERROR' }, { status: 500 })
  }
}
