'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { UserPlus, Trash2, Loader2, CheckCircle } from 'lucide-react'

interface TeamMember {
  name: string
  email: string
  role: 'ADMIN' | 'AGENT'
}

function TeamPageInner() {
  const router = useRouter()
  const params = useSearchParams()
  const workspaceSlug = params.get('workspace') ?? ''

  const [members, setMembers] = useState<TeamMember[]>([{ name: '', email: '', role: 'AGENT' }])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function addMember() {
    setMembers((m) => [...m, { name: '', email: '', role: 'AGENT' }])
  }

  function removeMember(index: number) {
    setMembers((m) => m.filter((_, i) => i !== index))
  }

  function updateMember(index: number, field: keyof TeamMember, value: string) {
    setMembers((m) =>
      m.map((member, i) => (i === index ? { ...member, [field]: value } : member))
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const validMembers = members.filter((m) => m.email && m.name)
    if (validMembers.length === 0) {
      router.push(`/onboarding/channels?workspace=${workspaceSlug}`)
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceSlug, members: validMembers }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Erro ao convidar membros.')
        return
      }

      router.push(`/onboarding/channels?workspace=${workspaceSlug}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Steps */}
        <div className="flex items-center gap-2 mb-8 justify-center">
          {['Workspace', 'Branding', 'Equipe', 'Canais'].map((step, i) => (
            <div key={step} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium
                ${i < 2 ? 'bg-green-500 text-white' : i === 2 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                {i < 2 ? <CheckCircle size={14} /> : i + 1}
              </div>
              <span className={`text-sm ${i === 2 ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>{step}</span>
              {i < 3 && <div className="w-8 h-px bg-gray-300" />}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-8">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Adicionar membros</h1>
          <p className="text-gray-500 text-sm mb-6">Convide agentes e admins para sua equipe (opcional)</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {members.map((member, index) => (
              <div key={index} className="flex gap-2 items-start">
                <div className="flex-1 space-y-2">
                  <input
                    type="text"
                    placeholder="Nome"
                    value={member.name}
                    onChange={(e) => updateMember(index, 'name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <div className="flex gap-2">
                    <input
                      type="email"
                      placeholder="email@empresa.com"
                      value={member.email}
                      onChange={(e) => updateMember(index, 'email', e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <select
                      value={member.role}
                      onChange={(e) => updateMember(index, 'role', e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="AGENT">Agente</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </div>
                </div>
                {members.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeMember(index)}
                    className="mt-1 p-2 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}

            <button
              type="button"
              onClick={addMember}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-dashed border-gray-300 text-gray-600 rounded-lg text-sm hover:border-blue-400 hover:text-blue-600 transition-colors"
            >
              <UserPlus size={16} />
              Adicionar outro membro
            </button>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => router.push(`/onboarding/channels?workspace=${workspaceSlug}`)}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Pular por agora
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
              >
                {loading && <Loader2 size={14} className="animate-spin" />}
                Continuar
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default function TeamPage() {
  return (
    <Suspense fallback={null}>
      <TeamPageInner />
    </Suspense>
  )
}
