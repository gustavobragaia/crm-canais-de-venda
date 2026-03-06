import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { db } from '@/lib/db'
import { randomBytes } from 'crypto'

function generateTempPassword(): string {
  return randomBytes(8).toString('hex')
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { workspaceSlug, members } = body as {
      workspaceSlug: string
      members: Array<{ name: string; email: string; role: 'ADMIN' | 'AGENT' }>
    }

    const workspace = await db.workspace.findUnique({ where: { slug: workspaceSlug } })
    if (!workspace) {
      return NextResponse.json({ error: 'Workspace não encontrado.' }, { status: 404 })
    }

    const results = []

    for (const member of members) {
      if (!member.email || !member.name) continue

      const tempPassword = generateTempPassword()
      const passwordHash = await hash(tempPassword, 12)

      try {
        const user = await db.user.create({
          data: {
            workspaceId: workspace.id,
            email: member.email,
            name: member.name,
            role: member.role,
            passwordHash,
          },
        })
        results.push({ id: user.id, email: user.email, tempPassword })
      } catch {
        // Skip duplicates
      }
    }

    return NextResponse.json({ invited: results.length, results })
  } catch (error) {
    console.error('[INVITE]', error)
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
  }
}
