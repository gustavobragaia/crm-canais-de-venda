import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Kirvano webhook event types
type KirvanoEvent =
  | 'SALE_APPROVED'
  | 'SALE_REFUSED'
  | 'SALE_CHARGEBACK'
  | 'REFUND'
  | 'SUBSCRIPTION_CANCELED'
  | 'SUBSCRIPTION_RENEWED'
  | 'SUBSCRIPTION_OVERDUE'
  | 'BANK_SLIP_GENERATED'
  | 'BANK_SLIP_EXPIRED'
  | 'PIX_GENERATED'
  | 'PIX_EXPIRED'
  | 'PICPAY_GENERATED'
  | 'PICPAY_EXPIRED'

interface KirvanoPayload {
  event: KirvanoEvent
  sale?: {
    id: string
    status: string
  }
  subscription?: {
    id: string
    next_billing_date?: string
  }
  customer?: {
    email: string
    name: string
  }
  utm?: {
    utm_content?: string
    utm_source?: string
    utm_medium?: string
    utm_campaign?: string
  }
}

export async function POST(req: NextRequest) {
  // Verify Kirvano token
  const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? req.headers.get('x-kirvano-token')
  if (process.env.KIRVANO_WEBHOOK_TOKEN && token !== process.env.KIRVANO_WEBHOOK_TOKEN) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  let payload: KirvanoPayload
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Identify workspace via utm_content (workspaceId passed on checkout URL)
  const workspaceId = payload.utm?.utm_content

  if (!workspaceId) {
    // Log and return OK to avoid Kirvano retries for events without workspace context
    console.warn('[Kirvano] Webhook received without utm_content (workspaceId):', payload.event)
    return NextResponse.json({ received: true })
  }

  const workspace = await db.workspace.findUnique({ where: { id: workspaceId } })
  if (!workspace) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  }

  switch (payload.event) {
    case 'SALE_APPROVED': {
      const nextBilling = payload.subscription?.next_billing_date
        ? new Date(payload.subscription.next_billing_date)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // fallback: +30 days

      await db.workspace.update({
        where: { id: workspaceId },
        data: {
          subscriptionStatus: 'ACTIVE',
          kirvanoSubscriptionId: payload.subscription?.id ?? null,
          currentPeriodEnd: nextBilling,
        },
      })
      break
    }

    case 'SALE_REFUSED':
    case 'SUBSCRIPTION_OVERDUE': {
      await db.workspace.update({
        where: { id: workspaceId },
        data: { subscriptionStatus: 'EXPIRED' },
      })
      break
    }

    case 'SALE_CHARGEBACK':
    case 'REFUND':
    case 'SUBSCRIPTION_CANCELED': {
      await db.workspace.update({
        where: { id: workspaceId },
        data: { subscriptionStatus: 'CANCELED' },
      })
      break
    }

    case 'SUBSCRIPTION_RENEWED': {
      const nextBilling = payload.subscription?.next_billing_date
        ? new Date(payload.subscription.next_billing_date)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

      await db.workspace.update({
        where: { id: workspaceId },
        data: {
          subscriptionStatus: 'ACTIVE',
          currentPeriodEnd: nextBilling,
        },
      })
      break
    }

    // Informational events — log only, no status change
    case 'BANK_SLIP_GENERATED':
    case 'BANK_SLIP_EXPIRED':
    case 'PIX_GENERATED':
    case 'PIX_EXPIRED':
    case 'PICPAY_GENERATED':
    case 'PICPAY_EXPIRED':
      console.info(`[Kirvano] Informational event received: ${payload.event} for workspace ${workspaceId}`)
      break
  }

  return NextResponse.json({ received: true })
}
