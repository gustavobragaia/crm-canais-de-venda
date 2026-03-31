import NextAuth from 'next-auth'
import { authConfig } from '@/auth.config'
import { NextResponse } from 'next/server'

const { auth } = NextAuth(authConfig)

// IMPORTANT: Keep in sync with auth.config.ts PUBLIC_PATHS
const PUBLIC_PATHS = ['/login', '/signup', '/pricing', '/api/auth', '/api/webhooks', '/api/queue', '/api/cron', '/api/health']

export default auth((req) => {
  const { pathname } = req.nextUrl
  const session = req.auth

  // Allow public paths
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p))
  if (isPublic) return NextResponse.next()

  // Redirect to login if not authenticated
  if (!session) {
    const loginUrl = new URL('/login', req.url)
    return NextResponse.redirect(loginUrl)
  }

  // Validate workspace slug access for /[workspaceSlug]/* routes
  const workspaceMatch = pathname.match(/^\/([^/]+)\//)
  if (workspaceMatch) {
    const urlSlug = workspaceMatch[1]
    const reservedSlugs = ['api', 'onboarding', '_next', 'login', 'signup', 'pricing']
    if (!reservedSlugs.includes(urlSlug) && urlSlug !== session.user.workspaceSlug) {
      // User trying to access another workspace — redirect to their workspace
      const redirectUrl = new URL(`/${session.user.workspaceSlug}/inbox`, req.url)
      return NextResponse.redirect(redirectUrl)
    }
  }

  // Redirect root to workspace inbox
  if (pathname === '/') {
    if (session) {
      return NextResponse.redirect(new URL(`/${session.user.workspaceSlug}/inbox`, req.url))
    }
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public/).*)'],
}
