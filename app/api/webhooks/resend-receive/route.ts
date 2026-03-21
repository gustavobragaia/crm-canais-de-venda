import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { sendEmail } from '@/lib/email/resend'

const resend = new Resend(process.env.RESEND_API_KEY)
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

    // Fetch full email content via Resend API
    let bodyHtml = ''
    let bodyText = ''
    try {
      const full = await resend.emails.get(data.email_id)
      bodyHtml = (full.data as any)?.html ?? ''
      bodyText = (full.data as any)?.text ?? ''
    } catch (e) {
      console.warn('[RESEND-RECEIVE] could not fetch email body:', e)
    }

    const html = bodyHtml || (bodyText
      ? `<pre style="font-family:sans-serif;white-space:pre-wrap">${bodyText}</pre>`
      : '<p><em>(corpo do email não disponível)</em></p>')

    await sendEmail({
      to: FORWARD_TO,
      subject: `[Encaminhado] ${data.subject ?? '(sem assunto)'}`,
      html: `
        <p><strong>De:</strong> ${data.from}</p>
        <p><strong>Para:</strong> ${data.to?.join(', ')}</p>
        <p><strong>Assunto:</strong> ${data.subject}</p>
        <hr />
        ${html}
      `,
    })

    return NextResponse.json({ status: 'OK' })
  } catch (error) {
    console.error('[RESEND-RECEIVE] error:', error)
    return NextResponse.json({ status: 'ERROR' }, { status: 500 })
  }
}
