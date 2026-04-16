import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: {
    scrapingJob: { update: vi.fn() },
    workspace: { findUnique: vi.fn(), update: vi.fn() },
    dispatchList: { create: vi.fn() },
    dispatchListContact: { createMany: vi.fn() },
  },
}))

vi.mock('@/lib/integrations/google-places', () => ({
  searchPlaces: vi.fn(),
}))

vi.mock('@/lib/billing/tokenService', () => ({
  consumeTokens: vi.fn(),
}))

import { db } from '@/lib/db'
import { searchPlaces } from '@/lib/integrations/google-places'
import { consumeTokens } from '@/lib/billing/tokenService'
import { filterValidLeads, processScrapingJob } from '@/lib/agents/buscador'
import type { Place } from '@/lib/integrations/google-places'

const mockDb = db as unknown as {
  scrapingJob: { update: ReturnType<typeof vi.fn> }
  workspace: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  dispatchList: { create: ReturnType<typeof vi.fn> }
  dispatchListContact: { createMany: ReturnType<typeof vi.fn> }
}
const mockSearchPlaces = searchPlaces as ReturnType<typeof vi.fn>
const mockConsumeTokens = consumeTokens as ReturnType<typeof vi.fn>

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makePlace(overrides: Partial<Place> = {}): Place {
  return {
    id: 'place-1',
    displayName: { text: 'Academia XYZ' },
    formattedAddress: 'Rua A, 100, São Paulo',
    nationalPhoneNumber: '(11) 99999-9999',
    rating: 4.5,
    userRatingCount: 50,
    ...overrides,
  }
}

const BASE_JOB = {
  id: 'job-1',
  workspaceId: 'ws-1',
  query: 'academia',
  city: 'são paulo',
  zip: null,
  maxLeads: 10,
}

// ─── filterValidLeads ─────────────────────────────────────────────────────────

describe('filterValidLeads', () => {
  it('keeps place with rating > 3, phone, reviews > 1, phone starting with 9', () => {
    const result = filterValidLeads([makePlace()])
    expect(result).toHaveLength(1)
  })

  it('removes place with rating <= 3', () => {
    expect(filterValidLeads([makePlace({ rating: 3 })])).toHaveLength(0)
    expect(filterValidLeads([makePlace({ rating: 2.5 })])).toHaveLength(0)
  })

  it('removes place with no rating', () => {
    expect(filterValidLeads([makePlace({ rating: undefined })])).toHaveLength(0)
  })

  it('removes place with no phone number', () => {
    expect(filterValidLeads([makePlace({ nationalPhoneNumber: undefined })])).toHaveLength(0)
  })

  it('removes place with userRatingCount <= 1', () => {
    expect(filterValidLeads([makePlace({ userRatingCount: 1 })])).toHaveLength(0)
    expect(filterValidLeads([makePlace({ userRatingCount: 0 })])).toHaveLength(0)
  })

  it('removes place whose phone does not start with 9 (after DD)', () => {
    // DDD + number starting with 8 (landline)
    expect(filterValidLeads([makePlace({ nationalPhoneNumber: '(11) 88888-8888' })])).toHaveLength(0)
  })

  it('filters mixed list correctly', () => {
    const places = [
      makePlace({ id: 'p1' }),                                          // valid
      makePlace({ id: 'p2', rating: 2 }),                               // invalid: low rating
      makePlace({ id: 'p3', nationalPhoneNumber: undefined }),           // invalid: no phone
      makePlace({ id: 'p4', userRatingCount: 1 }),                      // invalid: few reviews
      makePlace({ id: 'p5', nationalPhoneNumber: '(11) 83333-3333' }),  // invalid: starts with 8
    ]
    const result = filterValidLeads(places)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('p1')
  })
})

// ─── processScrapingJob ───────────────────────────────────────────────────────

describe('processScrapingJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Remove OPENAI_API_KEY so summarizeReviews returns '' without HTTP calls
    delete process.env.OPENAI_API_KEY

    mockDb.scrapingJob.update.mockResolvedValue(BASE_JOB)
    mockDb.workspace.findUnique.mockResolvedValue({ hasUsedFreeScraping: false })
    mockDb.workspace.update.mockResolvedValue({})
    mockDb.dispatchList.create.mockResolvedValue({ id: 'list-1' })
    mockDb.dispatchListContact.createMany.mockResolvedValue({ count: 1 })
    mockConsumeTokens.mockResolvedValue({ success: true, newBalance: 8 })
    mockSearchPlaces.mockResolvedValue([makePlace()])
  })

  it('marks job as RUNNING on start', async () => {
    await processScrapingJob('job-1')
    expect(mockDb.scrapingJob.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: expect.objectContaining({ status: 'RUNNING', startedAt: expect.any(Date) }),
    })
  })

  it('marks job as COMPLETED with correct counts', async () => {
    await processScrapingJob('job-1')

    const lastCall = mockDb.scrapingJob.update.mock.calls.at(-1)![0]
    expect(lastCall.data.status).toBe('COMPLETED')
    expect(lastCall.data.validLeads).toBe(1)
    expect(lastCall.data.listId).toBe('list-1')
    expect(lastCall.data.completedAt).toBeInstanceOf(Date)
  })

  it('calls searchPlaces with rawLimit = maxLeads * 3 for paid search', async () => {
    mockDb.workspace.findUnique.mockResolvedValue({ hasUsedFreeScraping: true })
    await processScrapingJob('job-1')
    expect(mockSearchPlaces).toHaveBeenCalledWith('academia', 'são paulo', undefined, 30) // 10 * 3
  })

  it('calls searchPlaces with rawLimit = 5 for free search', async () => {
    mockDb.workspace.findUnique.mockResolvedValue({ hasUsedFreeScraping: false })
    await processScrapingJob('job-1')
    expect(mockSearchPlaces).toHaveBeenCalledWith('academia', 'são paulo', undefined, 5)
  })

  it('caps free search to 1 lead even if more are found', async () => {
    mockDb.workspace.findUnique.mockResolvedValue({ hasUsedFreeScraping: false })
    mockSearchPlaces.mockResolvedValue([makePlace({ id: 'p1' }), makePlace({ id: 'p2' })])

    await processScrapingJob('job-1')

    const contactsCall = mockDb.dispatchListContact.createMany.mock.calls[0][0]
    expect(contactsCall.data).toHaveLength(1)
  })

  it('does not charge tokens for free search', async () => {
    mockDb.workspace.findUnique.mockResolvedValue({ hasUsedFreeScraping: false })
    await processScrapingJob('job-1')
    expect(mockConsumeTokens).not.toHaveBeenCalled()
  })

  it('charges tokens for paid search: ceil(leads / 2)', async () => {
    mockDb.workspace.findUnique.mockResolvedValue({ hasUsedFreeScraping: true })
    mockSearchPlaces.mockResolvedValue([
      makePlace({ id: 'p1' }),
      makePlace({ id: 'p2' }),
      makePlace({ id: 'p3' }),
    ])

    await processScrapingJob('job-1')

    expect(mockConsumeTokens).toHaveBeenCalledWith(
      'ws-1',
      2, // ceil(3 / 2)
      'buscador',
      'job-1',
      expect.stringContaining('academia'),
    )
  })

  it('does not charge tokens when no valid leads found', async () => {
    mockDb.workspace.findUnique.mockResolvedValue({ hasUsedFreeScraping: true })
    mockSearchPlaces.mockResolvedValue([makePlace({ rating: 1 })]) // filtered out

    await processScrapingJob('job-1')
    expect(mockConsumeTokens).not.toHaveBeenCalled()
  })

  it('creates DispatchList with correct name', async () => {
    await processScrapingJob('job-1')
    expect(mockDb.dispatchList.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Busca: academia são paulo',
        source: 'buscador',
        workspaceId: 'ws-1',
      }),
    })
  })

  it('deduplicates leads with same place id', async () => {
    mockDb.workspace.findUnique.mockResolvedValue({ hasUsedFreeScraping: true })
    mockSearchPlaces.mockResolvedValue([
      makePlace({ id: 'same-id' }),
      makePlace({ id: 'same-id' }), // duplicate
    ])

    await processScrapingJob('job-1')
    const contactsCall = mockDb.dispatchListContact.createMany.mock.calls[0][0]
    expect(contactsCall.data).toHaveLength(1)
  })

  it('locks hasUsedFreeScraping immediately before searching', async () => {
    const callOrder: string[] = []
    mockDb.workspace.update.mockImplementation(async (args: { data?: { hasUsedFreeScraping?: boolean } }) => {
      if (args?.data?.hasUsedFreeScraping === true) callOrder.push('lock')
      return {}
    })
    mockSearchPlaces.mockImplementation(async () => { callOrder.push('search'); return [makePlace()] })

    await processScrapingJob('job-1')
    expect(callOrder[0]).toBe('lock')
    expect(callOrder[1]).toBe('search')
  })

  it('marks job as FAILED and saves error message on exception', async () => {
    mockSearchPlaces.mockRejectedValue(new Error('Google Places API error: 403'))

    await processScrapingJob('job-1')

    const lastCall = mockDb.scrapingJob.update.mock.calls.at(-1)![0]
    expect(lastCall.data.status).toBe('FAILED')
    expect(lastCall.data.error).toBe('Google Places API error: 403')
    expect(lastCall.data.completedAt).toBeInstanceOf(Date)
  })

  it('marks job as FAILED with generic message for non-Error exceptions', async () => {
    mockSearchPlaces.mockRejectedValue('string error')

    await processScrapingJob('job-1')

    const lastCall = mockDb.scrapingJob.update.mock.calls.at(-1)![0]
    expect(lastCall.data.status).toBe('FAILED')
    expect(lastCall.data.error).toBe('Unknown error')
  })
})
