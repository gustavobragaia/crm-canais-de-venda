import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { getSignedUrl, deleteDocument } from '@/lib/supabase-storage'

async function findDocument(docId: string, conversationId: string, session: { user: { workspaceId: string; id: string; role: string } }) {
  return db.conversationDocument.findFirst({
    where: {
      id: docId,
      conversationId,
      workspaceId: session.user.workspaceId,
      conversation: session.user.role === 'AGENT'
        ? { assignedToId: session.user.id }
        : undefined,
    },
  })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, docId } = await params
  const doc = await findDocument(docId, id, session)
  if (!doc) return NextResponse.json({ error: 'Documento não encontrado.' }, { status: 404 })

  try {
    const signedUrl = await getSignedUrl(doc.storagePath, 3600)
    return NextResponse.json({ signedUrl, name: doc.name, mimeType: doc.mimeType })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, docId } = await params
  const doc = await findDocument(docId, id, session)
  if (!doc) return NextResponse.json({ error: 'Documento não encontrado.' }, { status: 404 })

  try {
    await deleteDocument(doc.storagePath)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }

  await db.conversationDocument.delete({ where: { id: docId } })
  return NextResponse.json({ success: true })
}
