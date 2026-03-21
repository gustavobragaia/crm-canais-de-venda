import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  const session = await auth()
  if (!session?.user?.workspaceId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const channels = await db.wabaChannel.findMany({
    where: { workspaceId: session.user.workspaceId },
    select: {
      id: true,
      phoneNumber: true,
      displayName: true,
      qualityRating: true,
      messagingLimit: true,
      isActive: true,
      createdAt: true,
    },
  })

  return NextResponse.json({ channels })
}
