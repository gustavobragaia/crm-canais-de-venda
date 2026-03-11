'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import {
  Inbox,
  Users,
  BarChart2,
  Settings,
  LogOut,
  Layers,
  BookOpen,
  GitBranch,
} from 'lucide-react'
import { ClosioIcon } from '@/components/ClosioLogo'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  adminOnly?: boolean
}

export function Sidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const slug = session?.user.workspaceSlug ?? ''
  const isAdmin = session?.user.role === 'ADMIN'

  const navItems: NavItem[] = [
    { label: 'Caixa de Entrada', href: `/${slug}/inbox`, icon: Inbox },
    { label: 'Funil', href: `/${slug}/funil`, icon: GitBranch },
    { label: 'Atendimento', href: `/${slug}/pipeline`, icon: Layers },
    { label: 'Analytics', href: `/${slug}/analytics`, icon: BarChart2, adminOnly: true },
    { label: 'Configurações', href: `/${slug}/settings`, icon: Settings, adminOnly: true },
    { label: 'Como usar', href: `/${slug}/como-usar`, icon: BookOpen },
  ]

  return (
    <aside className="w-[280px] min-h-screen bg-white border-r border-gray-200 flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-gray-200">
        <div className="flex items-center gap-2">
          {session?.user.workspaceLogo ? (
            <img
              src={session.user.workspaceLogo}
              alt="Logo"
              className="h-8 w-auto max-w-[32px] object-contain"
            />
          ) : (
            <ClosioIcon size={32} color="var(--primary)" />
          )}
          <span className="font-semibold text-gray-900">
            {session?.user.workspaceName ?? 'Closio CRM'}
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          if (item.adminOnly && !isAdmin) return null
          const isActive = pathname.startsWith(item.href)
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-gray-100 text-[var(--primary)]'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-xs font-medium text-gray-600">
            {session?.user.name?.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{session?.user.name}</p>
            <p className="text-xs text-gray-500 truncate">{session?.user.role}</p>
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <LogOut size={16} />
          Sair
        </button>
      </div>
    </aside>
  )
}
