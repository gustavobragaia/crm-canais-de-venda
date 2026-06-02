import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? 'conversation-documents'

let client: SupabaseClient | null = null

function getClient(): SupabaseClient {
  if (client) return client
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar configuradas no .env')
  }
  client = createClient(url, serviceKey, { auth: { persistSession: false } })
  return client
}

export async function uploadDocument(path: string, body: Buffer, contentType: string) {
  const { error } = await getClient().storage.from(STORAGE_BUCKET).upload(path, body, {
    contentType,
    upsert: false,
  })
  if (error) throw new Error(`Supabase upload failed: ${error.message}`)
}

export async function getSignedUrl(path: string, expiresIn = 3600) {
  const { data, error } = await getClient().storage.from(STORAGE_BUCKET).createSignedUrl(path, expiresIn)
  if (error || !data) throw new Error(`Failed to create signed URL: ${error?.message}`)
  return data.signedUrl
}

export async function deleteDocument(path: string) {
  const { error } = await getClient().storage.from(STORAGE_BUCKET).remove([path])
  if (error) throw new Error(`Supabase delete failed: ${error.message}`)
}
