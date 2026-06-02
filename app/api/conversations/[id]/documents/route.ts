import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { uploadDocument } from '@/lib/supabase-storage'
import { validateDocument, sanitizeFilename, getExtensionFromMime } from '@/lib/file-utils'

async function authorizeConversation(conversationId: string, session: { user: { workspaceId: string; id: string; role: string } }) {
  return db.conversation.findFirst({
    where: {
      id: conversationId,
      workspaceId: session.user.workspaceId,
      ...(session.user.role === 'AGENT' ? { assignedToId: session.user.id } : {}),
    },
    select: { id: true, workspaceId: true },
  })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const conv = await authorizeConversation(id, session)
  if (!conv) return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 })

  const documents = await db.conversationDocument.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      fileType: true,
      mimeType: true,
      sizeBytes: true,
      createdAt: true,
      uploadedBy: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json({ documents })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const conv = await authorizeConversation(id, session)
  if (!conv) return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 })

  const formData = await req.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Arquivo ausente.' }, { status: 400 })
  }

  let fileType: string
  try {
    fileType = validateDocument(file)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }

  const ext = getExtensionFromMime(file.type)
  const storagePath = `${conv.workspaceId}/${id}/${randomUUID()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  try {
    await uploadDocument(storagePath, buffer, file.type)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }

  const document = await db.conversationDocument.create({
    data: {
      conversationId: id,
      workspaceId: conv.workspaceId,
      uploadedById: session.user.id,
      name: sanitizeFilename(file.name),
      fileType,
      mimeType: file.type,
      sizeBytes: file.size,
      storagePath,
    },
    select: {
      id: true,
      name: true,
      fileType: true,
      mimeType: true,
      sizeBytes: true,
      createdAt: true,
      uploadedBy: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json({ document })
}
