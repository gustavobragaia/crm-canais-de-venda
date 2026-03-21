# Plano: Integração Instagram Direct + Facebook Messenger na Inbox Unificada

## Contexto

O CRM já tem WhatsApp (UazAPI) funcionando 100%. O backend para Instagram/Facebook está ~70% pronto (schema, webhook handlers, send functions, Meta OAuth route), mas a UI mostra "Em breve" e faltam peças críticas. Ambos os canais usam **Facebook Login** (mesmo OAuth flow), então serão implementados juntos.

**Decisões:**
- Auth: Facebook Login (Instagram Business Account vinculada a Facebook Page)
- Escopo: Instagram + Facebook juntos (mesmo flow OAuth)
- Abordagem: Texto primeiro, depois media
- WhatsApp Business API oficial: será implementado separadamente após aprovação da Meta (para uso no disparador do agente de IA)

---

## Fase 1: Fix Verify Token + API Version

### 1.1 Trocar `WHATSAPP_VERIFY_TOKEN` por `META_VERIFY_TOKEN`

**Arquivos:**
- `app/api/webhooks/instagram/route.ts` (linha 13)
- `app/api/webhooks/facebook/route.ts` (linha 13)

```ts
token === (process.env.META_VERIFY_TOKEN ?? process.env.WHATSAPP_VERIFY_TOKEN)
```

### 1.2 Atualizar API version de `v18.0` para `v21.0`

**Arquivos:**
- `lib/integrations/instagram.ts` (linha 1)
- `lib/integrations/facebook.ts` (linha 1)
- `app/api/meta/connect/route.ts` (linha 6)

### Testes & Edge Cases — Fase 1

- [ ] **T1.1** Verificar que `META_VERIFY_TOKEN` funciona no GET de ambos webhooks: `curl "localhost:3000/api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=TOKEN&hub.challenge=test123"` → deve retornar `test123` com status 200
- [ ] **T1.2** Verificar fallback: se `META_VERIFY_TOKEN` não estiver definida, `WHATSAPP_VERIFY_TOKEN` ainda funciona
- [ ] **T1.3** Verificar que token errado retorna 403
- [ ] **T1.4** Confirmar que `v21.0` aparece em todos os 3 arquivos (grep `v21.0` nos arquivos alterados)
- [ ] **T1.5** Edge case: se nenhuma env var de verify token estiver definida, webhook rejeita (não crash)

---

## Fase 2: Criar `lib/integrations/meta-common.ts`

Funções compartilhadas:

```ts
// Subscrever página aos webhooks de messaging
export async function subscribePageToWebhooks(pageId: string, accessToken: string): Promise<void>
// POST /{page-id}/subscribed_apps?subscribed_fields=messages&access_token={token}

// Buscar Instagram Business Account ID vinculado à página
export async function getInstagramBusinessAccountId(pageId: string, accessToken: string): Promise<string | null>
// GET /{page-id}?fields=instagram_business_account&access_token={token}

// Baixar mídia do CDN do Meta
export async function downloadMetaMedia(url: string, accessToken: string): Promise<{ buffer: Buffer; contentType: string }>

// Buscar perfil do usuário (nome, foto) — fire-and-forget
export async function fetchMetaUserProfile(
  userId: string, accessToken: string, channelType: 'INSTAGRAM' | 'FACEBOOK'
): Promise<{ name: string; photoUrl?: string }>
// Instagram: GET /{user-id}?fields=name,username,profile_picture_url
// Facebook: GET /{user-id}?fields=name,profile_pic
```

### Testes & Edge Cases — Fase 2

- [ ] **T2.1** `subscribePageToWebhooks`: deve fazer POST correto ao Meta Graph API e não lançar erro em resposta 200
- [ ] **T2.2** `subscribePageToWebhooks`: se o Meta retornar erro (token expirado, page não existe), deve lançar Error com mensagem descritiva
- [ ] **T2.3** `getInstagramBusinessAccountId`: deve retornar string do ID quando a page tem IG vinculado
- [ ] **T2.4** `getInstagramBusinessAccountId`: deve retornar `null` quando a page NÃO tem IG vinculado (não crash)
- [ ] **T2.5** `fetchMetaUserProfile`: deve retornar `{ name, photoUrl }` para Instagram (fields corretos)
- [ ] **T2.6** `fetchMetaUserProfile`: deve retornar `{ name, photoUrl }` para Facebook (fields diferentes)
- [ ] **T2.7** `fetchMetaUserProfile`: se o Meta retornar erro (user bloqueou, conta deletada), deve lançar erro silenciosamente (não crashar o webhook)
- [ ] **T2.8** `downloadMetaMedia`: deve appendar `access_token` na URL e retornar buffer + contentType do header
- [ ] **T2.9** `downloadMetaMedia`: se URL expirada (Meta CDN ~15min TTL), deve lançar erro descritivo
- [ ] **T2.10** Edge case: todos os helpers devem ter timeout (10s) para não travar o webhook

---

## Fase 3: OAuth Flow Frontend + Callback

### 3.1 Criar `/app/api/meta/callback/route.ts` (GET) — NOVO

OAuth callback que recebe redirect do Meta:
1. Extrai `code` e `state` (channelType) dos query params
2. Retorna HTML mínimo: `window.opener.postMessage({ code, state })` + fecha popup

### 3.2 Atualizar `/app/api/meta/connect/route.ts`

Após criar/atualizar channel (linha 101):
1. Chamar `subscribePageToWebhooks(pageId, accessToken)` — sem bloquear response em caso de falha
2. Se `channelType === 'INSTAGRAM'`: buscar e salvar `businessAccountId` via `getInstagramBusinessAccountId()`

### 3.3 Ativar conexão na Settings Page

**Arquivo:** `app/[workspaceSlug]/settings/page.tsx` (linhas 594-618)

Remover "Em breve" + `opacity-60`. Implementar:

1. **Botão "Conectar Instagram" / "Conectar Facebook"** → abre popup para:
   ```
   https://www.facebook.com/v21.0/dialog/oauth
     ?client_id={META_APP_ID}
     &redirect_uri={NEXTAUTH_URL}/api/meta/callback
     &scope=instagram_basic,instagram_manage_messages,pages_messaging,pages_manage_metadata,pages_show_list
     &state={channelType}
   ```
   (Mesmo scope para ambos — o Meta ignora scopes que não se aplicam)

2. **Listener** `window.addEventListener('message', ...)` recebe `{ code, state }`
3. **Chama** `POST /api/meta/connect` com `{ code, channelType }`
4. **Se** `step: 'select'` → modal com lista de páginas para seleção
5. **Se** `step: 'done'` → refresh, mostrar canal conectado

### 3.4 Exibir canais conectados

Para cada canal Instagram/Facebook conectado, mostrar:
- Ícone + nome da página + badge "Conectado"
- Botão desconectar

Reutilizar dados de `GET /api/channels` (já retorna `type`, `pageName`, `isActive`).

### Testes & Edge Cases — Fase 3

- [ ] **T3.1** Callback route: `GET /api/meta/callback?code=abc&state=INSTAGRAM` retorna HTML válido com `postMessage`
- [ ] **T3.2** Callback route: sem `code` param → retorna HTML com mensagem de erro (não crash)
- [ ] **T3.3** Callback route: `state` deve ser `INSTAGRAM` ou `FACEBOOK` — outros valores devem ser rejeitados
- [ ] **T3.4** OAuth popup: deve abrir em nova janela (não navegar fora da settings page)
- [ ] **T3.5** OAuth popup: se usuário fechar popup sem autorizar → nada acontece (listener não recebe message, nenhum erro visível)
- [ ] **T3.6** OAuth popup: se `META_APP_ID` ou `NEXT_PUBLIC_META_APP_ID` não definida → botão desabilitado ou mensagem de erro
- [ ] **T3.7** Meta connect: se usuário tem 1 página → auto-seleciona (step: 'done' direto)? Ou sempre mostra seleção? (Hoje sempre retorna `step: 'select'` se não tem `selectedId`)
- [ ] **T3.8** Meta connect: se usuário não tem nenhuma página → exibe erro "Nenhuma página encontrada"
- [ ] **T3.9** Meta connect: se `code` expirado (Meta codes expiram em ~10min) → erro claro ao usuário
- [ ] **T3.10** Meta connect: se canal já existe (reconexão) → atualiza token ao invés de criar duplicata
- [ ] **T3.11** `subscribePageToWebhooks` falha → canal é criado mesmo assim (webhook subscription não deve bloquear), mas loggar warning
- [ ] **T3.12** Para Instagram: `businessAccountId` deve ser salvo no channel. Se não encontrar IG vinculado → warning mas canal é criado
- [ ] **T3.13** Settings UI: canal conectado mostra nome da página, ícone correto (Instagram rosa, Facebook azul)
- [ ] **T3.14** Settings UI: múltiplos canais do mesmo tipo? Definir se permite ou bloqueia (hoje `findFirst` pega o primeiro)
- [ ] **T3.15** Edge case: `postMessage` de origem maliciosa → verificar `event.origin` antes de processar
- [ ] **T3.16** Edge case: token da página expira (~60 dias para long-lived) → log de erro no envio, mas não crashar

---

## Fase 4: Fix Webhook Handlers

### 4.1 Instagram — fix channel lookup

**Arquivo:** `app/api/webhooks/instagram/route.ts` (linha 25-27)

Meta envia `entry.id` = Instagram Business Account ID. Atualizar:
```ts
const channel = await db.channel.findFirst({
  where: {
    OR: [
      { businessAccountId: entry.id, type: 'INSTAGRAM' },
      { pageId: entry.id, type: 'INSTAGRAM' },
    ],
  },
})
```

### 4.2 Suportar attachments (ambos webhooks)

**Arquivos:**
- `app/api/webhooks/instagram/route.ts` (linha 31)
- `app/api/webhooks/facebook/route.ts` (linha 31)

Mudar guard:
```ts
if (!messaging.message?.text && !messaging.message?.attachments?.length) continue
```

Quando tem attachment:
1. Extrair tipo e URL de `messaging.message.attachments[0]`
2. Mapear tipo: `image` → `image`, `video` → `video`, `audio` → `audio`, `file` → `document`
3. Baixar do CDN do Meta (URL temporária, precisa access_token)
4. Upload para Vercel Blob
5. Salvar `mediaType`, `mediaUrl`, `mediaMime` na message
6. Content = texto se houver, senão placeholder `[Imagem]`, `[Vídeo]`, etc.

### 4.3 Resolução de nome do contato (fire-and-forget)

Após criar nova conversation (quando `!existingConv`), fazer async:
```ts
fetchMetaUserProfile(senderId, decrypt(channel.accessToken!), channel.type as 'INSTAGRAM' | 'FACEBOOK')
  .then(profile => db.conversation.update({
    where: { id: conversation.id },
    data: { contactName: profile.name, contactPhotoUrl: profile.photoUrl }
  }))
  .catch(() => {}) // silencioso — não bloqueia o webhook
```

### Testes & Edge Cases — Fase 4

**Webhook Instagram:**
- [ ] **T4.1** Mensagem de texto chega → conversation criada com `contactName`, message com `content`, Pusher triggered
- [ ] **T4.2** Channel lookup: `entry.id` = `businessAccountId` → encontra channel correto
- [ ] **T4.3** Channel lookup: `entry.id` = `pageId` (fallback) → encontra channel correto
- [ ] **T4.4** Channel lookup: nenhum match → skip silencioso (retorna 200 ao Meta para não retrigger)
- [ ] **T4.5** Mensagem duplicada (mesmo `mid`) → skip, não cria duplicata no DB
- [ ] **T4.6** Billing gate: `canCreateConversation` retorna false → skip, não cria conversation

**Webhook Facebook:**
- [ ] **T4.7** Mensagem de texto no Messenger → conversation criada, message salva, Pusher triggered
- [ ] **T4.8** `payload.object === 'page'` → processa. Outros objects → ignora

**Attachments (ambos):**
- [ ] **T4.9** Mensagem com imagem (attachment type=image) → baixa, upload Blob, salva como `mediaType: 'image'`
- [ ] **T4.10** Mensagem com vídeo → `mediaType: 'video'`
- [ ] **T4.11** Mensagem com áudio → `mediaType: 'audio'`
- [ ] **T4.12** Mensagem com arquivo/PDF → `mediaType: 'document'`
- [ ] **T4.13** Mensagem com texto + attachment → salva AMBOS (content = texto, media fields preenchidos)
- [ ] **T4.14** Mensagem só com attachment (sem texto) → content = `[Imagem]`/`[Vídeo]`/etc, lastMessagePreview = mesmo
- [ ] **T4.15** Múltiplos attachments → processar apenas o primeiro (Meta envia array mas geralmente 1)
- [ ] **T4.16** Edge case: URL do CDN Meta expirada durante download → log erro, salvar mensagem sem mídia (não perder o texto)
- [ ] **T4.17** Edge case: upload pro Vercel Blob falha → log erro, salvar mensagem sem mídia
- [ ] **T4.18** Edge case: attachment sem URL (type=`fallback`, sticker compartilhado) → tratar gracefully

**Resolução de nome:**
- [ ] **T4.19** Nova conversation → fire-and-forget fetch de perfil → atualiza `contactName` e `contactPhotoUrl`
- [ ] **T4.20** Conversation já existe → NÃO refetch perfil (evitar overhead)
- [ ] **T4.21** Fetch perfil falha (user bloqueou, conta deletada) → mantém nome genérico, não crashar
- [ ] **T4.22** Edge case: `channel.accessToken` é null → skip perfil fetch sem crash

**Geral:**
- [ ] **T4.23** Webhook SEMPRE retorna 200 ao Meta (mesmo com erros internos) — Meta re-envia se receber != 200
- [ ] **T4.24** Webhook responde em < 5s (Meta timeout) — processamento pesado deve ser fire-and-forget

---

## Fase 5: Outbound Media

### 5.1 Adicionar `sendInstagramMedia` e `sendFacebookMedia`

**Arquivos:** `lib/integrations/instagram.ts` e `lib/integrations/facebook.ts`

Send API com attachment:
```json
{
  "recipient": { "id": "RECIPIENT_ID" },
  "message": {
    "attachment": {
      "type": "image",
      "payload": { "url": "MEDIA_URL", "is_reusable": true }
    }
  }
}
```

Mapear mediaType do nosso DB para tipo do Meta:
- `image` → `image`
- `video` → `video`
- `audio` → `audio`
- `document` → `file`

### 5.2 Adicionar cases no message route

**Arquivo:** `app/api/conversations/[id]/messages/route.ts` (após linha 135)

```ts
} else if (channel?.type === 'INSTAGRAM' && channel.accessToken) {
  const token = decrypt(channel.accessToken)
  externalId = await sendInstagramMedia(conversation.externalId, mediaType, mediaUrl, token)
} else if (channel?.type === 'FACEBOOK' && channel.accessToken) {
  const token = decrypt(channel.accessToken)
  externalId = await sendFacebookMedia(conversation.externalId, mediaType, mediaUrl, token)
}
```

### Testes & Edge Cases — Fase 5

- [ ] **T5.1** Enviar imagem pelo inbox → Instagram/Messenger recebe a imagem
- [ ] **T5.2** Enviar vídeo → recebido corretamente
- [ ] **T5.3** Enviar áudio → recebido corretamente
- [ ] **T5.4** Enviar PDF/documento → recebido como arquivo
- [ ] **T5.5** Enviar com caption (texto + mídia) → Meta recebe ambos? (Nota: Send API não suporta texto + attachment no mesmo request — pode precisar 2 requests)
- [ ] **T5.6** `sendInstagramMedia` retorna `message_id` → salvo como `externalId` na message
- [ ] **T5.7** Meta retorna erro (token expirado, mídia muito grande) → erro logado, `sendError` retornado ao frontend
- [ ] **T5.8** Edge case: `mediaUrl` é Vercel Blob URL — Meta precisa acessar publicamente (Blob é público por padrão ✓)
- [ ] **T5.9** Edge case: arquivo > 25MB (limite Meta) → erro claro
- [ ] **T5.10** Edge case: formato não suportado pelo Meta → erro claro
- [ ] **T5.11** Edge case: enviar mídia para Instagram fora da janela de 24h → Meta retorna erro — tratar com mensagem ao agente
- [ ] **T5.12** `channel.accessToken` null → skip envio, não crash

---

## Fase 6: Desconectar Canal

- Endpoint ou handler que:
  1. `DELETE /{page-id}/subscribed_apps?access_token={token}` — unsubscribe webhooks
  2. `channel.update({ isActive: false })` ou soft delete
- Botão na settings page

### Testes & Edge Cases — Fase 6

- [ ] **T6.1** Clicar "Desconectar" → channel.isActive = false, webhooks unsubscribed
- [ ] **T6.2** Após desconectar → mensagens antigas ainda visíveis na inbox (não deletar conversations/messages)
- [ ] **T6.3** Após desconectar → novas mensagens do Meta não criam conversations (channel lookup falha pois isActive=false? ou channel encontrado mas ignorado?)
- [ ] **T6.4** Reconectar após desconectar → atualiza token, reativa channel, re-subscribe webhooks
- [ ] **T6.5** Edge case: unsubscribe falha (token já expirado) → desconecta localmente mesmo assim
- [ ] **T6.6** Edge case: confirmar antes de desconectar (modal de confirmação)

---

## Arquivos Críticos

| Arquivo | Ação |
|---------|------|
| `lib/integrations/meta-common.ts` | **NOVO** — helpers compartilhados (subscribe, profile, media download) |
| `app/api/meta/callback/route.ts` | **NOVO** — OAuth callback (postMessage + fecha popup) |
| `app/[workspaceSlug]/settings/page.tsx` | Ativar botões, OAuth popup, modal páginas, canais conectados |
| `app/api/meta/connect/route.ts` | Webhook subscription + businessAccountId + API v21 |
| `app/api/webhooks/instagram/route.ts` | Fix token, fix lookup, media, perfil |
| `app/api/webhooks/facebook/route.ts` | Fix token, media, perfil |
| `lib/integrations/instagram.ts` | `sendInstagramMedia()` + API v21 |
| `lib/integrations/facebook.ts` | `sendFacebookMedia()` + API v21 |
| `app/api/conversations/[id]/messages/route.ts` | Outbound media IG/FB |

## Funções Existentes a Reutilizar

- `encrypt()` / `decrypt()` — `lib/crypto.ts`
- `canCreateConversation()` / `incrementConversationCount()` — `lib/billing/conversationGate.ts`
- `pusherServer.trigger()` — `lib/pusher.ts`
- `put()` — `@vercel/blob` (upload mídia)
- Padrão fire-and-forget do webhook UazAPI

## Verificação End-to-End

1. Configurar webhook URLs no Meta App Dashboard:
   - Instagram: `{DOMAIN}/api/webhooks/instagram` — campo `messages`
   - Messenger: `{DOMAIN}/api/webhooks/facebook` — campo `messages`
2. Settings → "Conectar Instagram" → popup OAuth → selecionar página → canal aparece conectado
3. Settings → "Conectar Facebook" → mesmo flow → canal aparece conectado
4. Enviar DM pelo Instagram → mensagem aparece na inbox com nome/foto real
5. Responder pela inbox → mensagem chega no Instagram do cliente
6. Enviar mensagem pelo Messenger → aparece na inbox
7. Enviar imagem pelo Instagram → aparece na inbox com preview
8. Responder com imagem pela inbox → imagem chega no Instagram/Messenger
9. Desconectar → canal fica inativo, novas mensagens não processadas

## Env Vars Necessárias

```
META_APP_ID=               # Facebook App ID
META_APP_SECRET=           # Facebook App Secret
META_VERIFY_TOKEN=         # Token arbitrário para verificação webhook
NEXT_PUBLIC_META_APP_ID=   # Mesmo ID, acessível no frontend para OAuth URL
```
