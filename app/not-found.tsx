import Link from 'next/link'
import { MessageCircle } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 bg-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <MessageCircle size={32} className="text-white" />
        </div>
        <h1 className="text-6xl font-bold text-gray-900 mb-2">404</h1>
        <h2 className="text-xl font-semibold text-gray-700 mb-3">Página não encontrada</h2>
        <p className="text-gray-500 mb-8">
          A página que você está procurando não existe ou foi removida.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-500 hover:opacity-90 text-white font-medium rounded-lg transition-colors"
        >
          Voltar ao início
        </Link>
      </div>
    </div>
  )
}
