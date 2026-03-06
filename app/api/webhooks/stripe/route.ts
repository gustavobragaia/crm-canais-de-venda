import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { db } from '@/lib/db'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get('stripe-signature')!

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const subscription = event.data.object as Stripe.Subscription

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const workspaceId =
        (subscription.metadata?.workspaceId as string) ||
        (await getWorkspaceByCustomer(subscription.customer as string))

      if (workspaceId) {
        await db.workspace.update({
          where: { id: workspaceId },
          data: {
            subscriptionStatus: subscription.status === 'active' ? 'ACTIVE' : 'TRIAL',
            stripeSubscriptionId: subscription.id,
            currentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
          },
        })
      }
      break
    }

    case 'customer.subscription.deleted': {
      const workspaceId = await getWorkspaceByCustomer(subscription.customer as string)
      if (workspaceId) {
        await db.workspace.update({
          where: { id: workspaceId },
          data: { subscriptionStatus: 'CANCELED' },
        })
      }
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const workspaceId = await getWorkspaceByCustomer(invoice.customer as string)
      if (workspaceId) {
        await db.workspace.update({
          where: { id: workspaceId },
          data: { subscriptionStatus: 'EXPIRED' },
        })
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}

async function getWorkspaceByCustomer(customerId: string): Promise<string | null> {
  const workspace = await db.workspace.findFirst({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  })
  return workspace?.id ?? null
}
