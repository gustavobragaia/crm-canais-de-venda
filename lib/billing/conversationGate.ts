import { db } from '@/lib/db'
import { redis } from '@/lib/redis'

/**
 * Check if a new conversation can be created for this workspace.
 * Returns true if allowed (existing conversation or within limit).
 * Returns false if over the trial conversation limit.
 */
export async function canCreateConversation(
  workspaceId: string,
  channelId: string,
  externalId: string,
): Promise<boolean> {
  // Check if conversation already exists — existing convos are always allowed
  const existing = await db.conversation.findUnique({
    where: { workspaceId_channelId_externalId: { workspaceId, channelId, externalId } },
    select: { id: true },
  })
  if (existing) return true

  // New conversation — check workspace limit
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { conversationsThisMonth: true, maxConversationsPerMonth: true },
  })
  if (!workspace) return false

  if (workspace.conversationsThisMonth >= workspace.maxConversationsPerMonth) return false

  return true
}

/**
 * Increment the conversation counter for the workspace.
 * Call this after successfully creating a new conversation.
 */
export async function incrementConversationCount(workspaceId: string): Promise<void> {
  await db.workspace.update({
    where: { id: workspaceId },
    data: { conversationsThisMonth: { increment: 1 } },
  })
}

/**
 * Atomic billing gate for concurrent workers (queue-based message-ingest).
 *
 * Uses Redis SETNX to ensure only the first worker increments the conversation count
 * when multiple messages arrive simultaneously for the same new contact.
 *
 * Returns:
 *   { allowed: true,  isNew: true  } — new conversation, first worker wins
 *   { allowed: true,  isNew: false } — existing conversation (or second+ worker)
 *   { allowed: false, isNew: false } — workspace limit reached
 */
export async function tryCreateConversationAtomic(
  workspaceId: string,
  channelId: string,
  externalId: string,
): Promise<{ allowed: boolean; isNew: boolean }> {
  // Fast path: conversation already exists in DB (most common case)
  const existing = await db.conversation.findUnique({
    where: { workspaceId_channelId_externalId: { workspaceId, channelId, externalId } },
    select: { id: true },
  })
  if (existing) return { allowed: true, isNew: false }

  // New conversation — check workspace limit
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { conversationsThisMonth: true, maxConversationsPerMonth: true },
  })
  if (!workspace) return { allowed: false, isNew: false }

  if (workspace.conversationsThisMonth >= workspace.maxConversationsPerMonth) {
    return { allowed: false, isNew: false }
  }

  // Atomic SETNX: only first concurrent worker for this contact gets isNew=true
  const lockKey = `conv-created:${workspaceId}:${channelId}:${externalId}`
  const acquired = await redis.setnx(lockKey, '1')
  if (acquired) {
    await redis.expire(lockKey, 300) // 5 min TTL — sufficient for any retry window
  }

  return { allowed: true, isNew: acquired === 1 }
}
