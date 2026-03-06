import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { SessionProvider } from '@/components/providers/SessionProvider'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'OmniCRM - Caixa de Entrada Unificada',
  description: 'Centralize WhatsApp, Instagram e Facebook em uma única plataforma',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.variable} font-sans antialiased bg-gray-50`}>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  )
}
