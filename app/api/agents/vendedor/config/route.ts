import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.workspaceId) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
    }

    const [config, workspace] = await Promise.all([
      db.aiSalesConfig.findUnique({ where: { workspaceId: session.user.workspaceId } }),
      db.workspace.findUnique({ where: { id: session.user.workspaceId }, select: { soraEnabled: true, soraOverflowEnabled: true } }),
    ])

    return NextResponse.json({ config, soraEnabled: workspace?.soraEnabled ?? false, soraOverflowEnabled: workspace?.soraOverflowEnabled ?? true })
  } catch (error) {
    console.error('[VENDEDOR CONFIG GET]', error)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.workspaceId) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
    }

    const body = await req.json()
    const {
      agentName,
      tone,
      businessName,
      businessDescription,
      targetAudience,
      differentials,
      productsServices,
      commonObjections,
      objectives,
      calendarUrl,
      systemPrompt,
      useCustomPrompt,
      model,
      maxMessagesPerConversation,
      debounceSeconds,
      blockTtlSeconds,
      handoffMinScore,
      soraOverflowEnabled,
      soraEnabled,
    } = body

    const config = await db.aiSalesConfig.upsert({
      where: { workspaceId: session.user.workspaceId },
      create: {
        workspaceId: session.user.workspaceId,
        agentName,
        tone: tone ?? 'informal',
        businessName,
        businessDescription,
        targetAudience,
        differentials,
        productsServices: productsServices ?? [],
        commonObjections: commonObjections ?? [],
        objectives: objectives ?? ['qualify', 'schedule'],
        calendarUrl,
        systemPrompt,
        useCustomPrompt: useCustomPrompt ?? false,
        model: model ?? 'gpt-4.1-mini',
        maxMessagesPerConversation: maxMessagesPerConversation ?? 50,
        debounceSeconds: debounceSeconds ?? 15,
        blockTtlSeconds: blockTtlSeconds ?? 2400,
        handoffMinScore: handoffMinScore ?? 7,
      },
      update: {
        ...(agentName !== undefined && { agentName }),
        ...(tone !== undefined && { tone }),
        ...(businessName !== undefined && { businessName }),
        ...(businessDescription !== undefined && { businessDescription }),
        ...(targetAudience !== undefined && { targetAudience }),
        ...(differentials !== undefined && { differentials }),
        ...(productsServices !== undefined && { productsServices }),
        ...(commonObjections !== undefined && { commonObjections }),
        ...(objectives !== undefined && { objectives }),
        ...(calendarUrl !== undefined && { calendarUrl }),
        ...(systemPrompt !== undefined && { systemPrompt }),
        ...(useCustomPrompt !== undefined && { useCustomPrompt }),
        ...(model !== undefined && { model }),
        ...(maxMessagesPerConversation !== undefined && { maxMessagesPerConversation }),
        ...(debounceSeconds !== undefined && { debounceSeconds }),
        ...(blockTtlSeconds !== undefined && { blockTtlSeconds }),
        ...(handoffMinScore !== undefined && { handoffMinScore }),
      },
    })

    // Persist workspace-level Sora fields
    if (soraEnabled !== undefined || soraOverflowEnabled !== undefined) {
      await db.workspace.update({
        where: { id: session.user.workspaceId },
        data: {
          ...(soraEnabled !== undefined && { soraEnabled }),
          ...(soraOverflowEnabled !== undefined && { soraOverflowEnabled }),
        },
      })
    }

    return NextResponse.json({ config })
  } catch (error) {
    console.error('[VENDEDOR CONFIG POST]', error)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
