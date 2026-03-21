import { db } from '@/lib/db'
import { searchPlaces, type Place } from '@/lib/integrations/google-places'
import { consumeTokens } from '@/lib/billing/tokenService'

// ─── Filter ───

export function filterValidLeads(places: Place[]): Place[] {
  return places.filter((place) => {
    if (!place.rating || place.rating <= 3) return false
    if (!place.nationalPhoneNumber) return false
    if (!place.userRatingCount || place.userRatingCount <= 1) return false
    const digits = place.nationalPhoneNumber.replace(/\D/g, '')
    const phonePart = digits.length > 2 ? digits.slice(2) : digits
    if (!phonePart.startsWith('9')) return false
    return true
  })
}

// ─── Format phone to +55DDXXXXXXXXX ───

function formatPhone(nationalPhone: string): string {
  const digits = nationalPhone.replace(/\D/g, '')
  if (digits.startsWith('55')) return `+${digits}`
  return `+55${digits}`
}

// ─── Summarize Reviews via GPT-4o-mini ───

export async function summarizeReviews(place: Place): Promise<string> {
  if (!place.reviews || place.reviews.length === 0) return ''

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return ''

  const reviewTexts = place.reviews
    .filter((r) => r.text?.text)
    .map((r) => `- ${r.text!.text} (${r.rating ?? '?'}★)`)
    .join('\n')

  if (!reviewTexts) return ''

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        max_tokens: 200,
        messages: [
          {
            role: 'system',
            content:
              'Faça um resumo conciso (2-3 frases) das reviews do estabelecimento. Esse conhecimento será usado para outreach comercial. Foque em pontos positivos e negativos relevantes. Responda em português.',
          },
          {
            role: 'user',
            content: `Estabelecimento: ${place.displayName.text}\nReviews:\n${reviewTexts}`,
          },
        ],
      }),
    })

    if (!res.ok) return ''

    const data = await res.json()
    return data.choices?.[0]?.message?.content?.trim() ?? ''
  } catch {
    return ''
  }
}

// ─── Can Search ───

export async function canSearch(workspaceId: string, maxLeads = 20): Promise<{ allowed: boolean; isFree: boolean }> {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { hasUsedFreeScraping: true, tokenBalance: true },
  })
  if (!workspace) return { allowed: false, isFree: false }

  if (!workspace.hasUsedFreeScraping) return { allowed: true, isFree: true }

  const tokensNeeded = Math.ceil(maxLeads / 2)
  return { allowed: workspace.tokenBalance >= tokensNeeded, isFree: false }
}

// ─── Process Scraping Job ───

export async function processScrapingJob(jobId: string): Promise<void> {
  try {
    // 1. Mark as running
    const job = await db.scrapingJob.update({
      where: { id: jobId },
      data: { status: 'RUNNING', startedAt: new Date() },
    })

    // 1b. Check if this is the free search, then lock it immediately
    const workspaceBefore = await db.workspace.findUnique({
      where: { id: job.workspaceId },
      select: { hasUsedFreeScraping: true },
    })
    const isFree = !workspaceBefore?.hasUsedFreeScraping
    await db.workspace.update({
      where: { id: job.workspaceId },
      data: { hasUsedFreeScraping: true },
    })

    // 2. Search Google Places — fetch ~3× raw results to compensate for filtering, cap at 120 (6 pages)
    const rawLimit = isFree ? 5 : Math.min(job.maxLeads * 3, 120)
    const places = await searchPlaces(job.query, job.city, job.zip ?? undefined, rawLimit)

    // 3. Filter valid leads
    const validLeads = filterValidLeads(places)

    // 4. Deduplicate by place ID
    const seen = new Set<string>()
    const uniqueLeads = validLeads.filter((p) => {
      if (seen.has(p.id)) return false
      seen.add(p.id)
      return true
    })

    // 4b. Cap to maxLeads (free search is limited to 1 sample lead)
    const cap = isFree ? 1 : job.maxLeads
    const capped = uniqueLeads.slice(0, cap)

    // 5. Summarize reviews for each lead
    const leadsWithSummaries = await Promise.all(
      capped.map(async (place) => {
        const reviewSummary = await summarizeReviews(place)
        return { place, reviewSummary }
      }),
    )

    // 6. Create DispatchList
    const list = await db.dispatchList.create({
      data: {
        workspaceId: job.workspaceId,
        name: `Busca: ${job.query} ${job.city}`,
        source: 'buscador',
        scrapingJobId: jobId,
        contactCount: leadsWithSummaries.length,
      },
    })

    // 7. Create contacts
    if (leadsWithSummaries.length > 0) {
      await db.dispatchListContact.createMany({
        data: leadsWithSummaries.map(({ place, reviewSummary }) => ({
          listId: list.id,
          name: place.displayName.text,
          phone: formatPhone(place.nationalPhoneNumber!),
          address: place.formattedAddress,
          businessType: place.primaryTypeDisplayName?.text ?? place.primaryType ?? null,
          rating: place.rating ?? null,
          reviewCount: place.userRatingCount ?? null,
          reviewSummary: reviewSummary || null,
          website: place.websiteUri ?? null,
          placeId: place.id,
        })),
        skipDuplicates: true,
      })
    }

    // 8. Charge tokens (if not free)
    if (!isFree && leadsWithSummaries.length > 0) {
      const tokensToCharge = Math.ceil(leadsWithSummaries.length / 2)
      await consumeTokens(job.workspaceId, tokensToCharge, 'buscador', jobId, `Busca: ${job.query} ${job.city} (${leadsWithSummaries.length} leads)`)
    }

    // 9. Update job as completed
    await db.scrapingJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        totalFound: places.length,
        validLeads: leadsWithSummaries.length,
        listId: list.id,
        results: JSON.parse(JSON.stringify(leadsWithSummaries.map(({ place }) => ({
          id: place.id,
          name: place.displayName.text,
          phone: place.nationalPhoneNumber,
          address: place.formattedAddress,
          type: place.primaryTypeDisplayName?.text,
          rating: place.rating,
          reviewCount: place.userRatingCount,
        })))),
        completedAt: new Date(),
      },
    })
  } catch (err) {
    console.error('[BUSCADOR] processScrapingJob error:', err)
    await db.scrapingJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        error: err instanceof Error ? err.message : 'Unknown error',
        completedAt: new Date(),
      },
    }).catch(() => {})
  }
}
