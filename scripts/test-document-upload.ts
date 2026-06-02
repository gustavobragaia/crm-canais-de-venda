#!/usr/bin/env bun
/**
 * Smoke test for document upload feature.
 *
 * Validates the full pipeline:
 *   1. Storage env vars are set
 *   2. Bucket exists and is writable
 *   3. Upload to Supabase Storage works
 *   4. Signed URL generation works
 *   5. DB insert works
 *   6. Delete from bucket + DB works
 *
 * Usage: bun run scripts/test-document-upload.ts
 */

import 'dotenv/config'
import { randomUUID } from 'crypto'
import { db } from '../lib/db'
import { uploadDocument, getSignedUrl, deleteDocument, STORAGE_BUCKET } from '../lib/supabase-storage'

// Minimal valid PDF (~ 700 bytes, "Hello" text)
const MINIMAL_PDF = Buffer.from(
  '%PDF-1.4\n' +
  '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
  '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n' +
  '4 0 obj<</Length 44>>stream\nBT /F1 24 Tf 100 700 Td (Hello Test) Tj ET\nendstream endobj\n' +
  '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n' +
  'xref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000053 00000 n \n0000000100 00000 n \n0000000189 00000 n \n0000000277 00000 n \n' +
  'trailer<</Size 6/Root 1 0 R>>startxref 333\n%%EOF',
  'utf-8',
)

function log(step: string, status: 'ok' | 'fail' | 'info', detail?: string) {
  const icon = status === 'ok' ? '✓' : status === 'fail' ? '✗' : '·'
  console.log(`${icon} ${step}${detail ? ' — ' + detail : ''}`)
}

async function main() {
  console.log('\n=== Document Upload Smoke Test ===\n')

  // Step 1: Check env
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    log('env vars', 'fail', 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set')
    process.exit(1)
  }
  log('env vars', 'ok', `bucket=${STORAGE_BUCKET}`)

  // Step 2: Find a conversation to use
  const conv = await db.conversation.findFirst({
    select: { id: true, workspaceId: true, contactName: true },
  })
  if (!conv) {
    log('find conversation', 'fail', 'no conversations in DB')
    process.exit(1)
  }
  log('find conversation', 'ok', `${conv.contactName} (${conv.id.slice(0, 8)}...)`)

  const docId = randomUUID()
  const storagePath = `${conv.workspaceId}/${conv.id}/test-${docId}.pdf`

  // Step 3: Upload
  try {
    await uploadDocument(storagePath, MINIMAL_PDF, 'application/pdf')
    log('upload to bucket', 'ok', storagePath)
  } catch (err) {
    log('upload to bucket', 'fail', (err as Error).message)
    process.exit(1)
  }

  // Step 4: Insert DB row
  try {
    await db.conversationDocument.create({
      data: {
        id: docId,
        conversationId: conv.id,
        workspaceId: conv.workspaceId,
        name: 'test-document.pdf',
        fileType: 'pdf',
        mimeType: 'application/pdf',
        sizeBytes: MINIMAL_PDF.length,
        storagePath,
      },
    })
    log('insert DB row', 'ok', `id=${docId.slice(0, 8)}...`)
  } catch (err) {
    log('insert DB row', 'fail', (err as Error).message)
    await deleteDocument(storagePath).catch(() => {})
    process.exit(1)
  }

  // Step 5: List documents
  const docs = await db.conversationDocument.findMany({
    where: { conversationId: conv.id },
  })
  const found = docs.find(d => d.id === docId)
  if (!found) {
    log('list documents', 'fail', 'inserted doc not found in list')
    process.exit(1)
  }
  log('list documents', 'ok', `${docs.length} doc(s) in conversation`)

  // Step 6: Generate signed URL and fetch
  try {
    const signedUrl = await getSignedUrl(storagePath)
    const res = await fetch(signedUrl)
    if (!res.ok) {
      log('signed URL fetch', 'fail', `status ${res.status}`)
      process.exit(1)
    }
    const downloaded = Buffer.from(await res.arrayBuffer())
    if (downloaded.length !== MINIMAL_PDF.length) {
      log('signed URL fetch', 'fail', `size mismatch: ${downloaded.length} vs ${MINIMAL_PDF.length}`)
      process.exit(1)
    }
    log('signed URL fetch', 'ok', `${downloaded.length} bytes match`)
  } catch (err) {
    log('signed URL fetch', 'fail', (err as Error).message)
    process.exit(1)
  }

  // Step 7: Delete from bucket
  try {
    await deleteDocument(storagePath)
    log('delete from bucket', 'ok')
  } catch (err) {
    log('delete from bucket', 'fail', (err as Error).message)
  }

  // Step 8: Delete DB row
  await db.conversationDocument.delete({ where: { id: docId } })
  log('delete DB row', 'ok')

  console.log('\n✓ All checks passed.\n')
  await db.$disconnect()
}

main().catch(async err => {
  console.error('\n✗ Unexpected error:', err)
  await db.$disconnect()
  process.exit(1)
})
