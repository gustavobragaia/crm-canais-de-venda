# Plano: Correção completa — Facebook Messenger + Instagram DM no CRM

## Contexto

**Sintoma:** Mensagens enviadas/recebidas pela página do Facebook NÃO aparecem no CRM. Enviar pelo CRM funciona. Nome e foto nunca atualizam. Instagram DM tem o mesmo potencial de falha.

**Causa raiz:** 3 bugs simultâneos no código + possível configuração incompleta no Meta Dashboard.

---

# ETAPAS DE CORREÇÃO

## Etapa 1: Tornar `subscribePageToWebhooks` blocking e retornar status

**Arquivo:** `app/api/meta/connect/route.ts` — linhas 121-136

**Problema:** Page subscription é fire-and-forget. Se falhar, canal salva como "conectado" mas a Page nunca recebe webhooks. Usuário acha que conectou mas mensagens não chegam.

**Fix:**
```ts
// ANTES (linhas 121-124):
subscribePageToWebhooks(selected.id, selected.access_token).catch((err) => {
  console.warn('[META CONNECT] Webhook subscription failed (non-blocking):', err)
})

return NextResponse.json({
  step: 'done',
  channel: { id, type, name, pageId, pageName, businessAccountId },
})

// DEPOIS:
let webhookWarning: string | undefined
try {
  await subscribePageToWebhooks(selected.id, selected.access_token)
} catch (err) {
  webhookWarning = 'Inscrição de webhook falhou. Mensagens recebidas podem não aparecer. Reconecte o canal ou verifique as permissões no Meta Dashboard.'
  console.error('[META CONNECT] Webhook subscription FAILED:', err)
}

return NextResponse.json({
  step: 'done',
  channel: { id, type, name, pageId, pageName, businessAccountId },
  ...(webhookWarning ? { warning: webhookWarning } : {}),
})
```

**Edge cases & falhas:**
- EC-1A: Token sem permissão `pages_manage_metadata` → subscription retorna 403 → warning aparece ao usuário
- EC-1B: Page ID inválido → subscription retorna 400 → warning
- EC-1C: Timeout de rede (10s) → `fetchWithTimeout` aborta → catch captura → warning
- EC-1D: Meta API instável → 500 → warning (canal funciona para envio, mas não recebe)
- EC-1E: Subscription retorna `{ success: false }` → throw na função → warning

**Frontend:** Mostrar warning no settings page quando response contém `warning`. O frontend no `handleConnect` (settings/page.tsx ~240) deve exibir toast ou alert com o `data.warning` se presente.

```ts
// Em settings/page.tsx, após step === 'done':
if (data.warning) {
  alert(data.warning) // ou toast
}
```

---

## Etapa 2: Corrigir campos de profile para Messenger PSIDs

**Arquivo:** `lib/integrations/meta-common.ts` — linhas 43-67

**Problema:** Para Facebook Messenger, o código pede `name,profile_pic`. Mas PSIDs (Page-Scoped IDs) do Messenger suportam `first_name,last_name,profile_pic` — NÃO `name`. O campo `name` pode não existir para PSIDs, causando erro silencioso ou nome genérico.

**Fix:**
```ts
// ANTES (linhas 48-51):
const fields =
  channelType === 'INSTAGRAM'
    ? 'name,username,profile_picture_url'
    : 'name,profile_pic'

// DEPOIS:
const fields =
  channelType === 'INSTAGRAM'
    ? 'name,username,profile_picture_url'
    : 'first_name,last_name,profile_pic'
```

```ts
// ANTES (linhas 61-62):
const name: string =
  data.name ?? data.username ?? `${channelType === 'INSTAGRAM' ? 'Instagram' : 'Facebook'} User`

// DEPOIS:
let name: string
if (channelType === 'FACEBOOK') {
  const parts = [data.first_name, data.last_name].filter(Boolean)
  name = parts.length > 0 ? parts.join(' ') : 'Facebook User'
} else {
  name = data.name ?? data.username ?? 'Instagram User'
}
```

**Edge cases & falhas:**
- EC-2A: PSID sem `first_name` (privacidade do usuário) → fallback para "Facebook User"
- EC-2B: PSID com apenas `first_name` (sem last) → nome mostra só primeiro nome (correto)
- EC-2C: Token expirado → 401 da Graph API → throw → catch no webhook (ver Etapa 3)
- EC-2D: Rate limit (200 req/hora por PSID) → 429 → throw → catch
- EC-2E: PSID de guest user (sem perfil público) → campos vazios → fallback

---

## Etapa 3: Logar erros de profile fetch (em vez de silenciar)

**Arquivos:**
- `app/api/webhooks/facebook/route.ts` — linha 105
- `app/api/webhooks/instagram/route.ts` — similar

**Problema:** `.catch(() => {})` engole TODOS os erros. Se profile fetch falha, nenhum log, nenhuma informação para debug.

**Fix:**
```ts
// ANTES (facebook/route.ts linha 105):
.catch(() => {})

// DEPOIS:
.catch((err) => console.error('[FB WEBHOOK] Profile fetch failed for', senderId, ':', err?.message ?? err))
```

```ts
// ANTES (instagram/route.ts):
.catch(() => {})

// DEPOIS:
.catch((err) => console.error('[IG WEBHOOK] Profile fetch failed for', senderId, ':', err?.message ?? err))
```

**Edge cases & falhas:**
- EC-3A: Rate limit → agora logado, visível no Vercel Logs
- EC-3B: Token expirado → logado, indica necessidade de reconexão
- EC-3C: PSID inválido → logado, útil para debug
- EC-3D: Network timeout → logado com detalhes

---

## Etapa 4: Adicionar log de debug no webhook handler

**Arquivo:** `app/api/webhooks/facebook/route.ts` — início do POST handler

**Problema:** Se o webhook está recebendo payloads mas algo falha silenciosamente (channel lookup, billing gate, etc.), não há visibilidade.

**Fix:** Adicionar logs de debug em pontos-chave:
```ts
export async function POST(req: NextRequest) {
  try {
    const payload = await req.json() as FacebookWebhookPayload

    console.log('[FB WEBHOOK] Received:', payload.object, 'entries:', payload.entry?.length ?? 0)

    if (payload.object === 'page') {
      for (const entry of payload.entry) {
        const channel = await db.channel.findFirst({
          where: { pageId: entry.id, type: 'FACEBOOK', isActive: true },
        })
        if (!channel) {
          console.warn('[FB WEBHOOK] No channel found for pageId:', entry.id)
          continue
        }
        // ... resto do handler
```

**Mesma coisa para Instagram:**
```ts
if (!channel) {
  console.warn('[IG WEBHOOK] No channel found for entry.id:', entry.id)
  continue
}
```

**Edge cases & falhas:**
- EC-4A: `entry.id` não corresponde a nenhum `channel.pageId` no DB → agora logado com o pageId para debug
- EC-4B: `payload.object !== 'page'` → payload ignorado, agora visível no log
- EC-4C: `entry.messaging` undefined → crash silencioso → considerar `entry.messaging ?? []`
- EC-4D: Billing gate rejeita → `canCreateConversation` retorna false → considerar logar

---

## Etapa 5: Frontend — mostrar warning de webhook no connect

**Arquivo:** `app/[workspaceSlug]/settings/page.tsx` — ~linha 240 (handler de connect)

**Fix:** Após receber `step: 'done'` do backend, verificar se há `warning` no response:

```ts
// ANTES:
} else {
  setConnectingStatus((s) => ({ ...s, [ct]: 'done' }))
  refreshChannels()
  setTimeout(() => setConnectingStatus((s) => ({ ...s, [ct]: 'idle' })), 3000)
}

// DEPOIS:
} else {
  if (data.warning) {
    alert(`⚠️ Canal conectado com aviso: ${data.warning}`)
  }
  setConnectingStatus((s) => ({ ...s, [ct]: 'done' }))
  refreshChannels()
  setTimeout(() => setConnectingStatus((s) => ({ ...s, [ct]: 'idle' })), 3000)
}
```

**Repetir** no handler `handleMetaPageSelect` (linha ~260) que é o mesmo fluxo para seleção de página.

**Edge cases:**
- EC-5A: Warning nulo → não mostra nada (correto)
- EC-5B: Warning presente → alert exibido ANTES de marcar como done → usuário sabe que precisa verificar Dashboard

---

## Etapa 6: Garantir que `subscribePageToWebhooks` inscreve campos corretos

**Arquivo:** `lib/integrations/meta-common.ts` — linha 19

**Atual:** Inscreve apenas `messages`. Para completude e robustez, inscrever `messages,messaging_postbacks`:

```ts
// ANTES:
const url = `${GRAPH_URL}/${pageId}/subscribed_apps?subscribed_fields=messages&access_token=${accessToken}`

// DEPOIS:
const url = `${GRAPH_URL}/${pageId}/subscribed_apps?subscribed_fields=messages,messaging_postbacks&access_token=${accessToken}`
```

**Edge cases:**
- EC-6A: `messaging_postbacks` não autorizado → subscription falha inteira? NÃO — Meta aceita campos parciais se a app tem permissão
- EC-6B: Permissão faltando → se `pages_messaging` não está aprovada, subscription falha → capturado pela Etapa 1

---

## Checklist Meta Dashboard (manual)

Sem essas configurações, NENHUM webhook será entregue mesmo com código perfeito:

- [ ] **Messenger Product** adicionado ao app 929289166178166
- [ ] **Messenger > Settings > Webhooks** configurado:
  - Callback URL: `https://SEU_DOMINIO/api/webhooks/facebook`
  - Verify token: `closiocrm_webhook_secreta_2024`
- [ ] **Campos webhook inscritos:** `messages`, `messaging_postbacks`
- [ ] **Instagram Product** (Instagram Graph API) adicionado ao app
- [ ] **Instagram > Settings > Webhooks** configurado:
  - Callback URL: `https://SEU_DOMINIO/api/webhooks/instagram`
  - Verify token: `closiocrm_webhook_secreta_2024`
- [ ] **Campos webhook inscritos:** `messages`
- [ ] **Advanced Access** aprovado para: `pages_messaging`, `instagram_manage_messages`
- [ ] **Testador:** Adicionar conta de teste como Tester no app (se Advanced Access pendente)

---

## Resumo dos arquivos a modificar

| # | Arquivo | Mudança |
|---|---------|---------|
| 1 | `app/api/meta/connect/route.ts` | `subscribePageToWebhooks` blocking + retornar warning |
| 2 | `lib/integrations/meta-common.ts:19` | Adicionar `messaging_postbacks` nos campos subscription |
| 3 | `lib/integrations/meta-common.ts:48-66` | Fields: `first_name,last_name,profile_pic` + construir nome |
| 4 | `app/api/webhooks/facebook/route.ts:105` | Logar erros de profile fetch |
| 5 | `app/api/webhooks/facebook/route.ts:42` | Adicionar logs de debug |
| 6 | `app/api/webhooks/instagram/route.ts` | Mesmos fixes 4+5 para Instagram |
| 7 | `app/[workspaceSlug]/settings/page.tsx:~240` | Mostrar warning ao conectar |

---

## Verificação

1. Reconectar canal Facebook nas settings → verificar que webhook subscription NÃO falha → sem warning
2. Enviar DM para a Page via Messenger pessoal → mensagem aparece no CRM
3. Verificar logs: `[FB WEBHOOK] Received: page entries: 1` → confirma que webhook está recebendo
4. Conversa mostra nome real + foto (não "Facebook User XXXXXX")
5. Repetir para Instagram
6. Se webhook subscription falha → warning aparece → verificar Dashboard
