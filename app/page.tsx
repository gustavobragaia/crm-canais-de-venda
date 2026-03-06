import Link from 'next/link'
import { MessageCircle, Instagram, Facebook, Zap, Shield, BarChart2 } from 'lucide-react'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-gray-200 px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
            <MessageCircle size={16} className="text-white" />
          </div>
          <span className="font-bold text-gray-900">OmniCRM</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/pricing" className="text-sm text-gray-600 hover:text-gray-900">
            Preços
          </Link>
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

      {/* Hero */}
      <section className="max-w-4xl mx-auto text-center px-6 py-24">
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
            <MessageCircle size={20} color="#25D366" />
          </div>
          <div className="w-10 h-10 bg-pink-100 rounded-xl flex items-center justify-center">
            <Instagram size={20} color="#E4405F" />
          </div>
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
            <Facebook size={20} color="#1877F2" />
          </div>
        </div>

        <h1 className="text-5xl font-bold text-gray-900 mb-6 leading-tight">
          Nunca perca um lead por <br />
          <span className="text-blue-500">resposta lenta</span>
        </h1>

        <p className="text-xl text-gray-500 mb-10 max-w-2xl mx-auto">
          Centralize WhatsApp, Instagram e Facebook em uma única caixa de entrada.
          Distribua leads para sua equipe e feche mais negócios.
        </p>

        <div className="flex items-center justify-center gap-4">
          <Link
            href="/signup"
            className="bg-blue-500 hover:bg-blue-600 text-white px-8 py-3.5 rounded-xl font-medium text-lg transition-colors"
          >
            14 dias grátis — sem cartão
          </Link>
          <Link
            href="/pricing"
            className="border border-gray-300 text-gray-700 hover:bg-gray-50 px-8 py-3.5 rounded-xl font-medium text-lg transition-colors"
          >
            Ver planos
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="bg-gray-50 py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">
            Tudo que sua equipe precisa
          </h2>
          <div className="grid grid-cols-3 gap-6">
            {[
              {
                icon: Zap,
                title: 'Caixa unificada',
                desc: 'WhatsApp, Instagram e Facebook em um só lugar. Sem alternar entre apps.',
                colorClass: 'text-yellow-500 bg-yellow-50',
              },
              {
                icon: Shield,
                title: 'Multi-tenant seguro',
                desc: 'Isolamento total entre workspaces. Dados de um cliente nunca vazam para outro.',
                colorClass: 'text-blue-500 bg-blue-50',
              },
              {
                icon: BarChart2,
                title: 'Analytics em tempo real',
                desc: 'Acompanhe tempo de resposta, conversões e performance da equipe.',
                colorClass: 'text-green-500 bg-green-50',
              },
            ].map(({ icon: Icon, title, desc, colorClass }) => (
              <div key={title} className="bg-white rounded-2xl border border-gray-200 p-6">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${colorClass}`}>
                  <Icon size={24} />
                </div>
                <h3 className="font-semibold text-gray-900 text-lg mb-2">{title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 text-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">
          Pronto para nunca perder um lead?
        </h2>
        <p className="text-gray-500 mb-8">14 dias grátis. Cancele a qualquer momento.</p>
        <Link
          href="/signup"
          className="inline-block bg-blue-500 hover:bg-blue-600 text-white px-10 py-4 rounded-xl font-semibold text-lg transition-colors"
        >
          Criar workspace grátis
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8 text-center text-sm text-gray-400">
        © 2026 OmniCRM. Todos os direitos reservados.
      </footer>
    </div>
  )
}
