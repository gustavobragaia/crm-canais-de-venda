import { db } from '@/lib/db'

export async function createActivity(data: {
  conversationId: string
  workspaceId: string
  type: string
  description: string
  userId?: string
}) {
  return db.conversationActivity.create({ data })
}
