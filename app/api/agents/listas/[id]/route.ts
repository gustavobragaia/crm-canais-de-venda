import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.workspaceId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const { id } = await params

  const list = await db.dispatchList.findFirst({
    where: { id, workspaceId: session.user.workspaceId },
    include: {
      contacts: {
        orderBy: { createdAt: 'desc' },
      },
      _count: { select: { dispatches: true } },
    },
  })

  if (!list) {
    return NextResponse.json({ error: 'Lista não encontrada' }, { status: 404 })
  }

  return NextResponse.json({ list })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.workspaceId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const { id } = await params
  const { name, description } = await req.json()

  const list = await db.dispatchList.findFirst({
    where: { id, workspaceId: session.user.workspaceId },
    select: { id: true },
  })
  if (!list) {
    return NextResponse.json({ error: 'Lista não encontrada' }, { status: 404 })
  }

  const updated = await db.dispatchList.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
    },
  })

  return NextResponse.json({ list: updated })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.workspaceId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const { id } = await params

  const list = await db.dispatchList.findFirst({
    where: { id, workspaceId: session.user.workspaceId },
    select: { id: true },
  })
  if (!list) {
    return NextResponse.json({ error: 'Lista não encontrada' }, { status: 404 })
  }

  await db.dispatchList.delete({ where: { id } })

  return NextResponse.json({ deleted: true })
}
