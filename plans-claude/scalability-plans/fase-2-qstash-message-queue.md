# Fase 2: Message Queue para Webhooks — QStash

## Contexto

**Problema:** 10+ fire-and-forget patterns nos webhooks (UazAPI, Facebook, Instagram) e no disparador.
Todos morrem silenciosamente no serverless sem retry. O vendedor usa `setTimeout(15s)` que é cortado
pela Vercel. O disparador roda loop sequencial de até 300s. Com 30+ workspaces, isso vai quebrar.

**Decisão:** QStash (Upstash) — mesmo ecossistema do Redis já existente. HTTP-based, sem SDK pesado,
500K msgs/mês no free tier, retry nativo, delay nativo.

**Inngest foi removido** (commit `e4c6628`). Não usar Inngest.

---

## Arquitetura

```
WEBHOOK (fast, <300ms)                    QUEUE (QStash)                    WORKER ROUTES
┌─────────────────────┐                   ┌──────────────┐                  ┌──────────────────────────────┐
│ /webhooks/uazapi    │──qstash.publish──>│ transcribe   │──────────────────>│ /api/queue/transcribe        │
│                     │──qstash.publish──>│ media-persist│──────────────────>│ /api/queue/media-persist     │
│                     │──qstash.publish──>│ dispatch-resp│──────────────────>│ /api/queue/dispatch-response │
│                     │──redis+qstash───> │ vendedor     │──delay:15s──────> │ /api/queue/vendedor-check    │
│                     │──qstash.publish──>│ human-takeo  │──────────────────>│ /api/queue/human-takeover    │
│                     │──qstash.publish──>│ qualify-lead │──────────────────>│ /api/queue/qualify-lead      │
├─────────────────────┤                   ├──────────────┤                  ├──────────────────────────────┤
│ /webhooks/facebook  │──qstash.publish──>│ profile-fetch│──────────────────>│ /api/queue/profile-fetch     │
│ /webhooks/instagram │──qstash.publish──>│ media-persist│──────────────────>│ /api/queue/media-persist     │
├─────────────────────┤                   ├──────────────┤                  ├──────────────────────────────┤
│ /agents/disparador  │──qstash.publish──>│ dispatch-fan │──────────────────>│ /api/queue/dispatch-fan-out  │
│                     │                   │ dispatch-send│──staggered──────> │ /api/queue/dispatch-send     │
└─────────────────────┘                   └──────────────┘                  └──────────────────────────────┘
```

**O que fica SYNC no webhook** (não muda): parse → dedup → billing gate → conversation upsert →
message create → conv update → Pusher

**O que vai pra FILA**: transcription, media-persist, profile-fetch, vendedor-check,
human-takeover, qualify-lead, dispatch-fan-out, dispatch-send, dispatch-response

---

## Fase A — Infraestrutura (1–2h)

### A1. Instalar dependências

```bash
bun add @upstash/qstash @upstash/ratelimit
```

**Verificação A1:**
```bash
# Confirmar instalação
cat package.json | grep -E "qstash|ratelimit"
# Deve mostrar: "@upstash/qstash": "^x.x.x" e "@upstash/ratelimit": "^x.x.x"
```

---

### A2. Criar `lib/qstash.ts`

```typescript
import { Client, Receiver } from '@upstash/qstash'

if (!process.env.QSTASH_TOKEN) throw new Error('QSTASH_TOKEN is required')

export const qstash = new Client({ token: process.env.QSTASH_TOKEN })

export const qstashReceiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
})

/**
 * Publica job na fila. URL é construída automaticamente com NEXTAUTH_URL.
 * Em desenvolvimento (NODE_ENV !== 'production'), loga e retorna sem publicar
 * para não precisar de ngrok em dev.
 */
export async function publishToQueue(
  route: string,
  body: Record<string, unknown>,
  options?: {
    delay?: number        // segundos
    retries?: number      // default: 3
    deduplicationId?: string
  }
): Promise<void> {
  if (process.env.NODE_ENV !== 'production' && !process.env.QSTASH_FORCE_PUBLISH) {
    console.log(`[QSTASH DEV] would publish to ${route}`, body)
    return
  }

  const baseUrl = (process.env.NEXTAUTH_URL ?? '').replace(/\/$/, '')
  if (!baseUrl) throw new Error('NEXTAUTH_URL is required for QStash publishing')

  await qstash.publishJSON({
    url: `${baseUrl}${route}`,
    body,
    retries: options?.retries ?? 3,
    ...(options?.delay ? { delay: options.delay } : {}),
    ...(options?.deduplicationId ? { deduplicationId: options.deduplicationId } : {}),
  })
}
```

**Edge cases A2:**
- Se `NEXTAUTH_URL` não estiver configurado na Vercel, todos os publishes falham silenciosamente
  — por isso o `throw new Error` é intencional
- `deduplicationId` previne jobs duplicados no QStash se o webhook for chamado 2x pelo mesmo evento

---

### A3. Criar `lib/queue/verify.ts`

```typescript
import { qstashReceiver } from '@/lib/qstash'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Verifica assinatura QStash. Usar no início de cada worker.
 * Em dev (sem QSTASH_CURRENT_SIGNING_KEY), bypass automático.
 * Retorna null se válido, ou NextResponse 401 se inválido.
 */
export async function verifyQStashSignature(req: NextRequest): Promise<NextResponse | null> {
  // Em desenvolvimento sem keys configuradas, permitir qualquer request
  if (!process.env.QSTASH_CURRENT_SIGNING_KEY) {
    console.warn('[QUEUE] QStash signature verification skipped (dev mode)')
    return null
  }

  const signature = req.headers.get('upstash-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing QStash signature' }, { status: 401 })
  }

  const body = await req.text()

  try {
    const isValid = await qstashReceiver.verify({
      signature,
      body,
    })
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid QStash signature' }, { status: 401 })
    }
    return null
  } catch (err) {
    console.error('[QUEUE] QStash signature verification error:', err)
    return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 })
  }
}

/**
 * Parse do body já lido na verificação. Usar após verifyQStashSignature retornar null.
 */
export async function parseQStashBody<T>(req: NextRequest): Promise<T> {
  const body = await req.text()
  return JSON.parse(body) as T
}
```

**Edge cases A3:**
- `req.text()` só pode ser chamado UMA vez — se chamado antes da verificação, a verificação falha
  com "body already consumed". Por isso `verifyQStashSignature` lê o body e `parseQStashBody` relê
  — isso funciona porque `NextRequest` não tem streaming de body em edge runtime do Next.js
- Workers que não usam `verifyQStashSignature` ficam expostos publicamente — NUNCA omitir

---

### A4. Criar `lib/ratelimit.ts`

```typescript
import { Ratelimit } from '@upstash/ratelimit'
import { redis } from '@/lib/redis'

// 10 mensagens/segundo por workspace (envio de mensagens manuais)
export const sendRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 s'),
  prefix: 'ratelimit:send',
})

// 5 disparos/minuto por workspace
export const dispatchRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1 m'),
  prefix: 'ratelimit:dispatch',
})
```

---

### A5. Env vars — adicionar no Vercel Dashboard

```
QSTASH_TOKEN=<from upstash console>
QSTASH_CURRENT_SIGNING_KEY=<from upstash console>
QSTASH_NEXT_SIGNING_KEY=<from upstash console>
```

**IMPORTANTE:** `NEXTAUTH_URL` já deve existir SEM trailing slash. QStash constrói URL assim:
`https://seu-dominio.vercel.app/api/queue/transcribe`

**Verificação A5 (curl manual):**
```bash
# Testar que env vars estão corretas na Vercel
curl -X POST https://qstash.upstash.io/v2/publish/https://SEU-DOMINIO/api/queue/transcribe \
  -H "Authorization: Bearer $QSTASH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
# Deve retornar 200 com messageId
```

---

### Testes Fase A

- [ ] `bun add @upstash/qstash @upstash/ratelimit` sem erros
- [ ] `lib/qstash.ts` importa sem erro: `import { publishToQueue } from '@/lib/qstash'`
- [ ] `lib/queue/verify.ts` importa sem erro
- [ ] `lib/ratelimit.ts` importa sem erro
- [ ] Em dev sem `QSTASH_CURRENT_SIGNING_KEY`, `verifyQStashSignature` retorna `null` (bypass)
- [ ] Em dev sem `QSTASH_FORCE_PUBLISH`, `publishToQueue` apenas loga (não faz HTTP)

---

## Fase B — Worker Routes (2–3h)

> **Padrão de todos os workers:**
> 1. `verifyQStashSignature(req)` — retornar 401 se falhar
> 2. `parseQStashBody<T>(req)` — parsear body
> 3. Lógica de negócio
> 4. Retornar `200 OK` com JSON `{ success: true }`
> 5. QStash considera QUALQUER status >= 400 como falha e reprocessa (até `retries` configurado)
> 6. Retornar 200 para "falhas esperadas" (dedup, skip) — evita retry desnecessário

---

### B1. `app/api/queue/transcribe/route.ts`

**Move lógica de** `app/api/transcription/route.ts`

**Payload:**
```typescript
type TranscribePayload = {
  messageId: string
  conversationId: string
  workspaceId: string
  instanceToken: string
  mediaMessageId: string  // msg.messageid do UazAPI
}
```

**Lógica** (mover de `/api/transcription/route.ts`):
1. Download de áudio via UazAPI (`downloadUazapiMedia(instanceToken, mediaMessageId)`)
2. Upload para Vercel Blob
3. Transcrição via OpenAI Whisper
4. `db.message.update({ where: { id: messageId }, data: { transcription, mediaUrl } })`
5. `pusherServer.trigger(`workspace-${workspaceId}`, 'message-updated', { conversationId, messageId, transcription })`

**Configuração QStash:** `retries: 3`

**Edge cases B1:**
- Se `downloadUazapiMedia` retornar `fileURL` vazio (mídia expirada no WhatsApp), retornar 200 com
  `{ skipped: true, reason: 'no-media-url' }` — não retry (mídia não vai aparecer)
- Se OpenAI Whisper falhar por arquivo muito grande (>25MB), logar e retornar 200 com
  `{ skipped: true, reason: 'file-too-large' }` — não retry
- Se `messageId` não existir no DB (mensagem deletada), retornar 200 silenciosamente

**Curl test B1:**
```bash
curl -X POST http://localhost:3000/api/queue/transcribe \
  -H "Content-Type: application/json" \
  -d '{"messageId":"msg-id","conversationId":"conv-id","workspaceId":"ws-id","instanceToken":"tok","mediaMessageId":"media-id"}'
# Em dev: QSTASH_CURRENT_SIGNING_KEY não configurado → bypass de assinatura
```

---

### B2. `app/api/queue/media-persist/route.ts`

**Payload:**
```typescript
type MediaPersistPayload = {
  messageId: string
  conversationId: string
  workspaceId: string
  source: 'uazapi' | 'meta'
  // UazAPI:
  instanceToken?: string
  mediaMessageId?: string
  // Meta:
  mediaUrl?: string         // URL direta do CDN da Meta (expira em ~1h)
  accessToken?: string      // criptografado, usar decrypt()
  mediaMime?: string
}
```

**Lógica:**
1. Se `source === 'uazapi'`: `downloadUazapiMedia(instanceToken!, mediaMessageId!)` → `{ fileURL, mimetype }`
2. Se `source === 'meta'`: `downloadMetaMedia(mediaUrl!, decrypt(accessToken!))` → `{ buffer, contentType }`
3. Upload para Vercel Blob: `put('media/...', buffer, { access: 'public' })`
4. `db.message.update({ where: { id: messageId }, data: { mediaUrl: blob.url, mediaMime } })`
5. `pusherServer.trigger(`workspace-${workspaceId}`, 'message-updated', { ... })`

**Configuração QStash:** `retries: 3`

**Edge cases B2:**
- URLs da Meta expiram em ~1h — se job demorar muito na fila, download falhará com 401/403.
  QStash pode retentar depois de horas. Solução: se erro for 401/403 no download Meta, retornar
  200 `{ skipped: true, reason: 'media-url-expired' }` — não faz sentido retentar
- Se Vercel Blob estiver fora, lançar erro (retries do QStash vão funcionar)
- Verificar se `message.mediaUrl` já existe antes de baixar (dedup: job pode ter rodado 2x)

**Curl test B2:**
```bash
curl -X POST http://localhost:3000/api/queue/media-persist \
  -H "Content-Type: application/json" \
  -d '{"messageId":"id","conversationId":"c","workspaceId":"w","source":"uazapi","instanceToken":"tok","mediaMessageId":"mid","mediaMime":"image/jpeg"}'
```

---

### B3. `app/api/queue/profile-fetch/route.ts`

**Payload:**
```typescript
type ProfileFetchPayload = {
  conversationId: string
  workspaceId: string
  senderId: string
  channelType: 'FACEBOOK' | 'INSTAGRAM'
  accessToken: string  // criptografado, usar decrypt()
}
```

**Lógica:**
1. `fetchMetaUserProfile(senderId, decrypt(accessToken), channelType)` → `{ name, photoUrl }`
2. `db.conversation.update({ where: { id: conversationId }, data: { contactName, contactPhotoUrl } })`
3. `pusherServer.trigger(`workspace-${workspaceId}`, 'conversation-updated', { conversationId, ... })`

**Configuração QStash:** `retries: 2`

**Edge cases B3:**
- `fetchMetaUserProfile` pode retornar `{ name: undefined }` para contas privadas — nesse caso,
  não atualizar `contactName` (não sobrescrever o nome existente com `undefined`)
- Token Meta expirado → erro 190 da Graph API → retornar 200 `{ skipped: true, reason: 'token-expired' }`
  não faz sentido retentar (token não vai se curar)

**Curl test B3:**
```bash
curl -X POST http://localhost:3000/api/queue/profile-fetch \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"c","workspaceId":"w","senderId":"123","channelType":"FACEBOOK","accessToken":"enc:xxx"}'
```

---

### B4. `app/api/queue/vendedor-check/route.ts` — Debounce Durável

**Substitui o `setTimeout(15s)` do `handleInboundWithDebounce`**

**Payload:**
```typescript
type VendedorCheckPayload = {
  conversationId: string
  workspaceId: string
  scheduledAt: number  // Date.now() no momento do publish
}
```

**Lógica:**
1. Ler `vendedor:debounce_ts:{conversationId}` do Redis
2. Se `storedTs > scheduledAt` → outra mensagem chegou depois → retornar 200 `{ skipped: true, reason: 'newer-message' }`
3. Se `storedTs <= scheduledAt` ou null → ler buffer `vendedor:debounce:{conversationId}` (Redis LRANGE)
4. Se buffer vazio → retornar 200 `{ skipped: true, reason: 'empty-buffer' }`
5. Limpar buffer (`clearDebounceBuffer(conversationId)`)
6. Concatenar mensagens + chamar `processAiResponse(workspaceId, conversationId, concatenated)`

**Configuração QStash:** `delay: 15, retries: 2`

**Redis keys usados:**
```
vendedor:debounce:{conversationId}     → RPUSH lista de mensagens (TTL: 300s)
vendedor:debounce_ts:{conversationId}  → SET timestamp da última mensagem (TTL: 60s)
```

**Como o debounce funciona com 3 mensagens rápidas (t=0, t=5, t=10):**
```
t=0:  rpush buffer["msg1"], set ts=0,  qstash delay:15 { scheduledAt: 0  }
t=5:  rpush buffer["msg2"], set ts=5,  qstash delay:15 { scheduledAt: 5  }
t=10: rpush buffer["msg3"], set ts=10, qstash delay:15 { scheduledAt: 10 }

t=15: worker { scheduledAt: 0  } → ts=10 > 0  → SKIP
t=20: worker { scheduledAt: 5  } → ts=10 > 5  → SKIP
t=25: worker { scheduledAt: 10 } → ts=10 == 10 → PROCESSA ["msg1","msg2","msg3"]
```

**Edge cases B4:**
- `processAiResponse` pode demorar 5–25s (OpenAI call). QStash default timeout para workers é 30s
  no Vercel Hobby (60s no Pro). Configurar `maxDuration = 60` no arquivo da rota
- Se `processAiResponse` falhar no meio (ex.: OpenAI timeout), QStash retentar chamará
  `vendedor-check` de novo. O buffer já foi limpo (passo 5). Solução: limpar APÓS processar, ou
  aceitar que retry não terá mensagens para processar (retorna `empty-buffer` — ok)
- Versão mais segura: limpar buffer ANTES de chamar `processAiResponse`, e se falhar,
  as mensagens já foram descartadas (tradeoff: melhor que enviar mensagem duplicada para o lead)

**Adicionar em `lib/agents/vendedor-redis.ts` (novo key):**
```typescript
// Adicionar após as funções existentes:
export async function setDebounceTimestamp(conversationId: string, ts: number): Promise<void> {
  await redis.set(`vendedor:debounce_ts:${conversationId}`, ts, { ex: 60 })
}

export async function getDebounceTimestamp(conversationId: string): Promise<number | null> {
  const val = await redis.get<number>(`vendedor:debounce_ts:${conversationId}`)
  return val
}
```

**Adicionar TTL no `addToDebounceBuffer` existente:**
```typescript
// Após redis.rpush, adicionar:
await redis.expire(`vendedor:debounce:${conversationId}`, 300) // 5 min TTL
```

**Curl test B4:**
```bash
curl -X POST http://localhost:3000/api/queue/vendedor-check \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"c","workspaceId":"w","scheduledAt":1234567890}'
# Deve retornar { skipped: true, reason: "empty-buffer" } se buffer vazio
```

---

### B5. `app/api/queue/human-takeover/route.ts`

**Payload:**
```typescript
type HumanTakeoverPayload = {
  conversationId: string
  textContent: string
}
```

**Lógica:**
1. `detectHumanTakeover(conversationId, textContent)` (de `lib/agents/vendedor-redis.ts`)
   — se detectar mensagem humana, chama `blockAI(conversationId)` internamente

**Configuração QStash:** `retries: 2`

**Edge cases B5:**
- `detectHumanTakeover` tem lógica de Redis internamente — se falhar, o retry vai funcionar
- Idempotente: chamar 2x o `blockAI` não causa problema (SET idempotente no Redis)

**Curl test B5:**
```bash
curl -X POST http://localhost:3000/api/queue/human-takeover \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"c","textContent":"ok vou checar"}'
```

---

### B6. `app/api/queue/qualify-lead/route.ts`

**Payload:**
```typescript
type QualifyLeadPayload = {
  conversationId: string
  workspaceId: string
  chatHistoryJson: string  // JSON.stringify(chatHistory)
  apiKey: string           // criptografado, usar decrypt()
}
```

**Lógica** (mover de `vendedor.ts` linhas 477–502):
1. `const chatHistory = JSON.parse(chatHistoryJson)`
2. `extractQualification(chatHistory, decrypt(apiKey))` → `{ name?, phone?, interest?, ... }`
3. `db.conversation.update({ where: { id: conversationId }, data: qualification })`
4. `pusherServer.trigger(`workspace-${workspaceId}`, 'conversation-updated', { conversationId, ... })`

**Configuração QStash:** `retries: 2`

**Edge cases B6:**
- `chatHistoryJson` pode ser muito grande para payload QStash (limite: 1MB). Se histórico for
  grande, salvar no Redis com TTL de 5min e passar só a key
- OpenAI pode retornar qualification parcial (alguns campos null) — sempre fazer merge com dados
  existentes, não sobrescrever com null

**Curl test B6:**
```bash
curl -X POST http://localhost:3000/api/queue/qualify-lead \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"c","workspaceId":"w","chatHistoryJson":"[]","apiKey":"enc:xxx"}'
```

---

### B7. `app/api/queue/dispatch-fan-out/route.ts`

**Payload:**
```typescript
type DispatchFanOutPayload = {
  dispatchId: string
}
```

**Lógica:**
1. Carregar dispatch + contatos:
   ```typescript
   const dispatch = await db.templateDispatch.findUnique({
     where: { id: dispatchId },
     include: { wabaChannel: true, dispatchList: { include: { contacts: true } } }
   })
   ```
2. Guard: `if (!dispatch || dispatch.status !== 'PENDING') return 200 { skipped: true }`
3. `db.templateDispatch.update({ status: 'SENDING', startedAt: new Date() })`
4. Para cada contato com delay escalonado (máximo 50 envios/segundo):
   ```typescript
   for (let i = 0; i < contacts.length; i++) {
     await publishToQueue('/api/queue/dispatch-send', { ...payload }, {
       delay: Math.floor(i / 50),  // escalonar: 50 por segundo
       retries: 3,
       deduplicationId: `dispatch-send-${dispatchId}-${contact.id}`
     })
   }
   ```
5. Retornar 200 `{ total: contacts.length }`

**Configuração QStash:** `retries: 1`

**Edge cases B7:**
- Dispatch com 1000 contatos → fan-out publica 1000 jobs. QStash publishJSON é 1 HTTP call por job.
  Com 1000 calls, o fan-out pode demorar ~10s. Verificar se o worker está dentro do timeout do Vercel.
  Alternativa: usar `qstash.batchPublish()` se disponível, ou publicar em batches de 100
- Guard de status `!== 'PENDING'` previne re-execução se QStash retentar o fan-out
- `deduplicationId` por contato previne envios duplicados se fan-out rodar 2x

---

### B8. `app/api/queue/dispatch-send/route.ts`

**Payload:**
```typescript
type DispatchSendPayload = {
  dispatchId: string
  contactPhone: string
  contactName: string | null
  contactId: string
  templateName: string
  phoneNumberId: string
  accessToken: string      // criptografado, usar decrypt()
  workspaceId: string
  channelId: string
  dispatchListId: string
}
```

**Lógica:**
1. `sendTemplateMessage(decrypt(accessToken), phoneNumberId, contactPhone, templateName)` (de `lib/integrations/waba.ts`)
2. `consumeTokens(workspaceId, 1, 'disparador', dispatchId)` (de `lib/billing/tokenService.ts`)
3. Upsert conversation:
   ```typescript
   const externalId = contactPhone.replace(/\D/g, '') + '@s.whatsapp.net'
   await db.conversation.upsert({
     where: { workspaceId_channelId_externalId: { workspaceId, channelId, externalId } },
     create: { workspaceId, contactName: contactName ?? contactPhone, contactPhone, externalId,
               source: 'dispatch', pipelineStage: 'Disparo Enviado',
               dispatchListId, templateDispatchId: dispatchId, status: 'UNASSIGNED',
               channelId },
     update: { pipelineStage: 'Disparo Enviado', templateDispatchId: dispatchId, source: 'dispatch' }
   })
   ```
4. Incrementar `sentCount` + verificar auto-complete:
   ```typescript
   const updated = await db.templateDispatch.update({
     where: { id: dispatchId },
     data: { sentCount: { increment: 1 } },
     select: { sentCount: true, failedCount: true, totalRecipients: true, workspaceId: true }
   })
   await pusherServer.trigger(`workspace-${workspaceId}`, 'dispatch-progress', {
     dispatchId, sentCount: updated.sentCount, failedCount: updated.failedCount, total: updated.totalRecipients
   }).catch(() => {})
   if (updated.sentCount + updated.failedCount >= updated.totalRecipients) {
     await db.templateDispatch.update({ where: { id: dispatchId },
       data: { status: 'COMPLETED', completedAt: new Date() } })
     await pusherServer.trigger(`workspace-${workspaceId}`, 'dispatch-completed', { dispatchId }).catch(() => {})
   }
   ```

**Configuração QStash:** `retries: 3`

**Failure handler — `app/api/queue/dispatch-send-failed/route.ts`:**
QStash não tem `onFailure` nativo igual ao Inngest. Solução: criar endpoint separado que
incrementa `failedCount`. Chamar via QStash `Callback` header no publish do `dispatch-send`.

No `dispatch-fan-out`, ao publicar cada `dispatch-send`, adicionar callback:
```typescript
await qstash.publishJSON({
  url: `${baseUrl}/api/queue/dispatch-send`,
  body: payload,
  retries: 3,
  failureCallback: `${baseUrl}/api/queue/dispatch-send-failed`,
  deduplicationId: `dispatch-send-${dispatchId}-${contact.id}`
})
```

**`app/api/queue/dispatch-send-failed/route.ts`:**
```typescript
// Payload enviado pelo QStash como failure callback
type DispatchSendFailedPayload = {
  dispatchId: string
  workspaceId: string
}
// Incrementar failedCount + verificar auto-complete (mesmo padrão do dispatch-send)
```

**Edge cases B8:**
- `sendTemplateMessage` pode falhar com `{ error: { code: 131030 } }` (número inválido na Meta).
  Esse é erro permanente — não adianta retentar. Retornar 200 imediatamente + marcar como falha
  chamando `db.templateDispatch.update({ failedCount: { increment: 1 } })` diretamente
- Race condition em `sentCount + failedCount >= totalRecipients`: múltiplos workers podem ler
  o mesmo `updated` e tentar marcar COMPLETED. Usar `updateMany` com condição:
  ```typescript
  await db.templateDispatch.updateMany({
    where: { id: dispatchId, status: 'SENDING' },
    data: { status: 'COMPLETED', completedAt: new Date() }
  })
  ```
- `accessToken` está criptografado no DB. Lembrar de `decrypt(accessToken)` antes de usar

**Curl test B8:**
```bash
curl -X POST http://localhost:3000/api/queue/dispatch-send \
  -H "Content-Type: application/json" \
  -d '{"dispatchId":"d","contactPhone":"5511999999999","contactName":"Teste","contactId":"cid","templateName":"template_name","phoneNumberId":"pid","accessToken":"enc:xxx","workspaceId":"w","channelId":"ch","dispatchListId":"dl"}'
```

---

### B9. `app/api/queue/dispatch-response/route.ts`

**Payload:**
```typescript
type DispatchResponsePayload = {
  conversationId: string
  workspaceId: string
}
```

**Lógica** (mover de `handleDispatchResponse` em `lib/agents/disparador.ts`):
1. Chamar `handleDispatchResponse(conversationId, workspaceId)`

**Configuração QStash:** `retries: 2`

**Curl test B9:**
```bash
curl -X POST http://localhost:3000/api/queue/dispatch-response \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"c","workspaceId":"w"}'
```

---

### Testes Fase B

Para cada worker (sem assinatura em dev):

- [ ] Cada rota responde 200 com body válido ao receber payload correto
- [ ] Cada rota responde 401 em produção sem header `upstash-signature`
- [ ] `transcribe`: mensagem com áudio → DB atualiza `transcription`
- [ ] `media-persist`: imagem UazAPI → Vercel Blob URL no DB
- [ ] `media-persist`: imagem Meta → Vercel Blob URL no DB (com `decrypt(accessToken)`)
- [ ] `profile-fetch`: conversa FB → `contactName` atualizado
- [ ] `vendedor-check`: buffer vazio → `{ skipped: true }`
- [ ] `vendedor-check`: buffer com mensagem + ts correto → `processAiResponse` chamado
- [ ] `dispatch-fan-out`: dispatch PENDING → jobs publicados no QStash dashboard
- [ ] `dispatch-fan-out`: dispatch não-PENDING → `{ skipped: true }`
- [ ] `dispatch-send`: contato válido → `sentCount` incrementado, Pusher evento disparado
- [ ] `dispatch-send`: número inválido → `failedCount` incrementado, não retenta

---

## Fase C — Conectar Webhooks (1–2h)

### C1. `app/api/webhooks/uazapi/route.ts`

**Substituir 6 fire-and-forget por `publishToQueue`:**

**C1.A — Transcrição (linhas ~195-205)**

ANTES:
```typescript
fetch(`${baseUrl}/api/transcription`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ messageId: savedMessage.id, externalId: msg.messageid, instanceToken: channel.instanceToken }),
}).then(...).catch(err => console.error(...))
```

DEPOIS:
```typescript
await publishToQueue('/api/queue/transcribe', {
  messageId: savedMessage.id,
  conversationId: conversation.id,
  workspaceId: channel.workspaceId,
  instanceToken: channel.instanceToken,
  mediaMessageId: msg.messageid,
}).catch(err => console.error('[UAZAPI WEBHOOK] qstash transcribe error:', err))
```

---

**C1.B — Media persist (linhas ~208-226)**

ANTES:
```typescript
downloadUazapiMedia(channel.instanceToken, msg.messageid)
  .then(async ({ fileURL, mimetype }) => { ... })
  .catch(err => console.error(...))
```

DEPOIS:
```typescript
await publishToQueue('/api/queue/media-persist', {
  messageId: savedMessage.id,
  conversationId: conversation.id,
  workspaceId: channel.workspaceId,
  source: 'uazapi',
  instanceToken: channel.instanceToken,
  mediaMessageId: msg.messageid,
  mediaMime,
}).catch(err => console.error('[UAZAPI WEBHOOK] qstash media error:', err))
```

---

**C1.C — Dispatch response (linhas ~229-232)**

ANTES:
```typescript
handleDispatchResponse(conversation.id, channel.workspaceId)
  .catch(err => console.error(...))
```

DEPOIS:
```typescript
await publishToQueue('/api/queue/dispatch-response', {
  conversationId: conversation.id,
  workspaceId: channel.workspaceId,
}).catch(err => console.error('[UAZAPI WEBHOOK] qstash dispatch-response error:', err))
```

---

**C1.D — Vendedor SDR (linhas ~235-256)**

ANTES:
```typescript
processMessageContent({ content: textContent, ... })
  .then(processedContent => {
    if (!processedContent) return
    return fetch(`${baseUrl}/api/agents/vendedor/process`, {
      method: 'POST', body: JSON.stringify({ conversationId, message: processedContent, workspaceId })
    })
  }).catch(...)
```

DEPOIS:
```typescript
// processMessageContent deve completar ANTES de publicar (ele pode chamar OpenAI vision)
const processedContent = await processMessageContent({
  content: textContent, mediaType: mediaType ?? null, mediaUrl: mediaUrl ?? null, transcription: null,
}).catch(err => { console.error('[UAZAPI WEBHOOK] processMessageContent error:', err); return null })

if (processedContent && conversation.aiSalesEnabled && conversation.dispatchListId) {
  const scheduledAt = Date.now()
  await addToDebounceBuffer(conversation.id, processedContent)
  await setDebounceTimestamp(conversation.id, scheduledAt)
  await publishToQueue('/api/queue/vendedor-check', {
    conversationId: conversation.id,
    workspaceId: channel.workspaceId,
    scheduledAt,
  }, { delay: 15 }).catch(err => console.error('[UAZAPI WEBHOOK] qstash vendedor error:', err))
}
```

**IMPORTANTE:** `processMessageContent` pode chamar OpenAI vision (~2-3s). Isso aumenta o tempo
do webhook. Alternativa: publicar `vendedor-check` sem processar content, e mover
`processMessageContent` para dentro do worker `vendedor-check`. Escolha: manter no webhook para
simplicidade (visão é rara), aceitar latência extra.

---

**C1.E — Human takeover (linhas ~259-262)**

ANTES:
```typescript
detectHumanTakeover(conversation.id, textContent).catch(...)
```

DEPOIS:
```typescript
await publishToQueue('/api/queue/human-takeover', {
  conversationId: conversation.id,
  textContent,
}).catch(err => console.error('[UAZAPI WEBHOOK] qstash human-takeover error:', err))
```

---

**Adicionar imports no topo do arquivo:**
```typescript
import { publishToQueue } from '@/lib/qstash'
import { addToDebounceBuffer, setDebounceTimestamp } from '@/lib/agents/vendedor-redis'
```

**Remover imports não mais usados:**
- `handleDispatchResponse` (agora é worker)
- `detectHumanTakeover` (agora é worker)
- `handleInboundWithDebounce` / `processMessageContent` (se movido)

---

### C2. `app/api/webhooks/facebook/route.ts`

**C2.A — Profile fetch (linhas ~94-111)**

ANTES:
```typescript
fetchMetaUserProfile(senderId, token, 'FACEBOOK')
  .then((profile) => db.conversation.update(...).then(() => pusherServer.trigger(...)))
  .catch((err) => console.error(...))
```

DEPOIS:
```typescript
await publishToQueue('/api/queue/profile-fetch', {
  conversationId: conversation.id,
  workspaceId: channel.workspaceId,
  senderId,
  channelType: 'FACEBOOK',
  accessToken: channel.accessToken,  // já criptografado
}).catch(err => console.error('[FB WEBHOOK] qstash profile error:', err))
```

---

**C2.B — Media download IIFE (linhas ~169-190)**

ANTES:
```typescript
;(async () => {
  try {
    const accessToken = channel.accessToken ? decrypt(channel.accessToken) : ''
    const { buffer, contentType } = await downloadMetaMedia(...)
    ...
  } catch (err) { console.error(...) }
})()
```

DEPOIS:
```typescript
await publishToQueue('/api/queue/media-persist', {
  messageId: savedMessage.id,
  conversationId: conversation.id,
  workspaceId: channel.workspaceId,
  source: 'meta',
  mediaUrl: attachment?.payload?.url,
  accessToken: channel.accessToken,  // já criptografado
  mediaMime: attachment?.payload?.contentType ?? 'application/octet-stream',
}).catch(err => console.error('[FB WEBHOOK] qstash media error:', err))
```

---

### C3. `app/api/webhooks/instagram/route.ts`

Mesmas mudanças que Facebook (C2.A e C2.B), trocando `channelType: 'INSTAGRAM'` e prefixo de log.

---

### C4. `app/api/agents/disparador/route.ts`

**Fire-and-forget (linhas ~54-60)**

ANTES:
```typescript
fetch(`${baseUrl}/api/agents/disparador/process`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ dispatchId: dispatch.id }),
}).catch((err) => console.error('[DISPARADOR] fire-and-forget error:', err))
```

DEPOIS:
```typescript
try {
  await publishToQueue('/api/queue/dispatch-fan-out', { dispatchId: dispatch.id }, { retries: 1 })
} catch (err) {
  // Fallback: fire-and-forget HTTP (como antes)
  console.error('[DISPARADOR] QStash publish failed, falling back:', err)
  const baseUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, '') ?? ''
  fetch(`${baseUrl}/api/agents/disparador/process`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dispatchId: dispatch.id }),
  }).catch(() => {})
}
```

**Adicionar import:**
```typescript
import { publishToQueue } from '@/lib/qstash'
```

---

### Testes Fase C

- [ ] Webhook UazAPI retorna `< 300ms` após as mudanças (medir com curl `-w "%{time_total}"`)
- [ ] Mensagem de áudio → job `transcribe` aparece no QStash dashboard → transcrição no DB
- [ ] Mensagem de imagem → job `media-persist` aparece → Blob URL no DB
- [ ] Resposta em conversa de dispatch → job `dispatch-response` aparece → pipelineStage atualizado
- [ ] 3 mensagens rápidas para conversa SDR → 3 jobs `vendedor-check` no dashboard → só 1 executa (2 skipped)
- [ ] Mensagem outbound manual → job `human-takeover` aparece → blockAI se detectado
- [ ] Webhook Facebook → job `profile-fetch` aparece → contactName atualizado
- [ ] Webhook Facebook com imagem → job `media-persist` aparece com `source: 'meta'`
- [ ] Webhook Instagram → mesmos jobs que Facebook
- [ ] POST `/api/agents/disparador` → job `dispatch-fan-out` aparece no QStash dashboard

---

## Fase D — Rate Limiting (30min)

### D1. `app/api/conversations/[id]/messages/route.ts` — POST handler

Após auth check (após linha com `session` verificado), adicionar:

```typescript
import { sendRateLimit } from '@/lib/ratelimit'

// Dentro do POST handler, após verificar session:
const { success } = await sendRateLimit.limit(session.user.workspaceId)
if (!success) {
  return NextResponse.json(
    { error: 'Muitas mensagens enviadas. Aguarde um momento.' },
    { status: 429 }
  )
}
```

### D2. `app/api/agents/disparador/route.ts` — POST handler

```typescript
import { dispatchRateLimit } from '@/lib/ratelimit'

// Após verificar session:
const { success } = await dispatchRateLimit.limit(session.user.workspaceId)
if (!success) {
  return NextResponse.json(
    { error: 'Muitos disparos recentes. Aguarde 1 minuto.' },
    { status: 429 }
  )
}
```

### Testes Fase D

- [ ] 15 mensagens em 1s para o mesmo workspace → 10 retornam 200, 5 retornam 429
- [ ] 15 mensagens em 1s para workspaces diferentes → todas retornam 200 (limites independentes)
- [ ] 6 disparos em 1min → 5 retornam 200, 1 retorna 429
- [ ] Verificar que frontend mostra erro ao receber 429 (toast, não quebra silenciosamente)

**Edge case D:**
- Rate limit usa Redis → `~1 command por check`. Com 2 rotas + 500 req/dia → 1K commands/dia.
  Upstash free tier: 10K commands/dia. Safe.
- Workers QStash NÃO passam pelo rate limit (chamam lógica diretamente, não as rotas HTTP)

---

## Fase E — Fallbacks e Monitoramento (30min)

### E1. Manter rotas antigas como fallback manual

Não deletar:
- `app/api/agents/disparador/process/route.ts` — útil para trigger manual de dispatch travado
- `app/api/agents/vendedor/process/route.ts` — útil para debug de SDR
- `app/api/transcription/route.ts` — útil para reprocessar transcrição manual

### E2. `app/api/agents/vendedor/process/route.ts` — fix imediato com waitUntil

Enquanto QStash não está 100% em produção, usar `waitUntil` como bridge:

```typescript
import { waitUntil } from '@vercel/functions'
// bun add @vercel/functions

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const { conversationId, message, workspaceId, debounceSeconds } = await req.json()

  waitUntil(
    handleInboundWithDebounce(conversationId, message, workspaceId, debounceSeconds)
      .catch(err => console.error('[VENDEDOR PROCESS] error:', err))
  )

  return NextResponse.json({ started: true })
}
```

### E3. Cron de dispatches travados

Adicionar em `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/fix-stuck-dispatches",
      "schedule": "*/10 * * * *"
    }
  ]
}
```

**`app/api/cron/fix-stuck-dispatches/route.ts`:**
```typescript
// Verificar dispatches em SENDING há >15min
const stuckDispatches = await db.templateDispatch.findMany({
  where: { status: 'SENDING', startedAt: { lt: new Date(Date.now() - 15 * 60 * 1000) } }
})
// Para cada um: verificar se sentCount + failedCount >= totalRecipients → marcar COMPLETED
// Ou re-publicar no QStash se ainda há contatos faltando
```

---

## Verificação End-to-End

### 1. Test de Latência do Webhook
```bash
curl -w "\nTotal time: %{time_total}s\n" -X POST https://SEU-DOMINIO/api/webhooks/uazapi \
  -H "Content-Type: application/json" \
  -d '{"event":"message","instance":"INST_ID","payload":{...}}'
# Esperado: < 300ms
```

### 2. Test do Vendedor Debounce
1. Enviar 3 mensagens WhatsApp em < 10s
2. Abrir QStash dashboard → verificar 3 jobs `vendedor-check` agendados para t+15s, t+20s, t+25s
3. Aguardar ~25s → verificar que 2 jobs mostram `skipped` e 1 processou
4. Verificar resposta AI chegou no WhatsApp

### 3. Test do Disparador Fan-out
1. Criar dispatch com 5 contatos → POST `/api/agents/disparador`
2. QStash dashboard → 1 job `dispatch-fan-out` → após executar, 5 jobs `dispatch-send`
3. UI mostra progress bar atualizando conforme jobs completam
4. Verificar `status: 'COMPLETED'` no DB após todos os jobs

### 4. Test de Rate Limit
```bash
# Enviar 15 mensagens em 1s (ajustar workspaceId e token)
for i in $(seq 1 15); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST https://SEU-DOMINIO/api/conversations/CONV_ID/messages \
    -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
    -d '{"content":"test"}'
done
# Esperado: 10x "200", 5x "429"
```

### 5. Test de Retry
1. Parar UazAPI temporariamente
2. Enviar mensagem de áudio no WhatsApp → webhook publica job `transcribe`
3. QStash dashboard → job falha 3x com backoff exponencial
4. Reiniciar UazAPI → 4ª tentativa (ou próximo retry) deve suceder
5. Verificar `transcription` no DB

### 6. Test de Falha Permanente no Dispatch
1. Criar dispatch com 1 número inválido + 4 válidos
2. Verificar que `sentCount = 4, failedCount = 1, status = COMPLETED`
3. Verificar que `failureCallback` incrementou `failedCount` corretamente

---

## Custo

| Serviço | Free Tier | Uso Estimado/mês | Status |
|---------|-----------|------------------|--------|
| QStash | 500K msgs | ~70K msgs | OK |
| Upstash Redis | 10K cmds/dia | ~3K cmds/dia | OK |
| Ratelimit | Usa Redis | +1K cmds/dia | OK |

**Custo adicional: $0/mês** até escalar significativamente.

---

## Checklist Final

### Fase A — Infraestrutura
- [ ] `bun add @upstash/qstash @upstash/ratelimit`
- [ ] Criar `lib/qstash.ts` com `publishToQueue` + dev bypass
- [ ] Criar `lib/queue/verify.ts` com `verifyQStashSignature` + `parseQStashBody`
- [ ] Criar `lib/ratelimit.ts` com `sendRateLimit` + `dispatchRateLimit`
- [ ] Adicionar env vars no Vercel: `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`

### Fase B — Workers
- [ ] `app/api/queue/transcribe/route.ts` — mover lógica de `/api/transcription`
- [ ] `app/api/queue/media-persist/route.ts` — UazAPI + Meta
- [ ] `app/api/queue/profile-fetch/route.ts` — FB + Instagram
- [ ] `app/api/queue/vendedor-check/route.ts` — debounce durável
- [ ] `app/api/queue/human-takeover/route.ts` — detectHumanTakeover
- [ ] `app/api/queue/qualify-lead/route.ts` — extractQualification
- [ ] `app/api/queue/dispatch-fan-out/route.ts` — fan-out com delay escalonado
- [ ] `app/api/queue/dispatch-send/route.ts` — send + billing + upsert
- [ ] `app/api/queue/dispatch-send-failed/route.ts` — failure callback
- [ ] `app/api/queue/dispatch-response/route.ts` — handleDispatchResponse
- [ ] Adicionar `setDebounceTimestamp` + `getDebounceTimestamp` em `lib/agents/vendedor-redis.ts`
- [ ] Adicionar TTL no `addToDebounceBuffer` em `lib/agents/vendedor-redis.ts`

### Fase C — Webhooks
- [ ] `uazapi/route.ts`: transcrição → qstash
- [ ] `uazapi/route.ts`: media persist → qstash
- [ ] `uazapi/route.ts`: dispatch response → qstash
- [ ] `uazapi/route.ts`: vendedor SDR → redis + qstash delay 15s
- [ ] `uazapi/route.ts`: human takeover → qstash
- [ ] `facebook/route.ts`: profile fetch → qstash
- [ ] `facebook/route.ts`: media download IIFE → qstash
- [ ] `instagram/route.ts`: profile fetch → qstash
- [ ] `instagram/route.ts`: media download IIFE → qstash
- [ ] `disparador/route.ts`: fire-and-forget → qstash com fallback

### Fase D — Rate Limiting
- [ ] Rate limit em `messages/route.ts` POST
- [ ] Rate limit em `disparador/route.ts` POST

### Fase E — Fallbacks
- [ ] `vendedor/process/route.ts`: adicionar `waitUntil` + `maxDuration: 60`
- [ ] `bun add @vercel/functions`
- [ ] Criar cron `fix-stuck-dispatches` + `vercel.json`

### Verificação
- [ ] Webhook latência < 300ms
- [ ] Vendedor debounce: 3 mensagens → 1 resposta AI
- [ ] Disparador: 5 contatos → progress Pusher → COMPLETED
- [ ] Rate limit: 15 msgs/s → 10 passam, 5 retornam 429
- [ ] Retry: UazAPI offline → QStash retenta 3x → sucede quando volta

---

## Arquivos Críticos

| Arquivo | Ação |
|---------|------|
| `lib/qstash.ts` | **NOVO** |
| `lib/queue/verify.ts` | **NOVO** |
| `lib/ratelimit.ts` | **NOVO** |
| `lib/agents/vendedor-redis.ts` | **MODIFICAR** — `setDebounceTimestamp` + TTL |
| `app/api/queue/transcribe/route.ts` | **NOVO** |
| `app/api/queue/media-persist/route.ts` | **NOVO** |
| `app/api/queue/profile-fetch/route.ts` | **NOVO** |
| `app/api/queue/vendedor-check/route.ts` | **NOVO** |
| `app/api/queue/human-takeover/route.ts` | **NOVO** |
| `app/api/queue/qualify-lead/route.ts` | **NOVO** |
| `app/api/queue/dispatch-fan-out/route.ts` | **NOVO** |
| `app/api/queue/dispatch-send/route.ts` | **NOVO** |
| `app/api/queue/dispatch-send-failed/route.ts` | **NOVO** |
| `app/api/queue/dispatch-response/route.ts` | **NOVO** |
| `app/api/webhooks/uazapi/route.ts` | **MODIFICAR** — 5 fire-and-forget → qstash |
| `app/api/webhooks/facebook/route.ts` | **MODIFICAR** — 2 fire-and-forget → qstash |
| `app/api/webhooks/instagram/route.ts` | **MODIFICAR** — 2 fire-and-forget → qstash |
| `app/api/agents/disparador/route.ts` | **MODIFICAR** — fire-and-forget → qstash com fallback |
| `app/api/conversations/[id]/messages/route.ts` | **MODIFICAR** — rate limit |
| `app/api/agents/vendedor/process/route.ts` | **MODIFICAR** — waitUntil |
