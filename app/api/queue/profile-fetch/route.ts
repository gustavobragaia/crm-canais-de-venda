import { NextRequest, NextResponse } from 'next/server'
import { verifyQStashSignature, parseQStashBody } from '@/lib/queue/verify'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { decrypt } from '@/lib/crypto'
import { fetchMetaUserProfile } from '@/lib/integrations/meta-common'

export const maxDuration = 30

type ProfileFetchPayload = {
  conversationId: string
  workspaceId: string
  senderId: string
  channelType: 'FACEBOOK' | 'INSTAGRAM'
  accessToken: string  // criptografado
}

export async function POST(req: NextRequest) {
  const authError = await verifyQStashSignature(req)
  if (authError) return authError

  const { conversationId, workspaceId, senderId, channelType, accessToken } =
    await parseQStashBody<ProfileFetchPayload>(req)

  console.log(`[QUEUE/PROFILE-FETCH] conversationId=${conversationId} channelType=${channelType}`)

  let profile: { name: string; photoUrl?: string }
  try {
    profile = await fetchMetaUserProfile(senderId, decrypt(accessToken), channelType)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    // Token expired (error 190) — no point retrying
    if (msg.includes('190') || msg.includes('401') || msg.includes('403')) {
      console.warn(`[QUEUE/PROFILE-FETCH] token error, skipping:`, msg)
      return NextResponse.json({ skipped: true, reason: 'token-expired' })
    }
    throw err
  }

  // Only update fields that have actual values — don't overwrite existing with undefined
  const updateData: Record<string, string> = {}
  if (profile.name) updateData.contactName = profile.name
  if (profile.photoUrl) updateData.contactPhotoUrl = profile.photoUrl

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ skipped: true, reason: 'no-profile-data' })
  }

  await db.conversation.update({ where: { id: conversationId }, data: updateData })

  await pusherServer.trigger(
    `workspace-${workspaceId}`,
    'conversation-updated',
    { conversationId, conversation: updateData }
  ).catch(() => {})

  console.log(`[QUEUE/PROFILE-FETCH] done conversationId=${conversationId}`)
  return NextResponse.json({ success: true })
}
