import { redis } from '@/lib/redis'

const KEYS = {
  block: (convId: string) => `vendedor:block:${convId}`,
  debounce: (convId: string) => `vendedor:debounce:${convId}`,
  lastAiMsg: (convId: string) => `vendedor:last_ai:${convId}`,
}

export async function isBlocked(conversationId: string): Promise<boolean> {
  const val = await redis.get(KEYS.block(conversationId))
  return !!val
}

export async function blockAI(conversationId: string, ttlSeconds = 2400): Promise<void> {
  await redis.set(KEYS.block(conversationId), 'true', { ex: ttlSeconds })
}

export async function unblockAI(conversationId: string): Promise<void> {
  await redis.del(KEYS.block(conversationId))
}

export async function addToDebounceBuffer(conversationId: string, message: string): Promise<void> {
  await redis.rpush(KEYS.debounce(conversationId), message)
}

export async function getDebounceBuffer(conversationId: string): Promise<string[]> {
  return (await redis.lrange(KEYS.debounce(conversationId), 0, -1)) as string[]
}

export async function clearDebounceBuffer(conversationId: string): Promise<void> {
  await redis.del(KEYS.debounce(conversationId))
}

export async function setLastAiMessage(conversationId: string, message: string): Promise<void> {
  await redis.set(KEYS.lastAiMsg(conversationId), message, { ex: 3600 })
}

export async function getLastAiMessage(conversationId: string): Promise<string | null> {
  return (await redis.get(KEYS.lastAiMsg(conversationId))) as string | null
}

export async function detectHumanTakeover(
  conversationId: string,
  outgoingMessage: string,
  blockTtlSeconds = 2400,
): Promise<boolean> {
  const lastAi = await getLastAiMessage(conversationId)
  // If no AI message recorded, can't determine — don't block
  if (!lastAi) return false
  // If the outgoing message matches something the AI sent, it's not human
  if (lastAi.includes(outgoingMessage) || outgoingMessage.includes(lastAi)) return false
  // Human sent a manual message → block AI
  await blockAI(conversationId, blockTtlSeconds)
  return true
}
