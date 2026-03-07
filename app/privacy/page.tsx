export const metadata = {
  title: 'Política de Privacidade - CRM 1',
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <a href="/" className="text-xl font-bold text-blue-600">CRM 1</a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Política de Privacidade</h1>
        <p className="text-sm text-gray-500 mb-10">Última atualização: março de 2025</p>

        <div className="space-y-8 text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Quem somos</h2>
            <p>
              O CRM 1 é uma plataforma de centralização de canais de venda que integra WhatsApp, Instagram e Facebook Messenger para que empresas possam gerenciar conversas com clientes em um único lugar.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Dados que coletamos</h2>
            <p className="mb-3">Coletamos os seguintes dados por meio das integrações com as APIs da Meta:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Nome e identificador do contato (WhatsApp, Instagram, Facebook)</li>
              <li>Número de telefone (quando disponível via WhatsApp Business API)</li>
              <li>Conteúdo das mensagens trocadas entre o contato e o negócio</li>
              <li>Data e hora das mensagens</li>
              <li>Status de entrega e leitura das mensagens</li>
              <li>Dados da conta do administrador: nome, e-mail e dados de acesso</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Como usamos os dados</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Exibir e organizar conversas no painel do CRM</li>
              <li>Permitir que agentes respondam mensagens dentro da plataforma</li>
              <li>Gerar análises e relatórios internos de atendimento</li>
              <li>Notificações em tempo real de novas mensagens</li>
            </ul>
            <p className="mt-3">
              Não compartilhamos dados com terceiros, não usamos os dados para publicidade e não vendemos informações de nenhum usuário.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Retenção de dados</h2>
            <p>
              Os dados são mantidos enquanto a conta da empresa estiver ativa na plataforma. Após o cancelamento, os dados são excluídos em até 30 dias, salvo obrigação legal em contrário.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Segurança</h2>
            <p>
              Tokens de acesso às APIs da Meta são armazenados com criptografia AES-256. Utilizamos HTTPS em todas as comunicações. O acesso à plataforma é restrito por autenticação com senha.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Seus direitos</h2>
            <p className="mb-3">Você tem o direito de:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Acessar os dados que temos sobre você</li>
              <li>Solicitar a correção de dados incorretos</li>
              <li>Solicitar a exclusão dos seus dados</li>
              <li>Revogar o acesso da plataforma às suas contas Meta a qualquer momento</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Contato</h2>
            <p>
              Para dúvidas, solicitações de exclusão ou qualquer questão sobre privacidade, entre em contato pelo e-mail:{' '}
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
