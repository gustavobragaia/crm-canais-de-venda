import type { NextAuthConfig } from 'next-auth'

// Edge-compatible auth config (no Node.js-only imports like bcryptjs)
// Used by middleware.ts which runs on the Edge runtime
export const authConfig: NextAuthConfig = {
  providers: [],
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl
      const PUBLIC_PATHS = [
        '/login',
        '/signup',
        '/pricing',
        '/privacy',
        '/terms',
        '/data-deletion',
        '/api/auth',
        '/api/webhooks',
        '/api/health',
      ]
      const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p))
      if (isPublic) return true
      return !!auth
    },
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id
        token.workspaceId = (user as any).workspaceId
        token.workspaceSlug = (user as any).workspaceSlug
        token.workspaceName = (user as any).workspaceName
        token.role = (user as any).role
      }
      return token
    },
    async session({ session, token }) {
      session.user.id = token.userId as string
      session.user.workspaceId = token.workspaceId as string
      session.user.workspaceSlug = token.workspaceSlug as string
      session.user.workspaceName = token.workspaceName as string
      session.user.role = token.role as string
      return session
    },
  },
  session: { strategy: 'jwt' },
}
