import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { decrypt } from '@/lib/crypto'
import { getTemplates, createTemplate } from '@/lib/integrations/waba'

export async function GET() {
  const session = await auth()
  if (!session?.user?.workspaceId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  // Get WABA channel
  const channel = await db.wabaChannel.findFirst({
    where: { workspaceId: session.user.workspaceId, isActive: true },
  })
  if (!channel) {
    return NextResponse.json({ templates: [] })
  }

  try {
    const accessToken = decrypt(channel.accessToken)
    const templates = await getTemplates(accessToken, channel.wabaId)

    // Sync templates to DB
    for (const tpl of templates) {
      await db.wabaTemplate.upsert({
        where: {
          workspaceId_name_language: {
            workspaceId: session.user.workspaceId,
            name: tpl.name,
            language: tpl.language,
          },
        },
        create: {
          workspaceId: session.user.workspaceId,
          wabaChannelId: channel.id,
          metaTemplateId: tpl.id,
          name: tpl.name,
          language: tpl.language,
          category: tpl.category,
          status: tpl.status,
          components: tpl.components as object,
        },
        update: {
          status: tpl.status,
          category: tpl.category,
          components: tpl.components as object,
          metaTemplateId: tpl.id,
        },
      })
    }

    return NextResponse.json({ templates })
  } catch (error) {
    console.error('[WABA TEMPLATES]', error)
    return NextResponse.json({ error: 'Erro ao buscar templates.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.workspaceId || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const channel = await db.wabaChannel.findFirst({
    where: { workspaceId: session.user.workspaceId, isActive: true },
  })
  if (!channel) {
    return NextResponse.json({ error: 'WABA não conectado.' }, { status: 400 })
  }

  try {
    const { name, language, category, components } = await req.json()

    const accessToken = decrypt(channel.accessToken)
    const result = await createTemplate(accessToken, channel.wabaId, {
      name,
      language: language ?? 'pt_BR',
      category: category ?? 'UTILITY',
      components,
    })

    // Save to DB
    await db.wabaTemplate.create({
      data: {
        workspaceId: session.user.workspaceId,
        wabaChannelId: channel.id,
        metaTemplateId: result.id,
        name,
        language: language ?? 'pt_BR',
        category: category ?? 'UTILITY',
        status: 'PENDING',
        components,
      },
    })

    return NextResponse.json({ id: result.id })
  } catch (error) {
    console.error('[WABA CREATE TEMPLATE]', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro ao criar template.' }, { status: 500 })
  }
}
