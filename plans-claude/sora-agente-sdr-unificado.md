# Sora — Agente SDR Unificado: Plano Completo + Edge Cases + Testes

## Plano de Referência
Plano principal em `~/.claude/plans/cheeky-beaming-plum.md`

---

## EDGE CASES E TESTES POR PARTE

---

## PARTE 1: Desbloquear SDR para todas as conversas

### Edge Cases

**EC-1.1: Conversa sem canal (channelId null)**
- Conversas podem existir sem canal (importação manual, edge case)
- `processAiResponse` já faz `if (!conversation.channelId) return` — manter guard
- Teste: criar conversa sem `channelId`, ativar Sora → deve NÃO responder, sem crash

**EC-1.2: Canal sem credenciais**
- Canal WhatsApp sem `instanceToken` (desconectado)
- Canal Meta sem `accessToken` (token expirado)
- Teste: ativar Sora em conversa com canal desconectado → deve logar warning e NÃO crashar

**EC-1.3: Envio Instagram/Facebook falha (token expirado)**
- `accessToken` pode expirar (Meta tokens duram ~60 dias)
- Teste: simular `sendInstagramMessage` retornando erro → mensagem deve salvar com `status: FAILED`
- A conversa deve continuar funcionando, Sora não deve travar

**EC-1.4: Conversa de grupo WhatsApp**
- `externalId` pode ter formato `@g.us` (grupo) vs `@s.whatsapp.net` (individual)
- Sora deve funcionar em ambos
- Teste: ativar Sora em conversa de grupo → deve responder, sendTo correto

**EC-1.5: Múltiplas mensagens simultâneas de canais diferentes**
- 2 leads mandam msg ao mesmo tempo (1 WhatsApp, 1 Instagram)
- Debounce é por `conversationId`, não há conflito
- Teste: 2 conversas com Sora ativa recebem msg simultâneo → ambas processam independentemente

**EC-1.6: Toggle Sora durante conversa em andamento**
- Usuário desliga Sora no meio da conversa
- Lead manda msg → Sora não deve responder
- Teste: ligar Sora → lead manda msg → desligar Sora → lead manda msg → não responde

**EC-1.7: Human takeover sem dispatch**
- Hoje human takeover check tem guard `dispatchListId`
- Após remover guard, humano envia msg manual em conversa orgânica com Sora → deve bloquear Sora (40 min)
- Teste: ativar Sora → humano envia msg manual → lead manda msg → Sora NÃO responde por 40 min

**EC-1.8: Conversa com canal Instagram DM request**
- Instagram pode ter DM requests (não aceitos) vs conversas normais
- Sora deve responder em ambos
- Teste: Sora ativa em conversa Instagram DM request → deve enviar resposta normalmente

---

## PARTE 2: Billing — Atendimentos/Mês + Overflow

### Edge Cases

**EC-2.1: Primeiro atendimento do mês (reset)**
- `soraResetDate` precisa ser verificado antes de checar limite
- Se resetDate < agora → resetar `soraUsedThisMonth = 0` e atualizar `soraResetDate`
- Teste: simular virada de mês → contador reseta, Sora funciona novamente

**EC-2.2: Race condition na contagem**
- 2 conversas novas chegam simultaneamente, ambas são o 100° atendimento
- Usar operação atômica (`increment: 1`) ou Redis SETNX
- Teste: simular 5 conversas simultâneas com limite de 3 → apenas 3 devem consumir atendimento

**EC-2.3: Overflow — transição plano → token**
- Limite de 100 atingido, workspace tem 50 tokens
- Próxima conversa deve consumir 1 token e funcionar
- Teste: usar 100 atendimentos → próxima conversa → token consumido → Sora funciona

**EC-2.4: Sem atendimentos nem tokens**
- Limite atingido + saldo de tokens = 0
- Sora NÃO deve responder + notificar workspace
- Teste: zerar tudo → nova conversa → Sora não responde, log `[SORA] no attendances left`
- UI: banner vermelho "Atendimentos esgotados"

**EC-2.5: Conversa já em andamento quando limite é atingido**
- Conversa com Sora ativa, 10 msgs trocadas, limite atinge durante a conversa
- A conversa JÁ consumiu 1 atendimento no início → deve continuar funcionando até max_messages
- Teste: consumir todos atendimentos → conversa já ativa → Sora continua respondendo

**EC-2.6: Token consumido mas resposta falha**
- `consumeSoraAttendance` executa → OpenAI retorna erro → nenhuma msg enviada
- Token/atendimento foi consumido mas não houve valor
- Decisão: NÃO fazer refund automático (muito complexo). Log o evento.
- Teste: simular falha OpenAI após consumo → atendimento é debitado, log de erro

**EC-2.7: Plano downgrade (600 → 100 atendimentos)**
- Cliente já usou 250 atendimentos, faz downgrade para Starter (100)
- `soraUsedThisMonth` > novo limite → Sora fica bloqueada até reset ou compra tokens
- Teste: workspace com 250 usado, alterar `soraMonthlyLimit = 100` → Sora não ativa novos, existentes continuam

**EC-2.8: Trial sem atendimentos**
- Trial workspace (`subscriptionStatus: TRIAL`) → `soraMonthlyLimit = 0`
- Sora não deve funcionar no trial (ou dar X grátis)
- Decisão: trial pode ter 5-10 atendimentos demo
- Teste: workspace trial → ativar Sora → funciona até limite demo

**EC-2.9: Contagem duplicada (retry do QStash)**
- QStash pode reenviar msg → `processAiResponse` é chamado 2x para mesma msg
- Dedup por `messageid` já existe no message-ingest
- Mas o debounce buffer pode ter a msg 2x
- Teste: enviar mesma msg 2x via webhook → Sora responde apenas 1x

---

## PARTE 3: Prompt Inteligente

### Edge Cases

**EC-3.1: Config do workspace vazia**
- Sem `businessName`, sem `products`, sem `objections`
- Prompt deve funcionar com mínimo viável (só identidade + modo + regras)
- Teste: config vazia → Sora responde de forma genérica mas funcional

**EC-3.2: Knowledge base vazia + orgânico**
- Sem docs na KB + conversa orgânica = prompt muito curto
- Sora deve ser mais investigativa nesse cenário
- Teste: config mínima + sem KB + orgânico → Sora faz perguntas de descoberta

**EC-3.3: Prompt muito longo (KB + resumo + histórico)**
- KB chunks + resumo cumulativo + 10 msgs pode estourar janela do modelo
- Limitar: KB max 2000 tokens, resumo max 500 tokens, histórico max 10 msgs
- Teste: simular prompt com todos os elementos → verificar que cabe na janela

**EC-3.4: Modo campaign_followup sem leadContext**
- Conversa com `dispatchListId` mas `dispatchListContact` deletado
- `leadContext` será `undefined` mesmo em campaign_followup
- Sora deve funcionar em modo campaign_followup sem dados do lead
- Teste: conversa dispatch sem contact data → funciona mas sem personalização

**EC-3.5: ChannelType desconhecido**
- Canal com tipo não mapeado no switch
- Fallback: usar style pack WhatsApp (mais genérico)
- Teste: canal com tipo custom → usa WhatsApp style

**EC-3.6: Stage regression**
- Score de qualificação sobe de 5 para 8, depois volta para 4 (requalificação)
- Stage não deve regredir: uma vez QUALIFYING, não volta para DISCOVERY
- Opção: usar `max(currentStage, inferredStage)`
- Teste: score 8 → requalify com score 4 → stage deve permanecer QUALIFYING

**EC-3.7: Handoff detectado mas nenhum agente disponível**
- `findBestAgent` retorna null (todos inativos, ou sem users)
- Conversa fica `UNASSIGNED` com `aiSalesEnabled: false`
- Sora envia msg sistema mas sem atribuição
- Teste: handoff com zero agentes ativos → conversa fica unassigned + briefing salvo

**EC-3.8: [HANDOFF] e [AGENDAR] na mesma resposta**
- AI inclui ambos markers
- Handoff tem prioridade (transfere para humano)
- Teste: resposta com ambos → handoff executado, agendamento ignorado

**EC-3.9: AI gera resposta vazia**
- OpenAI retorna content vazio ou null
- Deve silenciosamente ignorar, não crashar
- Teste: simular resposta vazia → nada enviado, nenhum erro

**EC-3.10: Lead manda áudio/imagem em conversa orgânica**
- `processMessageContent` precisa funcionar sem dispatch context
- Transcrição de áudio / descrição de imagem deve funcionar normalmente
- Teste: lead manda áudio no orgânico → transcrição processada → Sora responde sobre o conteúdo

---

## PARTE 4: Knowledge Base + RAG

### Edge Cases

**EC-4.1: PDF com texto não extraível (scanned/image PDF)**
- `pdf-parse` falha em PDFs que são imagens
- Retornar erro amigável: "Este PDF parece ser uma imagem. Tente um PDF com texto selecionável."
- Teste: upload PDF escaneado → erro amigável, não crash

**EC-4.2: Arquivo muito grande**
- PDF com 100+ páginas → texto muito longo → muitos chunks
- Limitar: max 50 páginas ou 100KB de texto extraído
- Teste: upload PDF gigante → erro "Arquivo muito grande" ou trunca

**EC-4.3: Upload de arquivo malicioso**
- Validar MIME type e extensão
- Aceitar apenas: `.pdf`, `.txt`, `.docx`
- Teste: upload de `.exe` renomeado para `.pdf` → rejeitado

**EC-4.4: RAG sem matches**
- `findRelevantChunks` retorna array vazio (nenhum chunk relevante)
- Sora funciona normalmente sem KB context
- Teste: mensagem completamente fora do domínio dos docs → funciona sem KB

**EC-4.5: Chunks duplicados entre documentos**
- 2 PDFs com conteúdo similar → chunks duplicados
- Pode retornar o mesmo info 2x
- Aceitável na v1 (keyword matching é simples)
- Teste: upload 2 docs similares → resposta coerente, sem repetição absurda

**EC-4.6: Documento deletado durante conversa**
- Admin deleta doc da KB enquanto Sora está respondendo
- Próxima resposta simplesmente não terá os chunks daquele doc
- Teste: deletar doc → próxima msg → Sora funciona sem crash

---

## PARTE 5: Auto-ativação por Canal

### Edge Cases

**EC-5.1: Canal com aiAutoActivate + conversa existente**
- Lead já tem conversa anterior (sem AI) → manda nova msg
- O upsert deve ativar AI apenas em conversas NOVAS (create), não em updates
- Teste: conversa existente sem AI + canal auto → nova msg → AI NÃO ativada automaticamente
- Teste: lead novo + canal auto → nova conversa → AI ativada

**EC-5.2: Canal auto + workspace sem atendimentos**
- Canal com `aiAutoActivate = true` mas workspace sem atendimentos disponíveis
- Conversa criada com `aiSalesEnabled: true` mas Sora não consegue responder (billing gate)
- Teste: zero atendimentos + canal auto → conversa criada com aiEnabled mas Sora bloqueada → lead fica sem resposta
- Considerar: não auto-ativar se não tem atendimentos (melhor UX)

**EC-5.3: Toggle manual override**
- Canal auto-ativa, mas humano desliga toggle na conversa → deve respeitar
- Teste: auto-ativada → humano desliga → lead manda msg → Sora NÃO responde

**EC-5.4: Múltiplos canais WhatsApp**
- Workspace com 2 números WhatsApp, 1 com auto e 1 sem
- Teste: msg no canal auto → AI ativa. Msg no canal sem auto → AI desativada

---

## PARTE 6: Resumo Cumulativo

### Edge Cases

**EC-6.1: Resumo cumulativo + handoff timing**
- Gerar resumo ANTES do handoff (não só a cada 10 msgs)
- Teste: conversa com 7 msgs → handoff → resumo gerado no momento do handoff

**EC-6.2: Resumo com conteúdo sensível**
- Lead compartilha dados pessoais (CPF, endereço, etc)
- Resumo pode conter dados sensíveis
- Aceitável: dados ficam no DB do workspace, não são expostos externamente
- Teste: lead manda CPF → resumo inclui no contexto → próxima resposta usa naturalmente

**EC-6.3: Resumo corrompido (OpenAI retorna lixo)**
- Resposta de resumo pode ser JSON inválido ou texto sem estrutura
- Fallback: usar resumo anterior ou nenhum
- Teste: simular resposta corrompida → usa resumo anterior, log warning

**EC-6.4: Conversa muito curta (2-3 msgs) + handoff**
- Resumo pode ser inútil com poucas msgs
- Gerar resumo apenas se `aiMessageCount >= 3`
- Teste: conversa de 2 msgs → handoff → briefing gerado mas sem resumo cumulativo

---

## PARTE 7: Visual AI

### Edge Cases

**EC-7.1: ai-avatar.svg não carrega**
- Fallback: ícone Bot do lucide-react (comportamento atual)
- Teste: renomear SVG temporariamente → fallback exibido

**EC-7.2: Animação pulse em muitas conversas**
- 50 conversas com Sora ativa na lista → 50 animações
- Performance: CSS animation é leve, não deve impactar
- Teste: lista com 50+ conversas com AI ativa → scroll suave, sem lag

**EC-7.3: senderName "Sora" em mensagens antigas**
- Mensagens antigas terão `senderName: "AI Vendedor"` ou config anterior
- Exibir o que estiver salvo no DB, não forçar "Sora" retroativamente
- Teste: conversa com msgs antigas "AI Vendedor" + novas "Sora" → exibe cada um corretamente

---

## PARTE 8: Menu / Página Sora

### Edge Cases

**EC-8.1: Usuário non-admin tenta acessar /sora**
- Rota deve ter guard de autenticação + admin check
- Teste: agent (não admin) acessa /sora → redirect ou 403

**EC-8.2: Workspace sem config de Sora**
- Primeiro acesso: nenhum `AiSalesConfig` existe
- Mostrar wizard de setup / onboarding
- Teste: workspace novo → página Sora → mostra setup, não erros

**EC-8.3: Submenu "Agentes de IA" collapse state**
- Lembrar se submenu está aberto/fechado (localStorage)
- Auto-abrir se pathname match com `/agents/buscador` ou `/agents/disparador`
- Teste: navegar para buscador → submenu abre. Navegar para inbox → submenu fecha

---

## TESTES DE INTEGRAÇÃO END-TO-END

### T-E2E-1: Fluxo completo orgânico WhatsApp
```
1. Canal WhatsApp com aiAutoActivate: true
2. Lead novo manda "Oi, quero saber sobre seus serviços"
3. → Conversa criada com aiSalesEnabled: true
4. → 1 atendimento consumido
5. → Sora responde em modo inbound_sales + style WhatsApp
6. → Mensagem aparece no inbox em tempo real (Pusher)
7. → Avatar Sora pulsante na ConversationList
8. → Lead interage por 8 msgs
9. → Score qualificação 7/10
10. → Sora detecta [HANDOFF]
11. → Resumo cumulativo gerado
12. → findBestAgent seleciona por specializations
13. → Briefing criado + conversa atribuída
14. → Pusher notifica atendente
15. → Atendente vê briefing na conversa
```

### T-E2E-2: Fluxo completo dispatch
```
1. Disparador envia template para lista
2. Lead responde
3. → Conversa criada com dispatchListId + aiSalesEnabled: true
4. → 1 atendimento consumido
5. → Sora responde em modo campaign_followup
6. → Usa leadContext (nome, businessType, review)
7. → Personaliza abordagem
8. → Qualifica e transfere
```

### T-E2E-3: Fluxo orgânico Instagram
```
1. Lead manda DM no Instagram
2. → Conversa criada (canal com aiAutoActivate: true)
3. → Sora responde via sendInstagramMessage
4. → Style pack Instagram (curto, leve)
5. → Msg aparece no inbox via Pusher
```

### T-E2E-4: Overflow de atendimentos
```
1. Workspace com Starter (100 atendimentos) + 10 tokens
2. 100 conversas com Sora → atendimentos esgotados
3. → Banner "Atendimentos esgotados" na página Sora
4. 101ª conversa → consome 1 token → Sora funciona
5. → UI mostra "Usando atendimentos extras (tokens)"
6. 111ª conversa → sem tokens → Sora bloqueada
7. → Banner vermelho "Recarregue para continuar"
```

### T-E2E-5: Human takeover orgânico
```
1. Sora ativa em conversa orgânica
2. Humano envia msg manual na conversa
3. → detectHumanTakeover → blockAI (40 min TTL)
4. → Lead manda msg → Sora NÃO responde
5. → Após 40 min → Sora volta a responder (se ainda ativa)
```

### T-E2E-6: Knowledge Base + RAG
```
1. Admin faz upload de PDF com tabela de preços
2. → Texto extraído → dividido em chunks → salvo no DB
3. Lead pergunta "Quanto custa o plano básico?"
4. → findRelevantChunks retorna chunk com preços
5. → Sora responde com informação do PDF
6. Lead pergunta "Vocês fazem site?" (fora da KB)
7. → Nenhum chunk relevante → Sora responde sem KB context
```

### T-E2E-7: Conversa longa com resumo cumulativo
```
1. Sora ativa em conversa
2. 10 msgs trocadas → resumo cumulativo gerado
3. → aiContextSummary salvo na conversa
4. 20 msgs trocadas → resumo atualizado (merge com anterior)
5. → Prompt agora usa: system + resumo + últimas 10 msgs
6. → Sora lembra do que foi dito na msg 3 (via resumo)
```

### T-E2E-8: Menu e navegação
```
1. Admin faz login → sidebar mostra Sora com avatar
2. Clica Sora → dashboard com métricas + config
3. Clica "Agentes de IA" → submenu expande → Buscador + Disparador
4. Agent (não admin) faz login → Sora não aparece no menu
```

### T-E2E-9: Recarga de tokens
```
1. Atendimentos esgotados → página Sora mostra banner vermelho
2. Clica "Recarregar atendimentos"
3. → Modal com pacotes de tokens (R$50-R$200)
4. Compra R$100 = 100 tokens
5. → Saldo atualiza → Sora volta a funcionar com overflow
6. → UI mostra "Usando atendimentos extras: 3/100 tokens"
```

### T-E2E-10: Config de Handoff na Sora
```
1. Admin acessa Sora → tab "Equipe & Handoff"
2. Define especialização "marketing" para João
3. Define especialização "direito" para Maria
4. Lead qualificado com needCategory "marketing"
5. → findBestAgent seleciona João
6. → Briefing enviado para João
```

---

## TESTES DE REGRESSÃO

### T-REG-1: Dispatch continua funcionando
- Disparar template → lead responde → Sora ativa → qualifica → handoff
- Não deve quebrar com as mudanças

### T-REG-2: Billing de tokens para Buscador/Disparador
- Buscador usa tokens normalmente (não afetado por mudança da Sora)
- Disparador usa tokens normalmente

### T-REG-3: Pusher events continuam chegando
- new-message, conversation-assigned, sora-handoff (renomeado)
- Frontend recebe e atualiza em tempo real

### T-REG-4: Debounce continua funcionando
- 3 msgs rápidas → buffer → 1 resposta concatenada

### T-REG-5: Max messages por conversa
- Config de maxMessagesPerConversation ainda funciona
- Quando atinge limite → handoff automático

---

## CHECKLIST PRÉ-IMPLEMENTAÇÃO

- [ ] Fazer backup do DB antes de schema changes
- [ ] Rodar `npx prisma db push` após schema changes
- [ ] Rodar `npx prisma generate` após schema changes
- [ ] Reiniciar Next.js dev server após generate
- [ ] Verificar que env vars existem: OPENAI_API_KEY, UAZAPI_*, PUSHER_*
- [ ] Instalar `pdf-parse` se não existir: `bun add pdf-parse`
- [ ] Testar em dev antes de deploy para Vercel
