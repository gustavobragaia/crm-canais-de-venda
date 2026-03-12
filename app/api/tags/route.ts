import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')

    const tags = await db.tag.findMany({
      where: {
        workspaceId: session.user.workspaceId,
        ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json(tags)
  } catch (err) {
    console.error('[GET /api/tags]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { name, color } = body as { name?: string; color?: string }

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Nome da tag não pode ser vazio.' }, { status: 400 })
    }

    const tag = await db.tag.upsert({
      where: {
        workspaceId_name: {
          workspaceId: session.user.workspaceId,
          name: name.trim(),
        },
      },
      create: {
        name: name.trim(),
        color: color ?? '#3B82F6',
        workspaceId: session.user.workspaceId,
      },
      update: {},
    })

    return NextResponse.json(tag, { status: 201 })
  } catch (err) {
    console.error('[POST /api/tags]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
