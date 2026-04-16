import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/db', () => ({
  db: {
    scrapingJob: { create: vi.fn(), findMany: vi.fn() },
    workspace: { findUnique: vi.fn() },
  },
}))

vi.mock('@/lib/agents/buscador', () => ({
  canSearch: vi.fn(),
  processScrapingJob: vi.fn(),
}))

vi.mock('@/lib/qstash', () => ({ publishToQueue: vi.fn() }))

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { canSearch, processScrapingJob } from '@/lib/agents/buscador'
import { publishToQueue } from '@/lib/qstash'
import { POST, GET } from '@/app/api/agents/buscador/route'

const mockAuth = auth as ReturnType<typeof vi.fn>
const mockCanSearch = canSearch as ReturnType<typeof vi.fn>
const mockPublish = publishToQueue as ReturnType<typeof vi.fn>
const mockProcessScrapingJob = processScrapingJob as ReturnType<typeof vi.fn>
const mockDb = db as unknown as {
  scrapingJob: { create: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> }
  workspace: { findUnique: ReturnType<typeof vi.fn> }
}

const SESSION = { user: { workspaceId: 'ws-1', id: 'user-1' } }
const JOB = { id: 'job-1', workspaceId: 'ws-1' }

function makePost(body: object) {
  return new NextRequest('http://localhost/api/agents/buscador', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue(SESSION)
  mockCanSearch.mockResolvedValue({ allowed: true, isFree: false })
  mockDb.scrapingJob.create.mockResolvedValue(JOB)
  mockDb.scrapingJob.findMany.mockResolvedValue([])
  mockDb.workspace.findUnique.mockResolvedValue({ hasUsedFreeScraping: false })
  mockPublish.mockResolvedValue(undefined)
  mockProcessScrapingJob.mockResolvedValue(undefined)
})

describe('POST /api/agents/buscador', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await POST(makePost({ query: 'academia', city: 'sp' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when query is missing', async () => {
    const res = await POST(makePost({ city: 'sp' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when city is missing', async () => {
    const res = await POST(makePost({ query: 'academia' }))
    expect(res.status).toBe(400)
  })

  it('returns 402 when insufficient tokens', async () => {
    mockCanSearch.mockResolvedValue({ allowed: false, isFree: false })
    const res = await POST(makePost({ query: 'academia', city: 'sp', maxLeads: 10 }))
    expect(res.status).toBe(402)
    const data = await res.json()
    expect(data.error).toMatch(/tokens/)
  })

  it('creates job and publishes to QStash on success', async () => {
    const res = await POST(makePost({ query: 'academia', city: 'sp', maxLeads: 10 }))
    expect(res.status).toBe(200)
    const data = await res.json()

    expect(data.jobId).toBe('job-1')
    expect(mockDb.scrapingJob.create).toHaveBeenCalledWith({
      data: { workspaceId: 'ws-1', query: 'academia', city: 'sp', zip: null, maxLeads: 10 },
    })
    expect(mockPublish).toHaveBeenCalledWith(
      '/api/queue/buscador-process',
      { jobId: 'job-1' },
      { retries: 2 },
    )
    expect(mockProcessScrapingJob).not.toHaveBeenCalled()
  })

  it('returns isFree=true when first free search', async () => {
    mockCanSearch.mockResolvedValue({ allowed: true, isFree: true })
    const res = await POST(makePost({ query: 'academia', city: 'sp' }))
    const data = await res.json()
    expect(data.isFree).toBe(true)
  })

  it('falls back to processScrapingJob when QStash publish fails', async () => {
    mockPublish.mockRejectedValue(new Error('QStash timeout'))
    const res = await POST(makePost({ query: 'academia', city: 'sp' }))
    expect(res.status).toBe(200)
    // Fallback is fire-and-forget — still returns jobId
    const data = await res.json()
    expect(data.jobId).toBe('job-1')
    // Give microtasks time to settle
    await new Promise((r) => setTimeout(r, 0))
    expect(mockProcessScrapingJob).toHaveBeenCalledWith('job-1')
  })

  it('clamps maxLeads to 100 when value exceeds maximum', async () => {
    await POST(makePost({ query: 'academia', city: 'sp', maxLeads: 999 }))
    expect(mockDb.scrapingJob.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ maxLeads: 100 }) }),
    )
  })

  it('clamps maxLeads to 1 when value is negative', async () => {
    await POST(makePost({ query: 'academia', city: 'sp', maxLeads: -5 }))
    expect(mockDb.scrapingJob.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ maxLeads: 1 }) }),
    )
  })

  it('defaults maxLeads to 20 when not provided', async () => {
    await POST(makePost({ query: 'academia', city: 'sp' }))
    expect(mockDb.scrapingJob.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ maxLeads: 20 }) }),
    )
  })
})

describe('GET /api/agents/buscador', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns jobs and hasUsedFreeScraping', async () => {
    const jobs = [{ id: 'job-1', query: 'academia', city: 'sp', status: 'COMPLETED' }]
    mockDb.scrapingJob.findMany.mockResolvedValue(jobs)
    mockDb.workspace.findUnique.mockResolvedValue({ hasUsedFreeScraping: true })

    const res = await GET()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.jobs).toEqual(jobs)
    expect(data.hasUsedFreeScraping).toBe(true)
  })

  it('returns empty jobs and false hasUsedFreeScraping when workspace not found', async () => {
    mockDb.scrapingJob.findMany.mockResolvedValue([])
    mockDb.workspace.findUnique.mockResolvedValue(null)

    const res = await GET()
    const data = await res.json()
    expect(data.jobs).toEqual([])
    expect(data.hasUsedFreeScraping).toBe(false)
  })
})
