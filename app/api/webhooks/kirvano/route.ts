import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { activatePlan, cancelPlan } from '@/lib/billing/subscriptionService'
import { addTokens } from '@/lib/billing/tokenService'
import { findPackageBySlug } from '@/lib/billing/tokenPackages'
import { TokenTransactionType } from '@/generated/prisma/enums'

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
  sale_id?: string          // root-level sale ID
  status?: string
  type?: string
  plan?: {                  // billing plan info
    name?: string
    charge_number?: number
    charge_frequency?: string
    next_charge_date?: string
  }
  customer?: { email: string; name: string }
  products?: Array<{ name?: string; offer_name?: string }>
  utm?: {
    utm_content?: string   // workspaceId
    utm_source?: string    // plan slug (e.g. "growth")
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
  // Identify plan via utm_source (plan slug passed on checkout URL)
  const planSlug = payload.utm?.utm_source ?? 'starter'

  if (!workspaceId) {
    console.warn('[Kirvano] Webhook received without utm_content (workspaceId):', payload.event)
    return NextResponse.json({ received: true })
  }

  const workspace = await db.workspace.findUnique({ where: { id: workspaceId } })
  if (!workspace) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  }

  switch (payload.event) {
    case 'SALE_APPROVED': {
      if (planSlug.startsWith('tokens_')) {
        // Token purchase
        const pkgSlug = planSlug.replace('tokens_', '')
        const pkg = findPackageBySlug(pkgSlug)
        if (pkg) {
          await addTokens(workspaceId, pkg.tokenAmount, TokenTransactionType.PURCHASE, payload.sale_id, `Compra: ${pkg.name}`)
          console.info(`[Kirvano] Tokens added: ${pkg.tokenAmount} for workspace ${workspaceId}`)
        } else {
          console.warn(`[Kirvano] Unknown token package: ${pkgSlug}`)
        }
      } else {
        // Subscription plan
        const nextBilling = payload.plan?.next_charge_date
          ? new Date(payload.plan.next_charge_date)
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

        await activatePlan(workspaceId, planSlug, payload.sale_id, nextBilling)
        console.info(`[Kirvano] Plan activated: ${planSlug} for workspace ${workspaceId}`)
      }
      break
    }

    case 'SUBSCRIPTION_RENEWED': {
      const nextBilling = payload.plan?.next_charge_date
        ? new Date(payload.plan.next_charge_date)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

      await db.workspace.update({
        where: { id: workspaceId },
        data: { subscriptionStatus: 'ACTIVE', currentPeriodEnd: nextBilling },
      })
      await db.subscription.updateMany({
        where: { workspaceId, status: 'ACTIVE' },
        data: { currentPeriodEnd: nextBilling },
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
    case 'REFUND': {
      if (planSlug.startsWith('tokens_')) {
        const pkgSlug = planSlug.replace('tokens_', '')
        const pkg = findPackageBySlug(pkgSlug)
        if (pkg) {
          await addTokens(workspaceId, -pkg.tokenAmount, TokenTransactionType.REFUND, payload.sale_id, `Reembolso: ${pkg.name}`)
          console.info(`[Kirvano] Tokens refunded: ${pkg.tokenAmount} for workspace ${workspaceId}`)
        }
      } else {
        await cancelPlan(workspaceId)
      }
      break
    }

    case 'SUBSCRIPTION_CANCELED': {
      await cancelPlan(workspaceId)
      break
    }

    // Informational events — log only
    case 'BANK_SLIP_GENERATED':
    case 'BANK_SLIP_EXPIRED':
    case 'PIX_GENERATED':
    case 'PIX_EXPIRED':
    case 'PICPAY_GENERATED':
    case 'PICPAY_EXPIRED':
      console.info(`[Kirvano] Informational event: ${payload.event} for workspace ${workspaceId}`)
      break
  }

  return NextResponse.json({ received: true })
}
