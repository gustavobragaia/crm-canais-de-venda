import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getSoraBillingStatus } from '@/lib/billing/soraService'

export async function GET() {
  const session = await auth()
  if (!session?.user?.workspaceId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const billing = await getSoraBillingStatus(session.user.workspaceId)
  if (!billing) {
    return NextResponse.json({ error: 'Workspace não encontrado.' }, { status: 404 })
  }

  return NextResponse.json(billing)
}
