import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body = await req.json() as { agentRole?: string }

    // Ensure the user belongs to this workspace
    const user = await db.user.findFirst({
      where: { id, workspaceId: session.user.workspaceId },
    })

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 })
    }

    const updated = await db.user.update({
      where: { id },
      data: {
        ...(body.agentRole !== undefined && { agentRole: body.agentRole }),
      },
      select: { id: true, name: true, email: true, role: true, avatarUrl: true, agentRole: true, isActive: true },
    })

    return NextResponse.json({ user: updated })
  } catch (error) {
    console.error('[USERS PATCH]', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
