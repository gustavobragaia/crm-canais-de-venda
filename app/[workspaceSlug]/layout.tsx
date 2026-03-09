import { db } from '@/lib/db'
import { Sidebar } from '@/components/layout/Sidebar'

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
    select: { primaryColor: true },
  })
  const primary = workspace?.primaryColor ?? '#3B82F6'

  return (
    <div className="flex min-h-screen" style={{ '--primary': primary } as React.CSSProperties}>
      <Sidebar />
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  )
}
