export const metadata = {
  title: 'Exclusão de Dados - CRM 1',
}

export default function DataDeletionPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <a href="/" className="text-xl font-bold text-blue-600">CRM 1</a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Exclusão de Dados do Usuário</h1>
        <p className="text-sm text-gray-500 mb-10">Última atualização: março de 2025</p>

        <div className="space-y-8 text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Como solicitar a exclusão dos seus dados</h2>
            <p className="mb-4">
              Se você usou o login com Facebook/Instagram para conectar sua conta ao CRM 1 e deseja que seus dados sejam removidos da nossa plataforma, siga os passos abaixo:
            </p>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 space-y-4">
              <div className="flex gap-4">
                <span className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-semibold text-sm">1</span>
                <div>
                  <p className="font-medium text-gray-900">Envie um e-mail de solicitação</p>
                  <p className="text-sm text-gray-600 mt-1">
                    Envie um e-mail para{' '}
                    <a href="mailto:payclavo@gmail.com" className="text-blue-600 hover:underline font-medium">
                      payclavo@gmail.com
                    </a>{' '}
                    com o assunto <strong>"Solicitação de Exclusão de Dados"</strong>.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <span className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-semibold text-sm">2</span>
                <div>
                  <p className="font-medium text-gray-900">Inclua no e-mail</p>
                  <ul className="text-sm text-gray-600 mt-1 list-disc pl-4 space-y-1">
                    <li>Nome completo</li>
                    <li>E-mail associado à conta</li>
                    <li>ID do Facebook ou Instagram (opcional)</li>
                  </ul>
                </div>
              </div>

              <div className="flex gap-4">
                <span className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-semibold text-sm">3</span>
                <div>
                  <p className="font-medium text-gray-900">Prazo de processamento</p>
                  <p className="text-sm text-gray-600 mt-1">
                    Processaremos sua solicitação em até <strong>7 dias úteis</strong> e confirmaremos a exclusão por e-mail.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">O que será excluído</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Tokens de acesso às APIs da Meta vinculados à sua conta</li>
              <li>Dados de perfil (nome, e-mail)</li>
              <li>Histórico de conversas associado ao seu workspace</li>
              <li>Todas as configurações e dados do workspace</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Revogar acesso via Facebook</h2>
            <p className="mb-3">
              Você também pode revogar o acesso do CRM 1 diretamente nas configurações do Facebook:
            </p>
            <ol className="list-decimal pl-6 space-y-2">
              <li>Acesse <strong>Facebook → Configurações → Segurança e Login → Aplicativos e sites</strong></li>
              <li>Encontre "CRM 1" na lista</li>
              <li>Clique em <strong>"Remover"</strong></li>
            </ol>
            <p className="mt-3 text-sm text-gray-500">
              Isso revoga o token de acesso imediatamente. Para excluir os dados já coletados, envie o e-mail conforme descrito acima.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Contato</h2>
            <p>
              Dúvidas sobre exclusão de dados:{' '}
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
