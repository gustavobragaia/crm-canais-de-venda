import { NextRequest, NextResponse } from 'next/server'
import { verifyQStashSignature, parseQStashBody } from '@/lib/queue/verify'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { extractQualification } from '@/lib/agents/vendedor'

export const maxDuration = 30

type QualifyLeadPayload = {
  conversationId: string
  workspaceId: string
  chatHistoryJson: string
  apiKey: string
}

export async function POST(req: NextRequest) {
  const authError = await verifyQStashSignature(req)
  if (authError) return authError

  const { conversationId, workspaceId, chatHistoryJson, apiKey } =
    await parseQStashBody<QualifyLeadPayload>(req)

  console.log(`[QUEUE/QUALIFY-LEAD] conversationId=${conversationId}`)

  const chatHistory = JSON.parse(chatHistoryJson) as Array<{ role: 'user' | 'assistant'; content: string }>

  const qualification = await extractQualification(chatHistory, apiKey)
  if (!qualification) {
    return NextResponse.json({ skipped: true, reason: 'no-qualification' })
  }

  await db.conversation.update({
    where: { id: conversationId },
    data: {
      qualificationScore: qualification.score,
      qualificationNotes: qualification.notes,
    },
  })

  const qualMsg = await db.message.create({
    data: {
      conversationId,
      workspaceId,
      direction: 'OUTBOUND',
      content: `IA atualizou qualificação: ${qualification.score}/10 — ${qualification.notes}`,
      status: 'SENT',
      aiGenerated: true,
      senderName: 'Sistema',
      sentAt: new Date(),
    },
  })

  await pusherServer.trigger(`workspace-${workspaceId}`, 'new-message', {
    conversationId, message: qualMsg,
  }).catch(() => {})

  console.log(`[QUEUE/QUALIFY-LEAD] done conversationId=${conversationId} score=${qualification.score}`)
  return NextResponse.json({ success: true, score: qualification.score })
}
