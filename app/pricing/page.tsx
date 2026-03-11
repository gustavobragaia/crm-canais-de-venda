import Link from 'next/link'
import { MessageCircle, CheckCircle } from 'lucide-react'

const PLANS = [
  {
    name: 'Pro',
    price: 'R$ 297',
    period: '/mês',
    description: 'Tudo que você precisa para crescer',
    recommended: true,
    features: [
      'Usuários ilimitados',
      'Conversas ilimitadas',
      'Canais ilimitados',
      'Analytics avançado',
      'Pipeline personalizado',
      'Suporte prioritário',
    ],
  },
]

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
            <MessageCircle size={16} className="text-white" />
          </div>
          <span className="font-bold text-gray-900">OmniCRM</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm text-gray-600 hover:text-gray-900">
            Entrar
          </Link>
          <Link
            href="/signup"
            className="text-sm bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors"
          >
            Começar grátis
          </Link>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Planos simples e transparentes</h1>
          <p className="text-xl text-gray-500">14 dias grátis em todos os planos. Sem cartão de crédito.</p>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`bg-white rounded-2xl border p-8 relative ${
                plan.recommended
                  ? 'border-blue-400 shadow-lg scale-105'
                  : 'border-gray-200'
              }`}
            >
              {plan.recommended && (
                <span className="absolute -top-4 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-sm font-medium px-4 py-1.5 rounded-full">
                  Mais popular
                </span>
              )}

              <h2 className="text-xl font-bold text-gray-900 mb-1">{plan.name}</h2>
              <p className="text-gray-500 text-sm mb-4">{plan.description}</p>

              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-4xl font-bold text-gray-900">{plan.price}</span>
                <span className="text-gray-500">{plan.period}</span>
              </div>

              <Link
                href="/signup"
                className={`block w-full text-center py-3 rounded-xl font-medium mb-6 transition-colors ${
                  plan.recommended
                    ? 'bg-blue-500 hover:bg-blue-600 text-white'
                    : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                Começar trial grátis
              </Link>

              <ul className="space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2.5 text-sm text-gray-600">
                    <CheckCircle size={16} className="text-green-500 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-gray-400 mt-10">
          Todos os preços em BRL. Cancele a qualquer momento.
        </p>
      </div>
    </div>
  )
}
