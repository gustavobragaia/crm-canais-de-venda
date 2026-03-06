'use client'

import { useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Upload, Loader2, CheckCircle } from 'lucide-react'

const PRESET_COLORS = [
  '#3B82F6', '#8B5CF6', '#EC4899', '#EF4444',
  '#F97316', '#EAB308', '#10B981', '#14B8A6',
]

export default function BrandingPage() {
  const router = useRouter()
  const params = useSearchParams()
  const workspaceSlug = params.get('workspace') ?? ''

  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [primaryColor, setPrimaryColor] = useState('#3B82F6')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) {
      setLogoFile(file)
      setLogoPreview(URL.createObjectURL(file))
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const formData = new FormData()
      if (logoFile) formData.append('logo', logoFile)
      formData.append('primaryColor', primaryColor)
      formData.append('workspaceSlug', workspaceSlug)

      const res = await fetch('/api/workspace/branding', {
        method: 'PATCH',
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Erro ao salvar branding.')
        return
      }

      router.push(`/onboarding/team?workspace=${workspaceSlug}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleSkip() {
    router.push(`/onboarding/team?workspace=${workspaceSlug}`)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Steps */}
        <div className="flex items-center gap-2 mb-8 justify-center">
          {['Workspace', 'Branding', 'Equipe', 'Canais'].map((step, i) => (
            <div key={step} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium
                ${i === 0 ? 'bg-green-500 text-white' : i === 1 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                {i === 0 ? <CheckCircle size={14} /> : i + 1}
              </div>
              <span className={`text-sm ${i === 1 ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>{step}</span>
              {i < 3 && <div className="w-8 h-px bg-gray-300" />}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-8">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Personalize sua marca</h1>
          <p className="text-gray-500 text-sm mb-6">Adicione seu logo e cor principal (opcional)</p>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Logo Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Logo</label>
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                className="border-2 border-dashed border-gray-300 rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-blue-400 transition-colors"
                onClick={() => document.getElementById('logo-input')?.click()}
              >
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo preview" className="h-16 object-contain" />
                ) : (
                  <>
                    <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                      <Upload size={20} className="text-gray-400" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-gray-700">Arraste ou clique para upload</p>
                      <p className="text-xs text-gray-400 mt-1">PNG, JPG, SVG (máx. 2MB)</p>
                    </div>
                  </>
                )}
                <input
                  id="logo-input"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            </div>

            {/* Color Picker */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Cor principal</label>
              <div className="flex items-center gap-3 flex-wrap">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setPrimaryColor(color)}
                    className={`w-8 h-8 rounded-full border-2 transition-transform ${
                      primaryColor === color ? 'border-gray-900 scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-8 h-8 rounded-full cursor-pointer border border-gray-300"
                />
              </div>

              {/* Preview */}
              <div className="mt-3 flex items-center gap-2">
                <div
                  className="px-4 py-2 rounded-lg text-white text-sm font-medium"
                  style={{ backgroundColor: primaryColor }}
                >
                  Botão de exemplo
                </div>
                <span className="text-xs text-gray-400">{primaryColor}</span>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleSkip}
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
                Salvar e continuar
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
