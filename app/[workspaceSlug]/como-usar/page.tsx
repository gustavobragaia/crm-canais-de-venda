'use client'

import { useState } from 'react'
import {
  Inbox,
  Users,
  Layers,
  BarChart2,
  Settings,
  MessageCircle,
  Instagram,
  Facebook,
  ChevronDown,
  ChevronRight,
  UserPlus,
  Webhook,
  Key,
  CheckCircle2,
} from 'lucide-react'

interface Section {
  id: string
  icon: React.ElementType
  color: string
  title: string
  content: React.ReactNode
}

function Accordion({ section }: { section: Section }) {
  const [open, setOpen] = useState(false)
  const Icon = section.icon

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors text-left"
      >
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center text-white flex-shrink-0"
          style={{ backgroundColor: section.color }}
        >
          <Icon size={18} />
        </div>
        <span className="flex-1 font-semibold text-gray-900">{section.title}</span>
        {open ? (
          <ChevronDown size={18} className="text-gray-400" />
        ) : (
          <ChevronRight size={18} className="text-gray-400" />
        )}
      </button>
      {open && (
        <div className="px-6 pb-6 border-t border-gray-100 pt-4">
          {section.content}
        </div>
      )}
    </div>
  )
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
        {n}
      </div>
      <p className="text-sm text-gray-700">{text}</p>
    </div>
  )
}

function Check({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2">
      <CheckCircle2 size={16} className="text-green-500 flex-shrink-0 mt-0.5" />
      <p className="text-sm text-gray-700">{text}</p>
    </div>
  )
}

export default function ComoUsarPage() {
  const sections: Section[] = [
    {
      id: 'inbox',
      icon: Inbox,
      color: '#3B82F6',
      title: 'Caixa de Entrada',
      content: (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Central de todas as conversas recebidas via WhatsApp, Instagram e Facebook.
          </p>
          <div className="space-y-2">
            <Check text="Clique em uma conversa na lista à esquerda para abri-la" />
            <Check text="Responda digitando no campo de texto e pressionando Enter ou clicando em Enviar" />
            <Check text="Atribua a conversa a um agente usando o painel de detalhes à direita" />
            <Check text="Altere o status da conversa (Aberta, Em andamento, Resolvida)" />
            <Check text="Adicione notas internas visíveis apenas para a equipe" />
          </div>
          <div className="bg-blue-50 rounded-lg p-3 mt-2">
            <p className="text-xs text-blue-700">
              <strong>Dica:</strong> Conversas não atribuídas aparecem como "Não atribuídas". Atribua a um agente para garantir que seja respondida.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'leads',
      icon: Users,
      color: '#8B5CF6',
      title: 'Leads',
      content: (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Gerencie todos os contatos e leads do seu workspace em uma tabela centralizada.
          </p>
          <div className="space-y-2">
            <Check text="Visualize nome, email, telefone e status de cada lead" />
            <Check text="Clique em um lead para ver o histórico de conversas" />
            <Check text="Leads são criados automaticamente quando uma nova conversa chega" />
            <Check text="Edite informações do lead diretamente no painel de detalhes" />
          </div>
        </div>
      ),
    },
    {
      id: 'pipeline',
      icon: Layers,
      color: '#F59E0B',
      title: 'Pipeline',
      content: (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Quadro Kanban para acompanhar o progresso das negociações.
          </p>
          <div className="space-y-2">
            <Check text="Arraste os cards entre as colunas para atualizar o estágio" />
            <Check text="Cada coluna representa uma etapa do processo de vendas" />
            <Check text="Clique em um card para ver detalhes do lead e histórico" />
            <Check text="Admins podem configurar as etapas do pipeline nas Configurações" />
          </div>
        </div>
      ),
    },
    {
      id: 'analytics',
      icon: BarChart2,
      color: '#10B981',
      title: 'Analytics',
      content: (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Métricas e relatórios do seu workspace. Visível apenas para administradores.
          </p>
          <div className="space-y-2">
            <Check text="Total de conversas abertas, resolvidas e em andamento" />
            <Check text="Tempo médio de resposta da equipe" />
            <Check text="Volume de conversas por dia/semana/mês" />
            <Check text="Desempenho por agente" />
          </div>
        </div>
      ),
    },
    {
      id: 'equipe',
      icon: UserPlus,
      color: '#6366F1',
      title: 'Adicionar membros da equipe',
      content: (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Somente admins podem convidar novos membros. Siga os passos abaixo:
          </p>
          <div className="space-y-2">
            <Step n={1} text='Vá para Configurações (ícone de engrenagem na sidebar)' />
            <Step n={2} text='Clique na aba "Equipe"' />
            <Step n={3} text='Clique no botão "Convidar membro"' />
            <Step n={4} text='Preencha nome, email e cargo (Admin ou Agente)' />
            <Step n={5} text='Clique em "Convidar" — uma senha temporária será gerada' />
            <Step n={6} text='Compartilhe o email e a senha temporária com o novo membro' />
          </div>
          <div className="bg-yellow-50 rounded-lg p-3">
            <p className="text-xs text-yellow-800">
              <strong>Importante:</strong> Anote a senha temporária que aparece após o convite — ela não será exibida novamente. O membro deve trocá-la no primeiro acesso.
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-600">
              <strong>Cargos:</strong><br />
              • <strong>Admin</strong> — acesso total (Configurações, Analytics, gerenciar equipe)<br />
              • <strong>Agente</strong> — acesso à Caixa de Entrada, Leads e Pipeline
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'canais',
      icon: Webhook,
      color: '#EF4444',
      title: 'Conectar canais (WhatsApp, Instagram, Facebook)',
      content: (
        <div className="space-y-6">

          {/* Prerequisitos */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-xs font-bold text-amber-900 mb-2">Pré-requisitos obrigatórios</p>
            <ul className="text-xs text-amber-800 space-y-1">
              <li>• Conta no Meta for Developers (developers.facebook.com)</li>
              <li>• App Meta do tipo <strong>Business</strong> criado</li>
              <li>• Número de WhatsApp Business <strong>OU</strong> Página do Facebook/Instagram Business</li>
              <li>• URL pública do sistema (ngrok para desenvolvimento local)</li>
            </ul>
          </div>

          {/* Parte 1: Criar App Meta */}
          <div>
            <h4 className="text-sm font-bold text-gray-900 mb-3">Parte 1 — Criar App no Meta Developer Console</h4>
            <div className="space-y-2">
              <Step n={1} text="Acesse developers.facebook.com e faça login" />
              <Step n={2} text='Clique em "Meus Apps" → "Criar App"' />
              <Step n={3} text='Selecione o tipo "Business" e preencha nome e email de contato' />
              <Step n={4} text="Clique em Criar App — você será redirecionado ao painel do App" />
            </div>
          </div>

          {/* WhatsApp */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 bg-green-50 border-b border-gray-200">
              <div className="w-7 h-7 rounded-lg bg-green-500 flex items-center justify-center">
                <MessageCircle size={14} className="text-white" />
              </div>
              <span className="text-sm font-bold text-gray-900">WhatsApp Business</span>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-gray-600">
                Receba e envie mensagens WhatsApp direto no CRM via <strong>Meta Cloud API</strong>. Não precisa de servidor próprio.
              </p>
              <div className="space-y-2">
                <Step n={1} text='No painel do App, clique em "Adicionar produto" e selecione WhatsApp' />
                <Step n={2} text='Vá em WhatsApp → Configuração de API → copie o "Token de acesso temporário" e o "Phone Number ID"' />
                <Step n={3} text='Para produção, gere um token permanente em: App → Configurações → Básico → copie o App Secret → crie um System User no Business Manager' />
                <Step n={4} text='Em WhatsApp → Configuração → role para "Webhook" → clique em Editar' />
                <Step n={5} text='Cole a URL do webhook: https://SEU-DOMINIO.com/api/webhooks/whatsapp' />
                <Step n={6} text='No campo "Verificar token", coloque o mesmo valor do WHATSAPP_VERIFY_TOKEN no seu .env.local' />
                <Step n={7} text='Clique em Verificar e salvar → em seguida, assine o campo "messages"' />
                <Step n={8} text='Vá em Configurações → Canais → WhatsApp → Configurar e preencha: Nome, Access Token, Phone Number ID e Número de telefone' />
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-700">
                <strong>Onde encontrar cada credencial:</strong><br />
                • <strong>Access Token:</strong> WhatsApp → Configuração de API → Token de acesso<br />
                • <strong>Phone Number ID:</strong> WhatsApp → Configuração de API → ID do número de telefone<br />
                • <strong>Número de telefone:</strong> o número no formato +55 11 99999-9999
              </div>
            </div>
          </div>

          {/* Instagram */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200" style={{ backgroundColor: '#fdf2f8' }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white" style={{ backgroundColor: '#E4405F' }}>
                <Instagram size={14} />
              </div>
              <span className="text-sm font-bold text-gray-900">Instagram Direct</span>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-gray-600">
                Receba DMs do Instagram. Requer conta Instagram <strong>Business</strong> vinculada a uma Página do Facebook.
              </p>
              <div className="space-y-2">
                <Step n={1} text='No painel do App Meta, clique em "Adicionar produto" e selecione Instagram Graph API' />
                <Step n={2} text='Vá em Instagram → Configuração → clique em "Adicionar conta do Instagram" e autorize sua conta Business' />
                <Step n={3} text='Copie o "Instagram User ID" (este é o Page ID para o Instagram)' />
                <Step n={4} text='Gere um token de longa duração (Long-lived Token) em: Instagram → Tokens de acesso' />
                <Step n={5} text='Em Instagram → Webhooks → configure a URL: https://SEU-DOMINIO.com/api/webhooks/instagram' />
                <Step n={6} text='Use o mesmo WHATSAPP_VERIFY_TOKEN como token de verificação e assine o campo "messages"' />
                <Step n={7} text='Vá em Configurações → Canais → Instagram → Configurar e preencha: Nome, Access Token, Page ID e Nome da conta' />
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-700">
                <strong>Importante:</strong> A conta Instagram deve ser <strong>Business ou Creator</strong> — contas pessoais não funcionam com a API.
              </div>
            </div>
          </div>

          {/* Facebook */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200" style={{ backgroundColor: '#eff6ff' }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white" style={{ backgroundColor: '#1877F2' }}>
                <Facebook size={14} />
              </div>
              <span className="text-sm font-bold text-gray-900">Facebook Messenger</span>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-gray-600">
                Receba mensagens do Messenger da sua Página do Facebook.
              </p>
              <div className="space-y-2">
                <Step n={1} text='No painel do App Meta, clique em "Adicionar produto" e selecione Messenger' />
                <Step n={2} text='Vá em Messenger → Configuração de API → clique em "Adicionar ou remover páginas" e selecione sua Página' />
                <Step n={3} text='Copie o "ID da Página" (Page ID) e gere o "Token de acesso à página"' />
                <Step n={4} text='Em Messenger → Webhooks → configure a URL: https://SEU-DOMINIO.com/api/webhooks/facebook' />
                <Step n={5} text='Use o mesmo WHATSAPP_VERIFY_TOKEN como token de verificação e assine "messages" e "messaging_postbacks"' />
                <Step n={6} text='Vá em Configurações → Canais → Facebook → Configurar e preencha: Nome, Access Token, Page ID e Nome da página' />
              </div>
            </div>
          </div>

          {/* URL publica / ngrok */}
          <div className="border border-blue-200 bg-blue-50 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Key size={15} className="text-blue-700" />
              <p className="text-xs font-bold text-blue-900">URL pública (obrigatório para webhooks funcionarem)</p>
            </div>
            <p className="text-xs text-blue-800">
              O Meta precisa conseguir acessar sua URL de webhook. Em produção, use seu domínio real. Em desenvolvimento local, use o <strong>ngrok</strong>:
            </p>
            <div className="bg-blue-100 rounded-lg p-3 font-mono text-xs text-blue-900 space-y-1">
              <p># Instalar ngrok (uma vez)</p>
              <p>brew install ngrok</p>
              <p className="mt-2"># Expor localhost:3000</p>
              <p>ngrok http 3000</p>
              <p className="mt-2"># Copiar a URL gerada (ex: https://abc123.ngrok.io)</p>
              <p># Usar como: https://abc123.ngrok.io/api/webhooks/whatsapp</p>
            </div>
            <p className="text-xs text-blue-700">
              Atualize também <code className="bg-blue-100 px-1 rounded">NEXT_PUBLIC_APP_URL</code> no .env.local com a URL do ngrok enquanto estiver testando.
            </p>
          </div>

          {/* Fluxo de mensagens */}
          <div>
            <h4 className="text-sm font-bold text-gray-900 mb-3">Como as mensagens fluem após a configuração</h4>
            <div className="bg-gray-50 rounded-lg p-4 text-xs text-gray-700 space-y-2">
              <p><strong>Mensagem recebida:</strong> Cliente envia mensagem → Meta chama o webhook → sistema cria/atualiza conversa na Caixa de Entrada → agente vê e responde</p>
              <p><strong>Mensagem enviada:</strong> Agente digita resposta na Caixa de Entrada → sistema usa o Access Token salvo → envia via API do Meta → cliente recebe no WhatsApp/Instagram/Facebook</p>
            </div>
          </div>

        </div>
      ),
    },
    {
      id: 'settings',
      icon: Settings,
      color: '#6B7280',
      title: 'Configurações',
      content: (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Acessível apenas para administradores. Contém três abas:
          </p>
          <div className="space-y-2">
            <Check text="Equipe — lista de membros e convite de novos usuários" />
            <Check text="Billing — planos disponíveis e gerenciamento de assinatura" />
            <Check text="Canais — configuração de WhatsApp, Instagram e Facebook" />
          </div>
        </div>
      ),
    },
  ]

  return (
    <div className="h-screen flex flex-col">
      <div className="h-16 px-6 border-b border-gray-200 bg-white flex items-center">
        <h1 className="font-semibold text-gray-900">Como usar</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">
          <p className="text-sm text-gray-500 mb-6">
            Guia rápido para usar o OmniCRM. Clique em cada seção para expandir.
          </p>

          <div className="space-y-3">
            {sections.map((section) => (
              <Accordion key={section.id} section={section} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
