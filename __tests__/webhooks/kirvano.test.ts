import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockWorkspace = { id: 'ws-123', plan: 'growth', subscriptionStatus: 'ACTIVE' }

vi.mock('@/lib/db', () => ({
  db: {
    workspace: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    subscription: {
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/billing/subscriptionService', () => ({
  activatePlan: vi.fn(),
  cancelPlan: vi.fn(),
}))

import { db } from '@/lib/db'
import { activatePlan, cancelPlan } from '@/lib/billing/subscriptionService'
import { POST } from '@/app/api/webhooks/kirvano/route'

const mockDb = db as {
  workspace: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  subscription: { updateMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> }
  $transaction: ReturnType<typeof vi.fn>
}

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/webhooks/kirvano', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

const UTM = { utm_content: 'ws-123', utm_source: 'growth' }

beforeEach(() => {
  vi.clearAllMocks()
  mockDb.workspace.findUnique.mockResolvedValue(mockWorkspace)
  mockDb.workspace.update.mockResolvedValue({})
  mockDb.subscription.updateMany.mockResolvedValue({})
  mockDb.subscription.create.mockResolvedValue({})
  ;(activatePlan as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
  ;(cancelPlan as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
  delete process.env.KIRVANO_WEBHOOK_TOKEN
})

describe('POST /api/webhooks/kirvano', () => {
  describe('SALE_APPROVED', () => {
    it('RECURRING: calls activatePlan with plan.next_charge_date', async () => {
      const req = makeRequest({
        event: 'SALE_APPROVED',
        type: 'RECURRING',
        sale_id: 'XEQP966E',
        plan: { next_charge_date: '2026-04-18 14:42:54' },
        utm: UTM,
      })

      const res = await POST(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data).toEqual({ received: true })
      expect(activatePlan).toHaveBeenCalledWith(
        'ws-123',
        'growth',
        'XEQP966E',
        new Date('2026-04-18 14:42:54'),
      )
    })

    it('ONE_TIME: calls activatePlan with ~30 day fallback (no plan field)', async () => {
      const before = Date.now()
      const req = makeRequest({
        event: 'SALE_APPROVED',
        type: 'ONE_TIME',
        sale_id: 'ABC123',
        utm: UTM,
      })

      const res = await POST(req)
      expect(res.status).toBe(200)
      expect(activatePlan).toHaveBeenCalledWith(
        'ws-123',
        'growth',
        'ABC123',
        expect.any(Date),
      )

      const callDate: Date = (activatePlan as ReturnType<typeof vi.fn>).mock.calls[0][3]
      expect(callDate.getTime()).toBeGreaterThan(before + 29 * 24 * 60 * 60 * 1000)
    })
  })

  describe('SALE_REFUSED', () => {
    it('sets subscriptionStatus to EXPIRED', async () => {
      const res = await POST(makeRequest({ event: 'SALE_REFUSED', utm: UTM }))
      expect(res.status).toBe(200)
      expect(mockDb.workspace.update).toHaveBeenCalledWith({
        where: { id: 'ws-123' },
        data: { subscriptionStatus: 'EXPIRED' },
      })
    })
  })

  describe('SUBSCRIPTION_OVERDUE', () => {
    it('sets subscriptionStatus to EXPIRED', async () => {
      const res = await POST(makeRequest({ event: 'SUBSCRIPTION_OVERDUE', utm: UTM }))
      expect(res.status).toBe(200)
      expect(mockDb.workspace.update).toHaveBeenCalledWith({
        where: { id: 'ws-123' },
        data: { subscriptionStatus: 'EXPIRED' },
      })
    })
  })

  describe('SALE_CHARGEBACK', () => {
    it('calls cancelPlan', async () => {
      const res = await POST(makeRequest({ event: 'SALE_CHARGEBACK', utm: UTM }))
      expect(res.status).toBe(200)
      expect(cancelPlan).toHaveBeenCalledWith('ws-123')
    })
  })

  describe('REFUND', () => {
    it('calls cancelPlan', async () => {
      const res = await POST(makeRequest({ event: 'REFUND', utm: UTM }))
      expect(res.status).toBe(200)
      expect(cancelPlan).toHaveBeenCalledWith('ws-123')
    })
  })

  describe('SUBSCRIPTION_CANCELED', () => {
    it('calls cancelPlan', async () => {
      const res = await POST(makeRequest({ event: 'SUBSCRIPTION_CANCELED', utm: UTM }))
      expect(res.status).toBe(200)
      expect(cancelPlan).toHaveBeenCalledWith('ws-123')
    })
  })

  describe('SUBSCRIPTION_RENEWED', () => {
    it('sets ACTIVE and updates currentPeriodEnd', async () => {
      const req = makeRequest({
        event: 'SUBSCRIPTION_RENEWED',
        plan: { next_charge_date: '2026-05-18 10:00:00' },
        utm: UTM,
      })

      const res = await POST(req)
      expect(res.status).toBe(200)
      expect(mockDb.workspace.update).toHaveBeenCalledWith({
        where: { id: 'ws-123' },
        data: { subscriptionStatus: 'ACTIVE', currentPeriodEnd: new Date('2026-05-18 10:00:00') },
      })
      expect(mockDb.subscription.updateMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-123', status: 'ACTIVE' },
        data: { currentPeriodEnd: new Date('2026-05-18 10:00:00') },
      })
    })
  })

  describe('Informational events', () => {
    it.each(['PIX_GENERATED', 'PIX_EXPIRED', 'BANK_SLIP_GENERATED', 'BANK_SLIP_EXPIRED'])(
      '%s: returns 200 without updating DB',
      async (event) => {
        const res = await POST(makeRequest({ event, utm: UTM }))
        expect(res.status).toBe(200)
        expect(activatePlan).not.toHaveBeenCalled()
        expect(cancelPlan).not.toHaveBeenCalled()
        expect(mockDb.workspace.update).not.toHaveBeenCalled()
      },
    )
  })

  describe('Edge cases', () => {
    it('returns 200 without crash when utm_content is missing', async () => {
      const res = await POST(makeRequest({ event: 'SALE_APPROVED', utm: {} }))
      expect(res.status).toBe(200)
      expect(activatePlan).not.toHaveBeenCalled()
    })

    it('returns 404 when workspace not found', async () => {
      mockDb.workspace.findUnique.mockResolvedValue(null)
      const res = await POST(makeRequest({ event: 'SALE_APPROVED', utm: UTM }))
      expect(res.status).toBe(404)
    })

    it('returns 400 on invalid JSON body', async () => {
      const req = new NextRequest('http://localhost/api/webhooks/kirvano', {
        method: 'POST',
        body: 'not-json',
        headers: { 'content-type': 'application/json' },
      })
      const res = await POST(req)
      expect(res.status).toBe(400)
    })

    it('returns 401 when KIRVANO_WEBHOOK_TOKEN is set but token is wrong', async () => {
      process.env.KIRVANO_WEBHOOK_TOKEN = 'secret-token'
      const req = new NextRequest('http://localhost/api/webhooks/kirvano', {
        method: 'POST',
        body: JSON.stringify({ event: 'SALE_APPROVED', utm: UTM }),
        headers: { 'content-type': 'application/json', authorization: 'Bearer wrong-token' },
      })
      const res = await POST(req)
      expect(res.status).toBe(401)
    })
  })
})
