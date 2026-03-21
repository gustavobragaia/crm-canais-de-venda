import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { hash } from 'bcryptjs'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const users = await db.user.findMany({
    where: { workspaceId: session.user.workspaceId, isActive: true },
    select: { id: true, name: true, email: true, role: true, avatarUrl: true, agentRole: true, isActive: true, lastActiveAt: true, specializations: true, calendarUrl: true },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json({ users })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Apenas admins podem convidar usuários.' }, { status: 403 })
  }

  const { name, email, role, password } = await req.json()

  if (!name || !email || !password) {
    return NextResponse.json({ error: 'Nome, email e senha são obrigatórios.' }, { status: 400 })
  }

  const passwordHash = await hash(password, 12)

  try {
    const user = await db.user.create({
      data: {
        workspaceId: session.user.workspaceId,
        email,
        name,
        role: role ?? 'AGENT',
        passwordHash,
      },
    })
    return NextResponse.json({ id: user.id, email: user.email, name: user.name }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Email já cadastrado neste workspace.' }, { status: 409 })
  }
}
