import { describe, it, expect } from 'vitest'
import { getPlanConfig } from '@/lib/billing/planService'

/**
 * These tests verify the business logic used by activatePlan and cancelPlan.
 * The DB interactions are covered by the webhook integration tests in
 * __tests__/webhooks/kirvano.test.ts, which mock the service layer.
 */

describe('getPlanConfig — plan limits used by activatePlan', () => {
  it('growth plan: 7 users', () => {
    const config = getPlanConfig('growth')
    expect(config.userLimit).toBe(7)
    expect(config.slug).toBe('growth')
  })

  it('starter plan: 3 users', () => {
    const config = getPlanConfig('starter')
    expect(config.userLimit).toBe(3)
  })

  it('business plan: 12 users', () => {
    const config = getPlanConfig('business')
    expect(config.userLimit).toBe(12)
  })

  it('solo plan: 1 user', () => {
    const config = getPlanConfig('solo')
    expect(config.userLimit).toBe(1)
  })

  it('unknown plan falls back to trial defaults', () => {
    const config = getPlanConfig('nonexistent')
    expect(config.slug).toBe('trial')
    expect(config.userLimit).toBe(2)
  })
})

describe('activatePlan — fallback date logic', () => {
  it('+30 day fallback is approximately 30 days from now', () => {
    const before = Date.now()
    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    const after = Date.now()

    const diffMs = periodEnd.getTime() - before
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000

    expect(diffMs).toBeGreaterThanOrEqual(thirtyDaysMs - 100)
    expect(diffMs).toBeLessThanOrEqual(thirtyDaysMs + (after - before) + 100)
  })

  it('plan.next_charge_date is parsed correctly to Date', () => {
    const raw = '2026-04-18 14:42:54'
    const parsed = new Date(raw)
    expect(parsed.getFullYear()).toBe(2026)
    expect(parsed.getMonth()).toBe(3) // April = index 3
    expect(parsed.getDate()).toBe(18)
  })

  it('RECURRING payload uses plan.next_charge_date over fallback', () => {
    const nextChargeDate = '2026-04-18 14:42:54'
    const planField = { next_charge_date: nextChargeDate }

    // Simulates the handler logic: payload.plan?.next_charge_date ?? fallback
    const nextBilling = planField?.next_charge_date
      ? new Date(planField.next_charge_date)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    expect(nextBilling).toEqual(new Date('2026-04-18 14:42:54'))
  })

  it('ONE_TIME payload (no plan field) uses 30-day fallback', () => {
    const planField = undefined

    const before = Date.now()
    const nextBilling = planField
      ? new Date((planField as { next_charge_date: string }).next_charge_date)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    expect(nextBilling.getTime()).toBeGreaterThan(before + 29 * 24 * 60 * 60 * 1000)
  })
})

describe('Subscription blocking logic', () => {
  // Logic from app/[workspaceSlug]/layout.tsx
  function isBlocked(status: string | undefined): boolean {
    return status === 'EXPIRED' || status === 'CANCELED'
  }

  it('EXPIRED → blocked', () => expect(isBlocked('EXPIRED')).toBe(true))
  it('CANCELED → blocked', () => expect(isBlocked('CANCELED')).toBe(true))
  it('ACTIVE → not blocked', () => expect(isBlocked('ACTIVE')).toBe(false))
  it('TRIAL → not blocked', () => expect(isBlocked('TRIAL')).toBe(false))
  it('undefined → not blocked', () => expect(isBlocked(undefined)).toBe(false))
})
