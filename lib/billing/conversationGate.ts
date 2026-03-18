import { db } from '@/lib/db'

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
