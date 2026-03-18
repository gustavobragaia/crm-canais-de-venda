import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { db } from '@/lib/db'
import { sendEmail } from '@/lib/email/resend'
import { adminWelcomeEmail } from '@/lib/email/templates/admin-welcome'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { workspaceName, workspaceSlug, adminName, adminEmail, adminPassword } = body

    if (!workspaceName || !workspaceSlug || !adminName || !adminEmail || !adminPassword) {
      return NextResponse.json({ error: 'Todos os campos são obrigatórios.' }, { status: 400 })
    }

    if (adminPassword.length < 8) {
      return NextResponse.json(
        { error: 'A senha deve ter pelo menos 8 caracteres.' },
        { status: 400 }
      )
    }

    // Check if slug is already taken
    const existing = await db.workspace.findUnique({ where: { slug: workspaceSlug } })
    if (existing) {
      return NextResponse.json(
        { error: 'Este slug já está em uso. Tente outro.' },
        { status: 409 }
      )
    }

    const passwordHash = await hash(adminPassword, 12)
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14 days

    // Create workspace + admin in a transaction
    type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0]
    const result = await db.$transaction(async (tx: Tx) => {
      const workspace = await tx.workspace.create({
        data: {
          name: workspaceName,
          slug: workspaceSlug,
          subscriptionStatus: 'TRIAL',
          trialEndsAt,
          maxUsers: 2,
          maxConversationsPerMonth: 10,
        },
      })

      const admin = await tx.user.create({
        data: {
          workspaceId: workspace.id,
          email: adminEmail,
          passwordHash,
          name: adminName,
          role: 'ADMIN',
        },
      })

      // Create default pipeline stages
      await tx.pipelineStage.createMany({
        data: [
          { workspaceId: workspace.id, name: 'Não Atribuído',   color: '#6B7280', position: 0, isDefault: true,  isFinal: false },
          { workspaceId: workspace.id, name: 'Aguardando',      color: '#F59E0B', position: 1, isDefault: false, isFinal: false },
          { workspaceId: workspace.id, name: 'Em Atendimento',  color: '#3B82F6', position: 2, isDefault: false, isFinal: false },
          { workspaceId: workspace.id, name: 'Reunião Marcada', color: '#8B5CF6', position: 3, isDefault: false, isFinal: false },
          { workspaceId: workspace.id, name: 'Contrato Fechado',color: '#10B981', position: 4, isDefault: false, isFinal: true  },
        ],
      })

      return { workspace, admin }
    })

    // Send welcome email to admin (fire-and-forget)
    const baseUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, '') ?? ''
    sendEmail({
      to: adminEmail,
      subject: 'Bem-vindo ao ClosioCRM',
      html: adminWelcomeEmail({
        adminName,
        adminEmail,
        adminPassword,
        workspaceName,
        workspaceSlug: result.workspace.slug,
        loginUrl: `${baseUrl}/login?workspace=${result.workspace.slug}`,
      }),
    }).catch(err => console.error('[SIGNUP] email error:', err))

    return NextResponse.json(
      {
        workspaceId: result.workspace.id,
        workspaceSlug: result.workspace.slug,
        userId: result.admin.id,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[SIGNUP]', error)
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
  }
}
