import { db } from '@/lib/db'
import { Sidebar } from '@/components/layout/Sidebar'
import { SubscriptionBlockedModal } from '@/components/billing/SubscriptionBlockedModal'

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ workspaceSlug: string }>
}) {
  const { workspaceSlug } = await params
  const workspace = await db.workspace.findUnique({
    where: { slug: workspaceSlug },
    select: { id: true, primaryColor: true, subscriptionStatus: true, plan: true },
  })
  const primary = workspace?.primaryColor ?? '#3B82F6'
  const isBlocked =
    workspace?.subscriptionStatus === 'EXPIRED' || workspace?.subscriptionStatus === 'CANCELED'

  return (
    <div className="flex min-h-screen" style={{ '--primary': primary } as React.CSSProperties}>
      <Sidebar />
      <main className="flex-1 overflow-hidden">{children}</main>
      {isBlocked && workspace && (
        <SubscriptionBlockedModal
          workspaceId={workspace.id}
          plan={workspace.plan}
          status={workspace.subscriptionStatus as 'EXPIRED' | 'CANCELED'}
        />
      )}
    </div>
  )
}
