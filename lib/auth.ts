import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { compare } from 'bcryptjs'
import { db } from '@/lib/db'

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Senha', type: 'password' },
        workspaceSlug: { label: 'Workspace', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password || !credentials?.workspaceSlug) {
          return null
        }

        const workspace = await db.workspace.findUnique({
          where: { slug: credentials.workspaceSlug as string },
        })

        if (!workspace) return null

        const user = await db.user.findUnique({
          where: {
            workspaceId_email: {
              workspaceId: workspace.id,
              email: credentials.email as string,
            },
          },
        })

        if (!user || !user.isActive) return null

        const isValid = await compare(credentials.password as string, user.passwordHash)
        if (!isValid) return null

        // Update last active
        await db.user.update({
          where: { id: user.id },
          data: { lastActiveAt: new Date() },
        })

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.avatarUrl,
          workspaceId: workspace.id,
          workspaceSlug: workspace.slug,
          workspaceName: workspace.name,
          role: user.role,
        }
      },
    }),
  ],
  callbacks: {
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
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
  },
})

// Type augmentation
declare module 'next-auth' {
  interface User {
    workspaceId: string
    workspaceSlug: string
    workspaceName: string
    role: string
  }
  interface Session {
    user: {
      id: string
      email: string
      name: string
      image?: string
      workspaceId: string
      workspaceSlug: string
      workspaceName: string
      role: string
    }
  }
}
