export const metadata = {
  title: 'Termos de Serviço - CRM 1',
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <a href="/" className="text-xl font-bold text-blue-600">CRM 1</a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Termos de Serviço</h1>
        <p className="text-sm text-gray-500 mb-10">Última atualização: março de 2025</p>

        <div className="space-y-8 text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Aceitação dos termos</h2>
            <p>
              Ao acessar e usar o CRM 1, você concorda com estes Termos de Serviço. Se não concordar com qualquer parte dos termos, não utilize a plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Descrição do serviço</h2>
            <p>
              O CRM 1 é uma plataforma SaaS que centraliza canais de comunicação (WhatsApp, Instagram, Facebook Messenger) para gerenciamento de atendimento ao cliente e vendas. O serviço é oferecido via assinatura mensal conforme o plano contratado.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Uso permitido</h2>
            <p className="mb-3">Você pode usar a plataforma para:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Gerenciar conversas de atendimento ao cliente</li>
              <li>Centralizar canais de venda da sua empresa</li>
              <li>Organizar e distribuir conversas entre agentes</li>
            </ul>
            <p className="mt-3 mb-3">É expressamente proibido usar a plataforma para:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Envio de spam ou mensagens não solicitadas em massa</li>
              <li>Atividades ilegais ou que violem as políticas da Meta</li>
              <li>Compartilhar credenciais de acesso com terceiros não autorizados</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Conta e responsabilidade</h2>
            <p>
              Você é responsável por manter a segurança da sua conta e por todas as atividades realizadas sob suas credenciais. Notifique-nos imediatamente em caso de acesso não autorizado.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Disponibilidade do serviço</h2>
            <p>
              Nos esforçamos para manter o serviço disponível 24/7, mas não garantimos disponibilidade ininterrupta. Podemos realizar manutenções programadas com aviso prévio sempre que possível.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Limitação de responsabilidade</h2>
            <p>
              O CRM 1 não se responsabiliza por perdas decorrentes de falhas nas APIs de terceiros (Meta, WhatsApp Business), interrupções de internet, ou uso indevido da plataforma. Nossa responsabilidade máxima é limitada ao valor pago nos últimos 30 dias de assinatura.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Cancelamento</h2>
            <p>
              Você pode cancelar sua assinatura a qualquer momento. O acesso permanece ativo até o fim do período pago. Após o cancelamento, os dados são mantidos por 30 dias antes da exclusão definitiva.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Alterações nos termos</h2>
            <p>
              Podemos atualizar estes termos periodicamente. Alterações significativas serão comunicadas por e-mail com pelo menos 15 dias de antecedência. O uso continuado da plataforma após as alterações constitui aceitação dos novos termos.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">9. Contato</h2>
            <p>
              Para dúvidas sobre estes termos, entre em contato:{' '}
              <a href="mailto:payclavo@gmail.com" className="text-blue-600 hover:underline">
                payclavo@gmail.com
              </a>
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t border-gray-200 mt-16 py-6 text-center text-sm text-gray-400">
        © {new Date().getFullYear()} CRM 1. Todos os direitos reservados.
      </footer>
    </div>
  )
}
