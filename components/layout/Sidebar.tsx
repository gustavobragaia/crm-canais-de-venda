'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { useState, useEffect } from 'react'
import {
  Inbox,
  BarChart2,
  Settings,
  LogOut,
  Layers,
  GitBranch,
  MessageSquare,
  Users,
  Search,
  Send,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { ClosioIcon } from '@/components/ClosioLogo'

interface TrialData {
  subscriptionStatus: string
  conversationsThisMonth: number
  maxConversationsPerMonth: number
  activeUsers: number
  maxUsers: number
}

export function Sidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const slug = session?.user.workspaceSlug ?? ''
  const isAdmin = session?.user.role === 'ADMIN'
  const [trial, setTrial] = useState<TrialData | null>(null)
  const [agentsOpen, setAgentsOpen] = useState(false)

  useEffect(() => {
    if (!session) return
    fetch('/api/billing')
      .then(r => r.json())
      .then((data: TrialData) => setTrial(data))
      .catch(() => null)
  }, [session])

  // Auto-expand Agentes de IA submenu if on agents routes
  useEffect(() => {
    if (pathname.includes(`/${slug}/agents`)) setAgentsOpen(true)
  }, [pathname, slug])

  const isTrial = trial?.subscriptionStatus === 'TRIAL'
  const soraHref = `/${slug}/sora`
  const soraActive = pathname.startsWith(soraHref)

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
        {/* Standard nav items */}
        {[
          { label: 'Caixa de Entrada', href: `/${slug}/inbox`, Icon: Inbox },
          { label: 'Funil', href: `/${slug}/funil`, Icon: GitBranch },
          { label: 'Atendimento', href: `/${slug}/pipeline`, Icon: Layers },
        ].map(({ label, href, Icon }) => {
          const isActive = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-gray-100 text-[var(--primary)]'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          )
        })}

        {/* Sora — separate top-level item, admin only */}
        {isAdmin && (
          <Link
            href={soraHref}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              soraActive
                ? 'bg-violet-50 text-violet-700'
                : 'text-gray-600 hover:bg-violet-50 hover:text-violet-700'
            }`}
          >
            <img
              src="/ai-avatar.svg"
              alt="Sora"
              className={`w-[18px] h-[18px] rounded-full object-cover ${soraActive ? 'animate-[pulse-subtle_3s_ease-in-out_infinite]' : ''}`}
            />
            Sora
          </Link>
        )}

        {/* Agentes de IA — collapsible submenu, admin only */}
        {isAdmin && (
          <div>
            <button
              onClick={() => setAgentsOpen(o => !o)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              <span className="flex-1 flex items-center gap-3 text-left">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
                </svg>
                Agentes de IA
              </span>
              {agentsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>

            {agentsOpen && (
              <div className="ml-7 mt-0.5 space-y-0.5 border-l border-gray-200 pl-3">
                {[
                  { label: 'Buscador', href: `/${slug}/agents/buscador`, Icon: Search },
                  { label: 'Disparador', href: `/${slug}/agents/disparador`, Icon: Send },
                ].map(({ label, href, Icon }) => {
                  const isActive = pathname.startsWith(href)
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={`flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-gray-100 text-[var(--primary)]'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                    >
                      <Icon size={15} />
                      {label}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Analytics & Settings */}
        {isAdmin && [
          { label: 'Analytics', href: `/${slug}/analytics`, Icon: BarChart2 },
          { label: 'Configurações', href: `/${slug}/settings`, Icon: Settings },
        ].map(({ label, href, Icon }) => {
          const isActive = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-gray-100 text-[var(--primary)]'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Trial banner */}
      {isTrial && trial && (
        <div className="mx-3 mb-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-xs font-semibold text-amber-800 mb-2">Plano Trial</p>
          <div className="space-y-1.5 mb-3">
            <div>
              <div className="flex items-center justify-between mb-0.5">
                <div className="flex items-center gap-1">
                  <MessageSquare size={11} className="text-amber-600" />
                  <span className="text-xs text-amber-700">Conversas</span>
                </div>
                <span className="text-xs font-medium text-amber-800">
                  {trial.conversationsThisMonth}/{trial.maxConversationsPerMonth}
                </span>
              </div>
              <div className="h-1 bg-amber-200 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-amber-500 transition-all"
                  style={{ width: `${Math.min((trial.conversationsThisMonth / trial.maxConversationsPerMonth) * 100, 100)}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-0.5">
                <div className="flex items-center gap-1">
                  <Users size={11} className="text-amber-600" />
                  <span className="text-xs text-amber-700">Usuários</span>
                </div>
                <span className="text-xs font-medium text-amber-800">
                  {trial.activeUsers}/{trial.maxUsers}
                </span>
              </div>
              <div className="h-1 bg-amber-200 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-amber-500 transition-all"
                  style={{ width: `${Math.min((trial.activeUsers / trial.maxUsers) * 100, 100)}%` }}
                />
              </div>
            </div>
          </div>
          <Link
            href={`/${slug}/settings?tab=billing`}
            className="block w-full text-center py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold transition-colors"
          >
            Escolher um plano
          </Link>
        </div>
      )}

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
