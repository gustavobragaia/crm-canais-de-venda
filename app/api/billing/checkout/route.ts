import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import Stripe from 'stripe'

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Apenas admins podem gerenciar billing.' }, { status: 403 })
  }

  const { priceId } = await req.json()

  if (!priceId) {
    return NextResponse.json({ error: 'priceId obrigatório.' }, { status: 400 })
  }

  const workspace = await db.workspace.findUnique({
    where: { id: session.user.workspaceId },
  })

  if (!workspace) return NextResponse.json({ error: 'Workspace não encontrado.' }, { status: 404 })

  let customerId = workspace.stripeCustomerId

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: session.user.email,
      name: workspace.name,
      metadata: { workspaceId: workspace.id, workspaceSlug: workspace.slug },
    })
    customerId = customer.id
    await db.workspace.update({
      where: { id: workspace.id },
      data: { stripeCustomerId: customerId },
    })
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/${workspace.slug}/settings/billing?success=1`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/${workspace.slug}/settings/billing`,
    metadata: { workspaceId: workspace.id },
    locale: 'pt-BR',
  })

  return NextResponse.json({ url: checkoutSession.url })
}
