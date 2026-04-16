import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('@/lib/queue/verify', () => ({
  verifyQStashSignature: vi.fn(),
  parseQStashBody: vi.fn(),
}))

vi.mock('@/lib/agents/buscador', () => ({
  processScrapingJob: vi.fn(),
}))

import { verifyQStashSignature, parseQStashBody } from '@/lib/queue/verify'
import { processScrapingJob } from '@/lib/agents/buscador'
import { POST } from '@/app/api/queue/buscador-process/route'

const mockVerify = verifyQStashSignature as ReturnType<typeof vi.fn>
const mockParse = parseQStashBody as ReturnType<typeof vi.fn>
const mockProcess = processScrapingJob as ReturnType<typeof vi.fn>

function makeRequest(body = '{"jobId":"job-1"}') {
  return new NextRequest('http://localhost/api/queue/buscador-process', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockVerify.mockResolvedValue(null) // null = signature valid / dev bypass
  mockParse.mockResolvedValue({ jobId: 'job-1' })
  mockProcess.mockResolvedValue(undefined)
})

describe('POST /api/queue/buscador-process', () => {
  it('returns 401 when QStash signature is invalid', async () => {
    const unauthorized = NextResponse.json({ error: 'Missing QStash signature' }, { status: 401 })
    mockVerify.mockResolvedValue(unauthorized)

    const res = await POST(makeRequest())
    expect(res.status).toBe(401)
    expect(mockProcess).not.toHaveBeenCalled()
  })

  it('calls processScrapingJob with jobId and returns 200', async () => {
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toEqual({ success: true })
    expect(mockProcess).toHaveBeenCalledWith('job-1')
  })

  it('awaits processScrapingJob before returning', async () => {
    const order: string[] = []
    mockProcess.mockImplementation(async () => {
      order.push('process')
    })

    const res = await POST(makeRequest())
    order.push('response')

    expect(order).toEqual(['process', 'response'])
    expect(res.status).toBe(200)
  })

  it('propagates error from processScrapingJob', async () => {
    mockProcess.mockRejectedValue(new Error('DB failure'))
    await expect(POST(makeRequest())).rejects.toThrow('DB failure')
  })

  it('verifies signature before parsing body', async () => {
    const callOrder: string[] = []
    mockVerify.mockImplementation(async () => { callOrder.push('verify'); return null })
    mockParse.mockImplementation(async () => { callOrder.push('parse'); return { jobId: 'job-1' } })

    await POST(makeRequest())
    expect(callOrder).toEqual(['verify', 'parse'])
  })
})
