'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MessageCircle, CheckCircle, ArrowRight } from 'lucide-react'

function ChannelsPageInner() {
  const router = useRouter()
  const params = useSearchParams()
  const workspaceSlug = params.get('workspace') ?? ''

  function handleFinish() {
    router.push(`/${workspaceSlug}/inbox`)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Steps */}
        <div className="flex items-center gap-2 mb-8 justify-center">
          {['Workspace', 'Branding', 'Equipe', 'Canais'].map((step, i) => (
            <div key={step} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium
                ${i < 3 ? 'bg-green-500 text-white' : 'bg-blue-500 text-white'}`}>
                {i < 3 ? <CheckCircle size={14} /> : 4}
              </div>
              <span className={`text-sm ${i === 3 ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>{step}</span>
              {i < 3 && <div className="w-8 h-px bg-gray-300" />}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-8">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Conectar canais</h1>
          <p className="text-gray-500 text-sm mb-6">
            Conecte seus canais de mensagem. Pode fazer isso depois em Configurações.
          </p>

          <div className="space-y-3 mb-6">
            <div className="flex items-center gap-4 p-4 rounded-xl border border-green-200 bg-green-50">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-white flex-shrink-0"
                style={{ backgroundColor: '#25D366' }}
              >
                <MessageCircle size={20} />
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900 text-sm">WhatsApp Business</p>
                <p className="text-xs text-gray-500">Conecte via QR Code nas configurações</p>
              </div>
            </div>
          </div>

          <button
            onClick={() => router.push(`/${workspaceSlug}/settings?tab=channels`)}
            className="w-full flex items-center justify-center gap-2 bg-[#25D366] hover:opacity-90 text-white font-medium py-2.5 rounded-lg text-sm transition-colors mb-3"
          >
            <MessageCircle size={16} />
            Conectar WhatsApp via QR Code
          </button>

          <button
            onClick={handleFinish}
            className="w-full flex items-center justify-center gap-2 border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium py-2.5 rounded-lg text-sm transition-colors"
          >
            Ir para a caixa de entrada
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ChannelsPage() {
  return (
    <Suspense fallback={null}>
      <ChannelsPageInner />
    </Suspense>
  )
}
