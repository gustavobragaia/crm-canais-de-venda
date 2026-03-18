export interface PlanConfig {
  slug: string
  name: string
  priceCents: number
  userLimit: number
  conversationLimit: number
  checkoutUrl: string
}

export const PLANS: Record<string, PlanConfig> = {
  trial: {
    slug: 'trial',
    name: 'Trial',
    priceCents: 0,
    userLimit: 2,
    conversationLimit: 10,
    checkoutUrl: '',
  },
  solo: {
    slug: 'solo',
    name: 'Solo',
    priceCents: 9700,
    userLimit: 1,
    conversationLimit: 999999,
    checkoutUrl: process.env.NEXT_PUBLIC_KIRVANO_CHECKOUT_URL_SOLO ?? '',
  },
  starter: {
    slug: 'starter',
    name: 'Starter',
    priceCents: 29700,
    userLimit: 3,
    conversationLimit: 999999,
    checkoutUrl: process.env.NEXT_PUBLIC_KIRVANO_CHECKOUT_URL_STARTER ?? '',
  },
  growth: {
    slug: 'growth',
    name: 'Growth',
    priceCents: 49700,
    userLimit: 7,
    conversationLimit: 999999,
    checkoutUrl: process.env.NEXT_PUBLIC_KIRVANO_CHECKOUT_URL_GROWTH ?? '',
  },
  business: {
    slug: 'business',
    name: 'Business',
    priceCents: 99700,
    userLimit: 12,
    conversationLimit: 999999,
    checkoutUrl: process.env.NEXT_PUBLIC_KIRVANO_CHECKOUT_URL_BUSINESS ?? '',
  },
}

export function getPlanConfig(slug: string): PlanConfig {
  return PLANS[slug] ?? PLANS.trial
}

export function getUserLimit(slug: string): number {
  return getPlanConfig(slug).userLimit
}

export function getNextPlan(currentSlug: string): PlanConfig | null {
  // trial and solo both recommend Starter directly
  if (currentSlug === 'trial' || currentSlug === 'solo') return PLANS.starter
  const order = ['starter', 'growth', 'business']
  const idx = order.indexOf(currentSlug)
  if (idx === -1 || idx >= order.length - 1) return null
  return PLANS[order[idx + 1]] ?? null
}
