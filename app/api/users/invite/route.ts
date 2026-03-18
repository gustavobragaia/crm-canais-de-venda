import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { db } from '@/lib/db'
import { randomBytes } from 'crypto'
import { sendEmail } from '@/lib/email/resend'
import { userInviteEmail } from '@/lib/email/templates/user-invite'
import { checkUserLimit } from '@/lib/billing/subscriptionService'
import { getNextPlan } from '@/lib/billing/planService'

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

    // Check user limit before adding any members
    const { allowed, activeUsers, maxUsers, plan } = await checkUserLimit(workspace.id)
    const remainingSlots = maxUsers - activeUsers
    if (!allowed || members.length > remainingSlots) {
      return NextResponse.json(
        {
          error: `Seu plano ${plan} permite até ${maxUsers} usuário(s). Você tem ${activeUsers} ativo(s). Faça upgrade para continuar.`,
          code: 'USER_LIMIT_REACHED',
          activeUsers,
          maxUsers,
          plan,
          nextPlan: getNextPlan(plan),
        },
        { status: 403 },
      )
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

        // Send invite email (fire-and-forget)
        const baseUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, '') ?? ''
        sendEmail({
          to: member.email,
          subject: 'Você foi convidado para a ClosioCRM',
          html: userInviteEmail({
            userName: member.name,
            userEmail: member.email,
            tempPassword,
            workspaceName: workspace.name,
            workspaceSlug: workspace.slug,
            loginUrl: `${baseUrl}/login?workspace=${workspace.slug}`,
          }),
        }).catch(err => console.error('[INVITE] email error:', err))
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
