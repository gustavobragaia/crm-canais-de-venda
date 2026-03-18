import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM = process.env.RESEND_FROM ?? 'ClosioCRM <noreply@closiocrm.com>'

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string
  subject: string
  html: string
}) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[Email] RESEND_API_KEY not set — skipping email send')
    return
  }
  const { error } = await resend.emails.send({ from: FROM, to, subject, html })
  if (error) console.error('[Email] send error:', error)
}
