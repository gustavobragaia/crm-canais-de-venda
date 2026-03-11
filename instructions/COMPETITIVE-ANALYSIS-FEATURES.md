# Análise Competitiva e Roadmap de Features

> Baseado em: análise do vídeo do Chat Jurídico + scraping completo do helenacrm.com
> Data: Março 2026

---

## Contexto

Dois concorrentes analisados:

1. **Chat Jurídico** — CRM focado no mercado jurídico com IA para qualificação de leads e consulta de processos em tribunais
2. **Helena CRM** (helenacrm.com) — Plataforma completa white-label com 6.000+ clientes, 52.000+ usuários ativos/dia e 1,5 bilhão de mensagens/ano

Nossa plataforma atual tem: inbox unificado (WhatsApp/Meta), pipeline Kanban, analytics básico, gestão de equipe e billing.

---

## Bug Identificado: Sender em mensagens de grupo

O UazAPI já envia `senderName` e `isGroup` no webhook, mas o campo não é persistido por mensagem.

**Problema:** Ao visualizar uma conversa de grupo, não aparece quem enviou cada mensagem — todas aparecem genéricas.

**Fix:**
1. Adicionar campo `senderName String?` ao model `Message` no schema
2. Popular `senderName` no webhook ao criar mensagem inbound
3. No `MessageThread.tsx`, exibir o nome do remetente acima da bolha para mensagens INBOUND de grupo

---

## O que os concorrentes têm que não temos

### 🔴 ALTA PRIORIDADE — Maiores diferenciais competitivos

| Feature | Fonte | Descrição |
|---------|-------|-----------|
| **AI Agent / Chatbot** | Ambos | Atende leads 24/7, qualifica automaticamente, toggle on/off por conversa, resumo da IA |
| **Templates de Mensagem** | Helena | Respostas rápidas pré-configuradas para agentes (atalho "/" no input) |
| **Roteamento Automático** | Helena | Round-robin, auto-atribuição por regras de equipe/canal |
| **Agendamento de Mensagens** | Ambos | Agendar mensagem por data/hora diretamente no chat |
| **Automações** | Ambos | Trigger por keyword/tag/estágio → ações automáticas |
| **Log de Atividades** | Vídeo | Timeline de tudo que aconteceu na conversa (sem precisar reler o chat inteiro) |

### 🟡 MÉDIA PRIORIDADE — Produtividade e UX

| Feature | Fonte | Descrição |
|---------|-------|-----------|
| **Campanhas / Bulk Messaging** | Helena | Envio segmentado para listas de contatos filtradas |
| **Cadência / Sequências** | Helena | Drip messages: configurar uma vez, disparar automaticamente em intervalos |
| **Métricas de IA** | Vídeo | "X horas economizadas este mês", contagem de atendimentos automáticos |
| **Heatmap de Atendimento** | Ambos | Grade visual de pico de horários e dias da semana |
| **Distribuição Geográfica** | Vídeo | Mapa de origem dos leads no Brasil |
| **SLA de Tempo de Resposta** | Helena | Primeiro tempo de resposta e média por agente |
| **Campos Personalizados** | Helena | Adicionar campos customizados além de nome/telefone/email |
| **Monitoramento de Supervisor** | Helena | Admin vê todas as conversas em tempo real sem participar |
| **Consulta de Dados Externos** | Chat Jurídico | Ver seção dedicada abaixo |

### 🟢 BAIXA PRIORIDADE — Expansão de ecossistema

| Feature | Fonte | Descrição |
|---------|-------|-----------|
| **Chat Interno de Equipe** | Helena | Comunicação entre agentes dentro da plataforma |
| **Audit Logs** | Helena | Registro de todas as mudanças de config, webhooks, ações |
| **Grupos do WhatsApp** | Helena | UazAPI suporta totalmente (13 endpoints) — postergado |

---

## AI Agent — Fluxo End-to-End Completo

Esta é a maior lacuna competitiva. Detalhe de como deve funcionar:

### 1. Configuração (Settings → "Agente de IA")

O admin configura por canal ou workspace:

- **Nome do agente** — como ele se apresenta ao cliente (ex: "Sofia", "Assistente Clovis")
- **Objetivo** — o que ele deve fazer (ex: "Qualificar leads e agendar reuniões comerciais")
- **Tom de resposta** — formal / humanizado / direto
- **Áreas de atuação / conhecimento** — texto livre que é injetado no system prompt (ex: "Somos uma clínica odontológica especializada em implantes e ortodontia")
- **Horário de funcionamento** — faixa de horas para responder; fora do horário → mensagem configurada
- **Mensagem fora do horário** — ex: "Olá! No momento estamos fora do horário de atendimento. Retornaremos às 8h."
- **Máximo de mensagens da IA** — após X trocas sem qualificar, transfere para humano
- **Toggle global** — ativo/inativo por canal

### 2. Fluxo de Recebimento (Webhook)

```
Nova mensagem chega → /api/webhooks/uazapi
  ↓
Salvar mensagem no DB (fluxo atual)
  ↓
Checar: existe AgentConfig ativo para esse canal/workspace?
  ↓ sim
Checar: conversation.aiEnabled == true? (toggle por conversa)
  ↓ sim
Checar: estamos dentro do horário de funcionamento?
  ↓ sim
Checar: conversation.aiMessageCount < maxAiMessages?
  ↓ sim
→ Chamar lib/ai/agent.ts de forma assíncrona
  ↓ não (fora do horário)
→ Enviar mensagem de fora do horário (uma vez por conversa)
```

### 3. Processamento da IA (lib/ai/agent.ts)

```
Carregar AgentConfig do workspace/canal
Carregar últimas 20 mensagens da conversa para contexto
Carregar dados do contato (nome, tags, estágio no pipeline)

System prompt gerado automaticamente:
  "Você é [nome], assistente virtual de [empresa/objetivo].
   Tom de resposta: [tom].
   Conhecimento: [áreas de atuação].

   Seu papel é:
   1. Recepcionar o contato de forma humanizada
   2. Entender qual é o problema ou necessidade
   3. Qualificar o lead coletando: nome completo, problema/necessidade, urgência, melhor horário para contato
   4. Quando tiver todas as informações → informar que um especialista entrará em contato em breve

   Regras:
   - Não mencione que é uma IA, a menos que perguntado diretamente
   - Seja empático e acolhedor, não robotizado
   - Respostas curtas e diretas (como conversa de WhatsApp)
   - Nunca invente informações que não foram configuradas

   Retorne SEMPRE um JSON no formato:
   {
     'response': 'mensagem para o cliente',
     'qualified': true/false,
     'collectedData': {
       'name': '...',
       'need': '...',
       'urgency': '...',
       'bestTime': '...'
     }
   }"

Chamar Claude API (claude-sonnet-4-6)
Parsear resposta JSON
```

### 4. Envio da Resposta

```
Enviar response via UazAPI POST /send/text
Salvar mensagem no DB como OUTBOUND com aiGenerated: true
Incrementar conversation.aiMessageCount
```

### 5. Qualificação e Handoff para Humano

```
Se qualified == true:
  → Adicionar tag "QUALIFICADO" na conversa
  → Desabilitar IA para essa conversa (aiEnabled = false)
  → Notificar agentes disponíveis via Pusher
  → IA envia mensagem final configurável: "Um especialista entrará em contato em breve!"
  → Criar Lead no pipeline (se não existir)
  → Popular Lead com collectedData (nome, problema, urgência)
  → Registrar no Log de Atividades

Se aiMessageCount >= maxAiMessages sem qualificar:
  → Mesmo fluxo com tag "TRANSFERIDO_HUMANO"
  → Agente assume a conversa manualmente
```

### 6. Toggle por Conversa

- Switch "IA ativa/inativa" no painel lateral (LeadDrawer)
- Agente pode desligar a IA para assumir a conversa manualmente
- Agente pode religar se precisar que a IA retome
- Estado persistido em `conversation.aiEnabled`

### 7. Resumo da IA (on-demand)

- Botão "Gerar Resumo" no LeadDrawer
- Chama endpoint POST `/api/ai/summary/[conversationId]`
- Prompt: "Resuma em bullet points: quem é o contato, qual o problema relatado, status de qualificação, dados coletados, próximos passos sugeridos"
- Exibido no painel lateral em campo dedicado

### 8. Métricas de IA no Analytics

- Card: "X conversas atendidas pela IA este mês"
- Card: "~X horas economizadas" (estimativa: 3 min por mensagem da IA)
- Breakdown: qualificados pela IA vs. transferidos manualmente

---

## Consulta de Dados Externos — Generalização do Chat Jurídico

O Chat Jurídico tem uma feature interessante: o atendente digita o número do processo e a IA busca as movimentações em tribunais automaticamente. Isso pode ser generalizado para qualquer nicho.

### Conceito: "Data Sources" configuráveis

O admin configura fontes de dados externas que a IA pode consultar durante a conversa:

| Nicho | Fonte de Dados | Identificador | Exemplo de resposta |
|-------|---------------|---------------|---------------------|
| Jurídico | API de tribunais | Número do processo | "Seu processo teve uma movimentação em 05/03: Juntada de petição" |
| E-commerce | API de pedidos | Número do pedido | "Seu pedido #12345 saiu para entrega hoje às 09h, previsão: amanhã" |
| Clínicas | API de prontuários | CPF / ID do paciente | "Sua próxima consulta está agendada para 15/03 às 14h" |
| Imobiliárias | API de portais | Código do imóvel | "O imóvel está disponível para visita. Área: 90m², 3 quartos" |

### Como funciona

1. Admin configura uma "Fonte de Dados": URL base, autenticação, parâmetro de busca, descrição do que retorna
2. A IA é informada no system prompt sobre quais Data Sources existem e quando usá-los
3. A IA detecta o identificador na fala do cliente (número do processo, pedido, etc.)
4. Backend consulta a API externa e retorna os dados para a IA
5. IA responde em linguagem natural, sem jargão técnico

### Avaliação

Feature poderosa e diferenciadora, mas com complexidade técnica maior (tool calling, parsing de respostas externas). Recomendado implementar após as fases 1-3 consolidadas.

---

## Roadmap de Implementação

### Fase 0 — Bug Fix (quick win)
- [ ] Fix de sender name em mensagens de grupo

### Fase 1 — AI Agent
- [ ] Configuração do agente (Settings)
- [ ] Hook no webhook de mensagens
- [ ] Processamento e resposta da IA
- [ ] Qualificação e handoff automático
- [ ] Toggle por conversa no LeadDrawer
- [ ] Resumo da IA on-demand

### Fase 2 — Produtividade da Equipe
- [ ] Templates de mensagem com atalho "/"
- [ ] Log de atividades por conversa (timeline)

### Fase 3 — Automações e Agendamento
- [ ] Agendamento de mensagens
- [ ] Automações básicas (triggers + ações)

### Fase 4 — Analytics Avançado
- [ ] Métricas de IA (conversas, horas economizadas)
- [ ] Heatmap de atendimento
- [ ] SLA de tempo de resposta por agente

### Fase 5 — Expansão (futuro)
- [ ] Consulta de Dados Externos (Data Sources)
- [ ] Campanhas / Bulk Messaging
- [ ] Cadência / Sequências
- [ ] Chat interno de equipe

---

## Arquivos Críticos para Implementação

| Arquivo | Mudança |
|---------|---------|
| `prisma/schema.prisma` | AgentConfig, MessageTemplate, ConversationActivity, ScheduledMessage, Automation + campos em Message/Conversation |
| `app/api/webhooks/uazapi/route.ts` | Hook de IA + fix de senderName |
| `components/inbox/MessageThread.tsx` | Exibir sender em mensagens de grupo |
| `components/LeadDrawer.tsx` | Toggle de IA, resumo, log de atividades |
| `app/[workspaceSlug]/settings/page.tsx` | Abas: Agente de IA, Templates, Automações |
| `app/[workspaceSlug]/analytics/page.tsx` | Métricas de IA, heatmap |
| `lib/ai/agent.ts` | Novo: lógica do agente de IA |
| `app/api/ai/summary/[conversationId]/route.ts` | Novo: endpoint de resumo |

---

## Resumo Executivo

O maior gap competitivo é o **AI Agent** — todos os concorrentes têm isso como feature central de vendas. Depois vêm **templates** e **log de atividades** que reduzem trabalho repetitivo. O diferencial mais interessante do Chat Jurídico é a **Consulta de Dados Externos**, que generalizado para qualquer nicho cria um produto muito mais poderoso que o dos concorrentes.

Prioridade sugerida:
1. Bug fix: sender em grupos (5 min de impacto, 1h de trabalho)
2. AI Agent completo (maior diferencial competitivo)
3. Templates de mensagem (quick win, alto uso diário)
4. Log de atividades (elimina leitura de chat)
5. Agendamento de mensagens
6. Automações básicas
7. Analytics avançado (heatmap + métricas de IA)
8. Data Sources externos (feature premium futura)
