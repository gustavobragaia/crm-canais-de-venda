import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { SessionProvider } from '@/components/providers/SessionProvider'
import { Toaster } from 'sonner'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'Closio CRM - Seu Centralizador de Vendas Unificado',
  description: 'Centralize WhatsApp, Instagram e Facebook em uma única plataforma. Gerencie todas as conversas dos seus clientes com o Closio CRM.',
  keywords: ['CRM', 'WhatsApp', 'atendimento', 'centralizador de vendas', 'caixa de entrada', 'Closio'],
  authors: [{ name: 'Closio CRM' }],
  creator: 'Closio CRM',
  metadataBase: new URL(process.env.NEXTAUTH_URL?.replace(/\/$/, '') ?? 'https://closio.com.br'),
  openGraph: {
    title: 'Closio CRM - Seu Centralizador de Vendas Unificado',
    description: 'Centralize WhatsApp, Instagram e Facebook em uma única plataforma.',
    siteName: 'Closio CRM',
    locale: 'pt_BR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Closio CRM - Seu Centralizador de Vendas Unificado',
    description: 'Centralize WhatsApp, Instagram e Facebook em uma única plataforma.',
  },
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.variable} font-sans antialiased bg-gray-50`}>
        <SessionProvider>{children}</SessionProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  )
}
