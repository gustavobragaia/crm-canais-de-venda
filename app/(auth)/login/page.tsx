'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { MessageCircle, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ email: '', password: '', workspaceSlug: '' })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await signIn('credentials', {
        email: form.email,
        password: form.password,
        workspaceSlug: form.workspaceSlug,
        redirect: false,
      })

      if (result?.error) {
        setError('Email, senha ou workspace incorretos.')
      } else {
        router.push(`/${form.workspaceSlug}/inbox`)
        router.refresh()
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center mb-4">
            <MessageCircle size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Entrar no OmniCRM</h1>
          <p className="text-gray-500 mt-1">Acesse sua caixa de entrada unificada</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-8 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Workspace (slug)
            </label>
            <input
              type="text"
              required
              placeholder="escritorio-silva"
              value={form.workspaceSlug}
              onChange={(e) => setForm((f) => ({ ...f, workspaceSlug: e.target.value }))}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
            <input
              type="email"
              required
              placeholder="voce@empresa.com"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Senha</label>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white font-medium py-2.5 rounded-lg transition-colors"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            Entrar
          </button>

          <p className="text-center text-sm text-gray-500">
            Não tem conta?{' '}
            <Link href="/signup" className="text-blue-600 hover:underline font-medium">
              Criar workspace
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
