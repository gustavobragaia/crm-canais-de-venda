import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

// ─── Text chunking ───

function chunkText(text: string, maxChunkSize = 500): string[] {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 20)
  const chunks: string[] = []

  for (const para of paragraphs) {
    if (para.length <= maxChunkSize) {
      chunks.push(para.trim())
    } else {
      // Split long paragraphs by sentence
      const sentences = para.split(/(?<=[.!?])\s+/)
      let current = ''
      for (const sentence of sentences) {
        if ((current + ' ' + sentence).trim().length <= maxChunkSize) {
          current = (current + ' ' + sentence).trim()
        } else {
          if (current) chunks.push(current)
          current = sentence.trim()
        }
      }
      if (current) chunks.push(current)
    }
  }

  return chunks.filter(c => c.length > 10)
}

async function extractText(file: File): Promise<string> {
  const mime = file.type
  const buffer = Buffer.from(await file.arrayBuffer())

  if (mime === 'text/plain' || file.name.endsWith('.txt')) {
    return buffer.toString('utf-8')
  }

  if (mime === 'application/pdf' || file.name.endsWith('.pdf')) {
    try {
      // Dynamic import to avoid bundling issues
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdfParseMod = await import('pdf-parse') as any
      const pdfParse = pdfParseMod.default ?? pdfParseMod
      const data = await pdfParse(buffer)
      return data.text
    } catch {
      throw new Error('Não foi possível extrair texto do PDF. Use um PDF com texto selecionável.')
    }
  }

  // For .docx: basic extraction (strip XML tags)
  if (file.name.endsWith('.docx')) {
    // Very basic: extract text from DOCX XML
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(buffer)
    const xml = await zip.file('word/document.xml')?.async('string') ?? ''
    const text = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    return text
  }

  throw new Error('Tipo de arquivo não suportado. Use PDF, TXT ou DOCX.')
}

// ─── GET — list documents ───

export async function GET() {
  const session = await auth()
  if (!session?.user?.workspaceId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const docs = await db.knowledgeDocument.findMany({
    where: { workspaceId: session.user.workspaceId },
    select: {
      id: true,
      name: true,
      fileType: true,
      chunks: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  const mapped = docs.map(d => ({
    id: d.id,
    name: d.name,
    fileType: d.fileType,
    chunkCount: Array.isArray(d.chunks) ? d.chunks.length : 0,
    createdAt: d.createdAt,
  }))

  return NextResponse.json({ documents: mapped })
}

// ─── POST — upload document ───

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.workspaceId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 })
  }

  // Validate type
  const allowed = ['application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
  const allowedExts = ['.pdf', '.txt', '.docx']
  const hasAllowedType = allowed.includes(file.type) || allowedExts.some(e => file.name.endsWith(e))
  if (!hasAllowedType) {
    return NextResponse.json({ error: 'Tipo não suportado. Use PDF, TXT ou DOCX.' }, { status: 400 })
  }

  // Validate size (max 5MB)
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'Arquivo muito grande. Máximo 5MB.' }, { status: 400 })
  }

  try {
    const text = await extractText(file)

    if (!text || text.trim().length < 50) {
      return NextResponse.json({ error: 'Não foi possível extrair texto suficiente do arquivo.' }, { status: 400 })
    }

    const chunks = chunkText(text)

    const doc = await db.knowledgeDocument.create({
      data: {
        workspaceId: session.user.workspaceId,
        name: file.name,
        content: text.slice(0, 100000), // cap at 100k chars
        chunks: chunks,
        fileType: file.name.split('.').pop() ?? 'txt',
      },
    })

    return NextResponse.json({
      document: {
        id: doc.id,
        name: doc.name,
        fileType: doc.fileType,
        chunkCount: chunks.length,
        createdAt: doc.createdAt,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao processar arquivo.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ─── DELETE — remove document ───

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.workspaceId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const { id } = await req.json() as { id: string }

  const doc = await db.knowledgeDocument.findFirst({
    where: { id, workspaceId: session.user.workspaceId },
  })

  if (!doc) {
    return NextResponse.json({ error: 'Documento não encontrado.' }, { status: 404 })
  }

  await db.knowledgeDocument.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
