'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { ClosioIcon } from '@/components/ClosioLogo'

export default function SignupPage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    workspaceName: '',
    workspaceSlug: '',
    adminName: '',
    adminEmail: '',
    adminPassword: '',
    confirmPassword: '',
  })

  function generateSlug(name: string) {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  }

  function handleWorkspaceNameChange(name: string) {
    setForm((f) => ({
      ...f,
      workspaceName: name,
      workspaceSlug: generateSlug(name),
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (form.adminPassword !== form.confirmPassword) {
      setError('As senhas não coincidem.')
      return
    }

    if (form.adminPassword.length < 8) {
      setError('A senha deve ter pelo menos 8 caracteres.')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceName: form.workspaceName,
          workspaceSlug: form.workspaceSlug,
          adminName: form.adminName,
          adminEmail: form.adminEmail,
          adminPassword: form.adminPassword,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Erro ao criar workspace.')
        return
      }

      const signInResult = await signIn('credentials', {
        email: form.adminEmail,
        password: form.adminPassword,
        workspaceSlug: form.workspaceSlug,
        redirect: false,
      })

      if (signInResult?.error) {
        router.push(`/login?workspace=${form.workspaceSlug}`)
        return
      }

      router.push(`/onboarding/team?workspace=${form.workspaceSlug}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="mb-4">
            <ClosioIcon size={48} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Criar seu workspace</h1>
          <p className="text-gray-500 mt-1">14 dias grátis, sem cartão de crédito</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-8 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Nome do workspace
            </label>
            <input
              type="text"
              required
              placeholder="Escritório Silva"
              value={form.workspaceName}
              onChange={(e) => handleWorkspaceNameChange(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2b7fff] focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Slug (URL do workspace)
            </label>
            <div className="flex items-center gap-1">
              <span className="text-sm text-gray-500 bg-gray-50 border border-gray-300 rounded-l-lg px-3 py-2.5 border-r-0">
                closio.com.br/
              </span>
              <input
                type="text"
                required
                pattern="[a-z0-9-]+"
                value={form.workspaceSlug}
                onChange={(e) => setForm((f) => ({ ...f, workspaceSlug: e.target.value }))}
                className="flex-1 px-3 py-2.5 border border-gray-300 rounded-r-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2b7fff] focus:border-transparent"
              />
            </div>
          </div>

          <hr className="border-gray-200" />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Seu nome</label>
            <input
              type="text"
              required
              placeholder="João Silva"
              value={form.adminName}
              onChange={(e) => setForm((f) => ({ ...f, adminName: e.target.value }))}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2b7fff] focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
            <input
              type="email"
              required
              placeholder="joao@escritoriosilva.com"
              value={form.adminEmail}
              onChange={(e) => setForm((f) => ({ ...f, adminEmail: e.target.value }))}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2b7fff] focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Senha</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={form.adminPassword}
                onChange={(e) => setForm((f) => ({ ...f, adminPassword: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2b7fff] focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Confirmar senha
              </label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={form.confirmPassword}
                onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2b7fff] focus:border-transparent"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-[#2b7fff] hover:opacity-90 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            Criar workspace grátis
          </button>

          <p className="text-center text-sm text-gray-500">
            Já tem conta?{' '}
            <Link href="/login" className="text-[#2b7fff] hover:underline font-medium">
              Entrar
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
