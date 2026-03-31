# Fix: Mensagens não aparecem em tempo real na conversa aberta

## Contexto

Após implementar QStash (Fase 2B), o pipeline end-to-end funciona:
webhook → QStash → worker → DB → Pusher. A **lista de conversas (sidebar esquerda)**
atualiza corretamente (mostra `lastMessagePreview`), mas a **conversa aberta (painel direito)**
NÃO mostra novas mensagens inbound em tempo real. O usuário precisa recarregar ou reclicar
a conversa para ver as novas mensagens.

Mensagens outbound (enviadas do CRM) funcionam perfeitamente em tempo real.

---

## Análise do fluxo real-time

### Caminho OUTBOUND — funciona ✅

```
POST /api/conversations/[id]/messages/route.ts (linha 180-194)
  → db.message.create({
      data: { ... },
      include: { sentBy: { select: { id: true, name: true, avatarUrl: true } } }  ← COM include
    })
  → pusherServer.trigger('workspace-WS', 'message-sent', { conversationId, message })
  → InboxPage: fetchConversations() + window.dispatchEvent('message-sent', data)
  → MessageThread: handleNewMessage → setMessages([...prev, message])
```

### Caminho INBOUND via worker — NÃO funciona ❌

```
lib/queue/message-ingest-logic.ts (linha 102-120)
  → db.message.create({
      data: { ... }
      // ← SEM include: { sentBy } ← PROBLEMA 1
    })
  → pusherServer.trigger('workspace-WS', 'new-message', { conversationId, message: savedMessage })
  → InboxPage: fetchConversations() ✅ + window.dispatchEvent('new-message', data)
  → MessageThread: handleNewMessage → setMessages([...prev, message]) ← deveria funcionar
```

### Por que a sidebar atualiza:

`fetchConversations()` é chamado pelo Pusher handler no InboxPage. Isso faz GET `/api/conversations`
que retorna `lastMessagePreview` do DB (já atualizado pelo worker no STEP 7).

### Por que o MessageThread NÃO atualiza — causas:

**Causa 1: Objeto message sem `sentBy` relation**
- Worker faz `db.message.create({data})` SEM `include: { sentBy }`
- O payload do Pusher tem o raw Prisma object: `sentBy` simplesmente NÃO EXISTE no objeto
- O GET endpoint (`/api/conversations/[id]/messages`) retorna mensagens COM `sentBy: null` ou `sentBy: { id, name }`
- O POST endpoint (outbound) retorna COM `include: { sentBy }`
- Embora `sentBy` undefined vs null não cause crash direto no render, a inconsistência de shape
  pode causar problemas sutis no React state management

**Causa 2: `history-message` event sem handler no frontend**
- No STEP 2 (dedup), o worker envia `payload.isHistory ? 'history-message' : 'new-message'`
- O InboxPage NÃO escuta `history-message` — apenas `new-message` e `message-sent`
- O MessageThread também NÃO escuta `history-message`
- Se alguma mensagem chegar como `history-message`, ela é invisível no frontend

**Causa 3: Dedup branch envia message sem `sentBy`**
- Na branch de dedup (STEP 2, linha 46), `fullMessage` vem de `db.message.findUnique()` SEM include
- Mesmo problema da Causa 1

---

## Arquivos relevantes (leitura obrigatória antes de implementar)

| Arquivo | O que ler | Linhas chave |
|---------|-----------|-------------|
| `lib/queue/message-ingest-logic.ts` | Worker principal — STEP 2 (dedup) e STEP 6 (create) | 40-56, 102-120, 132-137 |
| `app/api/conversations/[id]/messages/route.ts` | GET (shape de referência) e POST (outbound) | 34-43, 180-208 |
| `app/[workspaceSlug]/inbox/page.tsx` | Pusher handlers e window dispatch | 101-117 |
| `components/inbox/MessageThread.tsx` | Event listeners e rendering | 118-151, 299-371 |
| `hooks/usePusher.ts` | Hook Pusher (ref pattern) | 1-32 |

---

## Implementação

### Fix 1: Adicionar `include: { sentBy }` no STEP 6 — Create message

**Arquivo:** `lib/queue/message-ingest-logic.ts`
**Localização:** STEP 6, ~linha 102

ANTES:
```typescript
const savedMessage = await db.message.create({
  data: {
    conversationId: conversation.id,
    workspaceId: channel.workspaceId,
    direction: payload.direction,
    content: payload.content,
    externalId: payload.externalId || undefined,
    status: payload.direction === 'OUTBOUND' ? 'SENT' : 'DELIVERED',
    senderName: payload.senderName ?? null,
    sentAt: new Date(payload.sentAt),
    aiGenerated: payload.aiGenerated ?? false,
    ...(payload.mediaType ? {
      mediaType: payload.mediaType,
      mediaUrl: payload.mediaUrl,
      mediaMime: payload.mediaMime,
      mediaName: payload.mediaName,
    } : {}),
  },
})
```

DEPOIS:
```typescript
const savedMessage = await db.message.create({
  data: {
    conversationId: conversation.id,
    workspaceId: channel.workspaceId,
    direction: payload.direction,
    content: payload.content,
    externalId: payload.externalId || undefined,
    status: payload.direction === 'OUTBOUND' ? 'SENT' : 'DELIVERED',
    senderName: payload.senderName ?? null,
    sentAt: new Date(payload.sentAt),
    aiGenerated: payload.aiGenerated ?? false,
    ...(payload.mediaType ? {
      mediaType: payload.mediaType,
      mediaUrl: payload.mediaUrl,
      mediaMime: payload.mediaMime,
      mediaName: payload.mediaName,
    } : {}),
  },
  include: {
    sentBy: { select: { id: true, name: true, avatarUrl: true } },
  },
})
```

**Por que:** O shape do objeto `savedMessage` deve ser idêntico ao que o GET endpoint retorna
e ao que o POST outbound envia. Sem `include`, o campo `sentBy` não existe no objeto (nem como null).
Com `include`, `sentBy` será `null` (mensagens inbound não têm sentBy) — consistente com o GET.

**Edge case:** Mensagens inbound nunca têm `sentById`, então `sentBy` será sempre `null`. Mas
a presença do campo `null` vs ausência do campo `undefined` pode importar em comparações de shape.

### Fix 2: Adicionar `include: { sentBy }` no STEP 2 — Dedup branch

**Arquivo:** `lib/queue/message-ingest-logic.ts`
**Localização:** STEP 2, ~linha 46

ANTES:
```typescript
const fullMessage = await db.message.findUnique({ where: { id: existing.id } })
```

DEPOIS:
```typescript
const fullMessage = await db.message.findUnique({
  where: { id: existing.id },
  include: {
    sentBy: { select: { id: true, name: true, avatarUrl: true } },
  },
})
```

**Por que:** Na branch de dedup, se a mensagem já existe no DB, o worker re-envia via Pusher
para garantir que o frontend recebeu. O payload deve ter o mesmo shape.

**Edge case:** Se o `existing.id` for de uma mensagem OUTBOUND que foi deduplicada (raro mas
possível com sync fallback), o `sentBy` será um user object, não null. Isso é correto — o
frontend já lida com ambos os casos.

### Fix 3: Adicionar handler `history-message` no InboxPage

**Arquivo:** `app/[workspaceSlug]/inbox/page.tsx`
**Localização:** ~linha 101, dentro do `usePusherChannel`

ANTES:
```typescript
usePusherChannel(`workspace-${workspaceId}`, {
  'new-message': (data: unknown) => {
    fetchConversations()
    window.dispatchEvent(new CustomEvent('new-message', { detail: data }))
  },
  'message-sent': (data: unknown) => {
    fetchConversations()
    window.dispatchEvent(new CustomEvent('message-sent', { detail: data }))
  },
  'conversation-assigned': () => {
    fetchConversations()
  },
  'conversation-updated': (data: unknown) => {
    fetchConversations()
    window.dispatchEvent(new CustomEvent('conversation-updated', { detail: data }))
  },
})
```

DEPOIS:
```typescript
usePusherChannel(`workspace-${workspaceId}`, {
  'new-message': (data: unknown) => {
    fetchConversations()
    window.dispatchEvent(new CustomEvent('new-message', { detail: data }))
  },
  'history-message': (data: unknown) => {
    fetchConversations()
    window.dispatchEvent(new CustomEvent('new-message', { detail: data }))
  },
  'message-sent': (data: unknown) => {
    fetchConversations()
    window.dispatchEvent(new CustomEvent('message-sent', { detail: data }))
  },
  'conversation-assigned': () => {
    fetchConversations()
  },
  'conversation-updated': (data: unknown) => {
    fetchConversations()
    window.dispatchEvent(new CustomEvent('conversation-updated', { detail: data }))
  },
})
```

**Por que:** O `history-message` é emitido pelo worker quando `isHistory=true` (sync de histórico
UazAPI) ou na branch de dedup para mensagens de history. Sem handler, essas mensagens são
invisíveis no thread aberto. Re-emitimos como `new-message` no window para que o MessageThread
capte — ele já tem dedup por `message.id` para evitar duplicatas.

**Edge case:** Se o frontend já tiver a mensagem (do fetch inicial), o `handleNewMessage` do
MessageThread faz `if (prev.find(m => m.id === message.id)) return prev` — skip. Sem duplicata.

### Fix 4 (OPCIONAL): Adicionar `history-message` handler no funil page

**Arquivo:** `app/[workspaceSlug]/funil/page.tsx`
**Localização:** ~linha 89

O funil page NÃO escuta `new-message` nem `message-sent`. Se o funil tiver um MessageThread
embutido, as mensagens inbound não aparecerão em tempo real ali também. Verificar se o funil
usa MessageThread e, se sim, adicionar os mesmos handlers.

VERIFICAR ANTES DE IMPLEMENTAR:
```bash
grep -n "MessageThread\|new-message\|message-sent" app/\[workspaceSlug\]/funil/page.tsx
```

Se não usar MessageThread, pular este fix.

---

## Edge cases detalhados

### 1. Race condition: Pusher chega antes do fetch inicial
**Cenário:** Usuário abre uma conversa. O GET `/messages` está em andamento. Enquanto isso,
uma mensagem inbound chega via Pusher.
**Comportamento:** O `handleNewMessage` adiciona ao state. Quando o fetch completa, `setMessages(data.messages)`
SOBRESCREVE o state, incluindo a mensagem do Pusher. Mas o fetch retorna dados do DB que já incluem
a mensagem nova (o worker já salvou). Resultado: mensagem aparece corretamente.
**Risco:** Se o fetch estava em cache e retorna dados antigos → mensagem desaparece até próximo
evento. Isso é improvável porque o fetch não usa cache.

### 2. Race condition: Dois workers processando a mesma mensagem
**Cenário:** QStash retry + fallback síncrono processam a mesma mensagem.
**Comportamento:** Primeiro worker cria a mensagem, envia Pusher. Segundo worker encontra duplicate
(STEP 2), re-envia Pusher com `fullMessage`. Frontend recebe 2 Pusher events com o mesmo `message.id`.
**Proteção:** `handleNewMessage` faz `if (prev.find(m => m.id === message.id)) return prev`.
Segunda mensagem é ignorada. **Safe.**

### 3. Pusher event payload > 10KB
**Cenário:** Mensagem com content muito longo + mediaUrl longo.
**Comportamento:** Pusher silenciosamente descarta o evento se > 10KB.
**Mitigação:** Content típico < 1KB, URLs < 500 bytes. Total < 3KB. Baixo risco.
**Se for problema futuro:** Enviar apenas `{ conversationId, messageId }` e fazer fetch no frontend.

### 4. workspaceId undefined no primeiro render
**Cenário:** `session` ainda não carregou, `workspaceId` é undefined.
**Comportamento:** `channelName` = `"workspace-undefined"` → Pusher subscreve canal inexistente.
Quando session carrega, `channelName` muda → hook resubscreve corretamente.
**Risco:** Eventos entre o primeiro render e o carregamento do session são perdidos. Janela ~100-500ms.
**Mitigação:** Improvável que uma mensagem chegue nessa janela exata. Se chegar, aparece no
próximo fetch ou ao reclicar a conversa.

### 5. Mensagem outbound via worker (webhook echo)
**Cenário:** Usuário envia mensagem do CRM. O provider (WhatsApp) faz echo no webhook. O webhook
publica no QStash. O worker processa como mensagem regular.
**Comportamento:** O POST endpoint já criou a mensagem com o mesmo `externalId`. O worker encontra
duplicate (STEP 2) e re-envia Pusher. Frontend já tem a mensagem (via optimistic + POST response).
Dedup no `handleNewMessage` previne duplicata.
**Risco:** Nenhum. **Safe.**

### 6. Múltiplas abas abertas no mesmo workspace
**Cenário:** Usuário tem 2 abas do CRM abertas na mesma conversa.
**Comportamento:** Ambas subscrevem o mesmo canal Pusher. Ambas recebem o evento. Ambas
adicionam a mensagem ao state. Cada aba funciona independentemente.
**Risco:** Nenhum. **Safe.**

### 7. `history-message` em volume alto (sync inicial)
**Cenário:** UazAPI sync envia centenas de mensagens de histórico de uma vez.
**Comportamento:** Com o novo handler, cada `history-message` dispara `fetchConversations()` +
adiciona ao MessageThread state. Centenas de fetches simultâneos.
**Mitigação:** `fetchConversations` deveria ter debounce, mas atualmente não tem. Para o fix atual,
isso não é um problema novo — `new-message` já teria o mesmo comportamento para mensagens em batch.
Se for performance issue no futuro, adicionar debounce ao `fetchConversations`.

### 8. Erro no render de uma mensagem
**Cenário:** O objeto do worker tem um campo inesperado ou formato diferente que causa erro
no `format(new Date(msg.createdAt), ...)` ou em outro lugar do render.
**Comportamento:** Sem Error Boundary, React pode falhar silenciosamente para aquela mensagem
ou crashar o componente inteiro.
**Proteção:** O Prisma `createdAt` é sempre um Date válido → serializa para ISO string válida →
`new Date()` e `format()` funcionam. Campos extras no objeto são ignorados pelo render.
**Teste:** Verificar browser console (F12) após o fix para confirmar zero erros.

---

## Testes por fase

### Fase 1: Após Fix 1 e Fix 2 (include sentBy no worker)

**Teste 1.1 — Mensagem inbound aparece no thread em tempo real**
1. Abrir o CRM, selecionar uma conversa existente
2. Enviar uma mensagem do celular externo para o WhatsApp do negócio
3. A mensagem DEVE aparecer no painel direito em <3s SEM recarregar
4. A sidebar esquerda DEVE atualizar o preview

**Teste 1.2 — Shape do objeto message**
1. Abrir DevTools (F12) → Console
2. Adicionar temporariamente `console.log('[DEBUG] new-message', data)` no handler do InboxPage
3. Enviar mensagem inbound
4. Verificar no console que o objeto `data.message` contém:
   - `id` (string, UUID)
   - `createdAt` (string, ISO)
   - `direction` ("INBOUND")
   - `content` (string)
   - `isSystem` (boolean, false)
   - `sentBy` (null)
   - `senderName` (string ou null)

**Teste 1.3 — Dedup não duplica mensagens no thread**
1. Abrir uma conversa
2. Enviar a mesma mensagem 2x rapidamente do celular
3. Apenas 1 mensagem deve aparecer no thread (QStash dedup previne o segundo job)
4. Se QStash não deduplicar (externalIds diferentes), 2 mensagens aparecem (correto)

**Teste 1.4 — Mensagem outbound ainda funciona**
1. Abrir uma conversa
2. Enviar mensagem do CRM (digitar e enviar)
3. Mensagem deve aparecer imediatamente (optimistic) e depois confirmar
4. Verificar que não há duplicatas

**Teste 1.5 — Mensagem com mídia**
1. Enviar imagem/áudio/documento do celular para o WhatsApp
2. A mensagem deve aparecer no thread com o tipo de mídia correto
3. Se for áudio, o player deve renderizar (mesmo sem mediaUrl ainda — será atualizado via media-persist)

### Fase 2: Após Fix 3 (history-message handler)

**Teste 2.1 — History sync aparece no thread**
1. Desconectar e reconectar o WhatsApp UazAPI
2. O UazAPI faz sync de mensagens recentes com `isHistory: true`
3. Se uma conversa estiver aberta durante o sync, as mensagens devem aparecer no thread
4. A sidebar deve atualizar os previews

**Teste 2.2 — Dedup de history messages**
1. Com uma conversa aberta que já tem mensagens carregadas
2. Trigger history sync
3. Mensagens que já existem no thread NÃO devem duplicar
   (o `handleNewMessage` faz check por `message.id`)

**Teste 2.3 — History message NÃO incrementa unread badge**
1. Abrir uma conversa diferente da que recebe history
2. Verificar se o unread count na sidebar não incrementa para history messages
   (depende do backend — o worker faz `unreadCount: { increment: 1 }` apenas para INBOUND)
   History messages normalmente são INBOUND, então o badge VAI incrementar.
   Isso é comportamento existente, não introduzido pelo fix.

### Fase 3: Testes de regressão

**Teste 3.1 — Browser console limpo**
1. Abrir DevTools (F12) → Console
2. Navegar pelo CRM: inbox, funil, conversas
3. Enviar e receber mensagens
4. Verificar ZERO erros no console (especialmente React rendering errors)

**Teste 3.2 — Múltiplas conversas**
1. Abrir conversa A
2. Enviar mensagem inbound para conversa B (diferente)
3. Conversa A thread NÃO deve mostrar a mensagem (check `cid === conversationId`)
4. Sidebar deve mostrar update em conversa B
5. Clicar em conversa B → mensagem deve estar lá (carregada via GET)

**Teste 3.3 — Trocar de conversa durante envio**
1. Abrir conversa A
2. Enviar mensagem inbound para conversa A
3. Rapidamente trocar para conversa B antes de Pusher chegar
4. Voltar para conversa A → mensagem deve estar lá (via GET fetch)
5. Conversa B NÃO deve ter a mensagem

**Teste 3.4 — Mensagem com conteúdo vazio (mídia sem caption)**
1. Enviar apenas uma imagem sem texto do celular
2. A mensagem deve aparecer com `content: "[image]"` (ou similar)
   (Fix anterior já garante content placeholder)

**Teste 3.5 — Read receipts e transcriptions**
1. Enviar áudio do celular
2. Mensagem de áudio deve aparecer no thread
3. Após processamento do worker de transcription, a transcription deve atualizar
   via Pusher event `message-updated`
4. Verificar que `message-updated` continua funcionando após as mudanças

**Teste 3.6 — Performance com muitas mensagens**
1. Abrir conversa com 50+ mensagens
2. Enviar mensagem inbound
3. Scroll deve auto-rolar para baixo (`bottomRef.current?.scrollIntoView`)
4. Não deve haver lag perceptível na UI

---

## Checklist final

- [ ] Fix 1: `include: { sentBy }` no `db.message.create()` (STEP 6)
- [ ] Fix 2: `include: { sentBy }` no `db.message.findUnique()` (STEP 2 dedup)
- [ ] Fix 3: Handler `history-message` no InboxPage
- [ ] Fix 4: Verificar se funil page precisa do mesmo handler (grep antes)
- [ ] Testes Fase 1 (1.1–1.5) passam
- [ ] Testes Fase 2 (2.1–2.3) passam
- [ ] Testes Fase 3 (3.1–3.6) passam — regressão
- [ ] Deploy na Vercel
- [ ] Verificar browser console limpo em produção
- [ ] Remover console.log de debug (se adicionado para teste)
