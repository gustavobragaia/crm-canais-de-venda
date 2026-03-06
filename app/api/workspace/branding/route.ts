import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { put } from '@vercel/blob'

export async function PATCH(req: NextRequest) {
  try {
    const formData = await req.formData()
    const workspaceSlug = formData.get('workspaceSlug') as string
    const primaryColor = formData.get('primaryColor') as string
    const logoFile = formData.get('logo') as File | null

    if (!workspaceSlug) {
      return NextResponse.json({ error: 'workspaceSlug obrigatório.' }, { status: 400 })
    }

    const workspace = await db.workspace.findUnique({ where: { slug: workspaceSlug } })
    if (!workspace) {
      return NextResponse.json({ error: 'Workspace não encontrado.' }, { status: 404 })
    }

    let logoUrl: string | undefined

    if (logoFile && logoFile.size > 0) {
      if (logoFile.size > 2 * 1024 * 1024) {
        return NextResponse.json({ error: 'Logo deve ter no máximo 2MB.' }, { status: 400 })
      }
      const blob = await put(`logos/${workspace.id}/${logoFile.name}`, logoFile, {
        access: 'public',
      })
      logoUrl = blob.url
    }

    await db.workspace.update({
      where: { id: workspace.id },
      data: {
        ...(logoUrl && { logoUrl }),
        ...(primaryColor && { primaryColor }),
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[BRANDING]', error)
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
  }
}
