const PLACES_URL = 'https://places.googleapis.com/v1/places:searchText'

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.primaryType',
  'places.primaryTypeDisplayName',
  'places.nationalPhoneNumber',
  'places.rating',
  'places.userRatingCount',
  'places.websiteUri',
  'places.editorialSummary',
  'places.reviews',
].join(',')

export interface Place {
  id: string
  displayName: { text: string }
  formattedAddress: string
  primaryType?: string
  primaryTypeDisplayName?: { text: string }
  nationalPhoneNumber?: string
  rating?: number
  userRatingCount?: number
  websiteUri?: string
  editorialSummary?: { text: string }
  reviews?: Array<{ text?: { text: string }; rating?: number }>
}

interface SearchTextResponse {
  places?: Place[]
  nextPageToken?: string
}

export async function searchPlaces(
  query: string,
  city: string,
  zip?: string,
  maxRawResults = 60,
): Promise<Place[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY not configured')

  const textQuery = zip ? `${query} ${city} cep ${zip}` : `${query} ${city}`
  const all: Place[] = []
  let pageToken: string | undefined = undefined

  while (all.length < maxRawResults) {
    const body: Record<string, unknown> = { textQuery, pageSize: 20 }
    if (pageToken) body.pageToken = pageToken

    const res = await fetch(PLACES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const error = await res.text()
      console.error('[GOOGLE PLACES] API error:', res.status, error)
      throw new Error(`Google Places API error: ${res.status}`)
    }

    const data: SearchTextResponse = await res.json()
    all.push(...(data.places ?? []))

    if (!data.nextPageToken) break
    pageToken = data.nextPageToken
  }

  return all
}
