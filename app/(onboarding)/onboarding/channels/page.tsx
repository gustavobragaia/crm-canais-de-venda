'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MessageCircle, Instagram, Facebook, CheckCircle, ArrowRight } from 'lucide-react'

const CHANNELS = [
  {
    id: 'whatsapp',
    name: 'WhatsApp Business',
    description: 'Conecte via Meta Cloud API',
    icon: MessageCircle,
    color: '#25D366',
    bg: 'bg-green-50',
    border: 'border-green-200',
  },
  {
    id: 'instagram',
    name: 'Instagram Direct',
    description: 'Mensagens diretas do Instagram',
    icon: Instagram,
    color: '#E4405F',
    bg: 'bg-pink-50',
    border: 'border-pink-200',
  },
  {
    id: 'facebook',
    name: 'Facebook Messenger',
    description: 'Messenger da sua página',
    icon: Facebook,
    color: '#1877F2',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
  },
]

function ChannelsPageInner() {
  const router = useRouter()
  const params = useSearchParams()
  const workspaceSlug = params.get('workspace') ?? ''

  async function handleFinish() {
    router.push(`/${workspaceSlug}`)
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
            {CHANNELS.map((channel) => {
              const Icon = channel.icon
              return (
                <div
                  key={channel.id}
                  className={`flex items-center gap-4 p-4 rounded-xl border ${channel.border} ${channel.bg}`}
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-white flex-shrink-0"
                    style={{ backgroundColor: channel.color }}
                  >
                    <Icon size={20} />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 text-sm">{channel.name}</p>
                    <p className="text-xs text-gray-500">{channel.description}</p>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-800">
              <strong>Pronto!</strong> Após o login, vá em <strong>Configurações → Canais</strong> e clique em{' '}
              <strong>"Conectar com Facebook"</strong> para conectar com um clique.
            </p>
          </div>

          <button
            onClick={handleFinish}
            className="w-full flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
          >
            Ir para o dashboard
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
