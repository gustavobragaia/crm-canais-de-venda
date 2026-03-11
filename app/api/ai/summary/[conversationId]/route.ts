import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { generateConversationSummary } from '@/lib/ai/agent'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { conversationId } = await params

    // Verify conversation belongs to workspace
    const conversation = await db.conversation.findFirst({
      where: { id: conversationId, workspaceId: session.user.workspaceId },
    })
    if (!conversation) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const summary = await generateConversationSummary(conversationId)

    return NextResponse.json({ summary })
  } catch (error) {
    console.error('[AI SUMMARY]', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
