import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const workspace = await db.workspace.findUnique({
    where: { id: session.user.workspaceId },
  })

  if (!workspace?.stripeCustomerId) {
    return NextResponse.json({ error: 'Nenhuma assinatura ativa.' }, { status: 400 })
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: workspace.stripeCustomerId,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/${workspace.slug}/settings/billing`,
  })

  return NextResponse.json({ url: portalSession.url })
}
