# FASE 2: INFRAESTRUTURA — Inngest + Rate Limiting + waitUntil

**Esforço:** 1-2 dias | **Impacto:** Confiabilidade + 10x throughput | **Quando:** Antes de 30+ workspaces

**Pré-requisito:** Fase 1 completa + Vercel Pro ($20) ativo

---

## 2.1 — Instalar e configurar Inngest

### Instalar
```bash
bun add inngest
```

### Criar client
**Novo arquivo:** `lib/inngest/client.ts`
```typescript
import { Inngest } from 'inngest'

export const inngest = new Inngest({
  id: 'crm-onboarding',
})
```

### Criar serve route
**Novo arquivo:** `app/api/inngest/route.ts`
```typescript
import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'
import { disparadorFanOut, disparadorSendMessage } from '@/lib/inngest/functions/disparador'
import { vendedorProcess } from '@/lib/inngest/functions/vendedor'
import { transcribeAudio } from '@/lib/inngest/functions/transcription'
import { persistMedia } from '@/lib/inngest/functions/media'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    disparadorFanOut,
    disparadorSendMessage,
    vendedorProcess,
    transcribeAudio,
    persistMedia,
  ],
})

export const maxDuration = 300
```

### Env vars necessárias (adicionar no Vercel dashboard)
```
INNGEST_EVENT_KEY=<from inngest dashboard>
INNGEST_SIGNING_KEY=<from inngest dashboard>
```

### Dev local
```bash
npx inngest-cli@latest dev
```
Abre dashboard em http://localhost:8288. A rota `/api/inngest` é registrada automaticamente.

### Edge cases
- [ ] Verificar que `bun add inngest` resolve sem conflitos de versão
- [ ] Testar que `GET /api/inngest` retorna metadata das functions registradas
- [ ] Inngest Dev Server deve listar todas as functions ao startup

---

## 2.2 — Migrar Disparador para Inngest

### Estratégia
Em vez de um loop serial em uma única função, o dispatch usa **fan-out pattern**: 1 job de orquestração envia N eventos (1 por contato), cada um processado como job individual com retry.

### Arquitetura
```
POST /api/agents/disparador
  → inngest.send('dispatch/start', { dispatchId })
      → [disparadorFanOut] carrega contatos, envia N eventos 'dispatch/send-message'
          → [disparadorSendMessage] × N (concurrency: 20, rateLimit: 50/s)
              → sendTemplateMessage + consumeTokens + upsertConversation + updateProgress
```

### Novo arquivo: `lib/inngest/functions/disparador.ts`
```typescript
import { inngest } from '../client'
import { db } from '@/lib/db'
import { decrypt } from '@/lib/crypto'
import { sendTemplateMessage } from '@/lib/integrations/waba'
import { consumeTokens } from '@/lib/billing/tokenService'
import { pusherServer } from '@/lib/pusher'

// ===== Fan-out: carrega dispatch + envia 1 evento por contato =====
export const disparadorFanOut = inngest.createFunction(
  { id: 'disparador-fan-out', retries: 0 },
  { event: 'dispatch/start' },
  async ({ event, step }) => {
    const { dispatchId } = event.data

    const dispatch = await step.run('load-dispatch', async () => {
      return db.templateDispatch.findUnique({
        where: { id: dispatchId },
        include: {
          wabaChannel: true,
          dispatchList: { include: { contacts: true } },
        },
      })
    })

    // Guard: só processa dispatches PENDING
    if (!dispatch || dispatch.status !== 'PENDING') return { skipped: true }

    await step.run('mark-sending', () =>
      db.templateDispatch.update({
        where: { id: dispatchId },
        data: { status: 'SENDING' },
      })
    )

    // Fan-out: 1 evento por contato
    const events = dispatch.dispatchList.contacts.map((contact, idx) => ({
      name: 'dispatch/send-message' as const,
      data: {
        dispatchId,
        contactPhone: contact.phone,
        contactName: contact.name,
        contactId: contact.id,
        templateName: dispatch.templateName,
        phoneNumberId: dispatch.wabaChannel.phoneNumberId!,
        accessToken: dispatch.wabaChannel.accessToken!,
        workspaceId: dispatch.workspaceId,
        channelId: dispatch.wabaChannelId,
        dispatchListId: dispatch.dispatchListId,
        index: idx,
        total: dispatch.dispatchList.contacts.length,
      },
    }))

    await step.sendEvent('fan-out-contacts', events)
    return { total: events.length }
  }
)

// ===== Worker: envia 1 mensagem com retry =====
export const disparadorSendMessage = inngest.createFunction(
  {
    id: 'disparador-send-message',
    retries: 3,
    concurrency: [{ limit: 20 }],         // max 20 mensagens paralelas global
    rateLimit: { limit: 50, period: '1s' }, // max 50/s (WhatsApp rate limit safe)
  },
  { event: 'dispatch/send-message' },
  async ({ event, step }) => {
    const d = event.data

    // 1. Enviar mensagem template via WABA
    await step.run('send-template', async () => {
      const accessToken = decrypt(d.accessToken)
      await sendTemplateMessage(accessToken, d.phoneNumberId, d.contactPhone, d.templateName)
    })

    // 2. Consumir 1 token
    await step.run('consume-token', () =>
      consumeTokens(d.workspaceId, 1, 'disparador', d.dispatchId)
    )

    // 3. Criar/atualizar conversa
    await step.run('upsert-conversation', async () => {
      const externalId = d.contactPhone.replace(/\D/g, '') + '@s.whatsapp.net'
      await db.conversation.upsert({
        where: {
          workspaceId_channelId_externalId: {
            workspaceId: d.workspaceId,
            channelId: d.channelId,
            externalId,
          },
        },
        create: {
          workspaceId: d.workspaceId,
          contactName: d.contactName ?? d.contactPhone,
          contactPhone: d.contactPhone,
          externalId,
          source: 'dispatch',
          pipelineStage: 'Disparo Enviado',
          dispatchListId: d.dispatchListId,
          templateDispatchId: d.dispatchId,
          status: 'UNASSIGNED',
        },
        update: {
          pipelineStage: 'Disparo Enviado',
          templateDispatchId: d.dispatchId,
          source: 'dispatch',
        },
      })
    })

    // 4. Atualizar progresso + verificar completion
    await step.run('update-progress', async () => {
      const updated = await db.templateDispatch.update({
        where: { id: d.dispatchId },
        data: { sentCount: { increment: 1 } },
        select: { sentCount: true, failedCount: true, totalRecipients: true, workspaceId: true },
      })

      // Notificar UI
      pusherServer.trigger(`workspace-${d.workspaceId}`, 'dispatch-progress', {
        dispatchId: d.dispatchId,
        sentCount: updated.sentCount,
        failedCount: updated.failedCount,
        total: updated.totalRecipients,
      }).catch(() => {})

      // Auto-complete quando todos terminaram
      if (updated.sentCount + updated.failedCount >= updated.totalRecipients) {
        await db.templateDispatch.update({
          where: { id: d.dispatchId },
          data: { status: 'COMPLETED', completedAt: new Date() },
        })
        pusherServer.trigger(`workspace-${d.workspaceId}`, 'dispatch-completed', {
          dispatchId: d.dispatchId,
        }).catch(() => {})
      }
    })
  }
)
```

### Alterar rota do disparador

**Arquivo:** `app/api/agents/disparador/route.ts`

**Antes (linhas 52-58):**
```typescript
    // Fire-and-forget async processing
    const baseUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, '') ?? ''
    fetch(`${baseUrl}/api/agents/disparador/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dispatchId: dispatch.id }),
    }).catch((err) => console.error('[DISPARADOR] fire-and-forget error:', err))
```

**Depois:**
```typescript
    // Enqueue via Inngest (durable, with retries)
    try {
      await inngest.send({ name: 'dispatch/start', data: { dispatchId: dispatch.id } })
    } catch (err) {
      console.error('[DISPARADOR] Inngest send failed, falling back to fire-and-forget:', err)
      // Fallback: fire-and-forget HTTP (como antes)
      const baseUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, '') ?? ''
      fetch(`${baseUrl}/api/agents/disparador/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dispatchId: dispatch.id }),
      }).catch(() => {})
    }
```

**Adicionar import no topo:**
```typescript
import { inngest } from '@/lib/inngest/client'
```

### Edge cases e testes
- [ ] Inngest Dev Server rodando (`npx inngest-cli@latest dev`)
- [ ] Disparar 10 contatos → verificar no Inngest dashboard que fan-out criou 10 jobs
- [ ] Simular falha em 1 contato (número inválido) → verificar que retenta 3x depois incrementa `failedCount`
- [ ] Disparar 500 contatos → verificar que rate limit respeita 50/s (dashboard mostra execução distribuída)
- [ ] Verificar que progress (Pusher) atualiza conforme jobs completam (UI mostra barra de progresso)
- [ ] Verificar auto-complete quando todos os jobs terminam (sentCount + failedCount = totalRecipients)
- [ ] Testar dispatch duplicado → fan-out verifica `status !== 'PENDING'` e ignora
- [ ] Se Inngest estiver fora do ar → fallback para fire-and-forget HTTP funciona
- [ ] Verificar que `tokensConsumed` é incrementado corretamente (1 por msg enviada com sucesso)

**Possíveis falhas:**
- **Inngest free tier = 100K runs/mês.** 1 dispatch de 1000 contatos = ~2000 runs (fan-out + 1000 sends). Com 50 dispatches/mês de 1000 contatos = 100K runs, no limite.
- Se o Inngest event key estiver errado, `inngest.send()` faz throw — o fallback HTTP captura isso
- **Concurrency limit é global** (não por dispatch) — 2 dispatches simultâneos dividem os 20 slots
- `accessToken` é passado no evento (criptografado no DB). O worker precisa do `decrypt` para decodificar antes de usar.
- Se `failedCount` não for incrementado em caso de falha após retries, o auto-complete não funciona. Inngest `onFailure` handler pode resolver isso.

### Lidar com falhas permanentes (após 3 retries)

Adicionar `onFailure` handler para incrementar `failedCount`:

```typescript
export const disparadorSendMessageFailure = inngest.createFunction(
  { id: 'disparador-send-message-failure' },
  { event: 'inngest/function.failed', if: 'event.data.function_id == "disparador-send-message"' },
  async ({ event, step }) => {
    const d = event.data.event.data
    await step.run('increment-failed', async () => {
      const updated = await db.templateDispatch.update({
        where: { id: d.dispatchId },
        data: { failedCount: { increment: 1 } },
        select: { sentCount: true, failedCount: true, totalRecipients: true, workspaceId: true },
      })
      if (updated.sentCount + updated.failedCount >= updated.totalRecipients) {
        await db.templateDispatch.update({
          where: { id: d.dispatchId },
          data: { status: 'COMPLETED', completedAt: new Date() },
        })
        pusherServer.trigger(`workspace-${d.workspaceId}`, 'dispatch-completed', { dispatchId: d.dispatchId }).catch(() => {})
      }
    })
  }
)
```

---

## 2.3 — Migrar Vendedor para Inngest (debounce durável)

### Problema atual
`handleInboundWithDebounce` (vendedor.ts linha 79) usa `setTimeout` de 15s dentro de uma função serverless que é cortada pela Vercel após enviar a response HTTP. O debounce **não funciona de forma confiável**.

### Solução: debounce nativo do Inngest
O Inngest tem `debounce` built-in: eventos com a mesma key são agrupados, e a função só executa após N segundos de silêncio.

### Novo arquivo: `lib/inngest/functions/vendedor.ts`
```typescript
import { inngest } from '../client'
import { getDebounceBuffer, clearDebounceBuffer, addToDebounceBuffer } from '@/lib/agents/vendedor-redis'
import { processAiResponse } from '@/lib/agents/vendedor'

export const vendedorProcess = inngest.createFunction(
  {
    id: 'vendedor-debounce-process',
    retries: 2,
    debounce: {
      key: 'event.data.conversationId',
      period: '15s',  // Espera 15s de silêncio antes de executar
    },
  },
  { event: 'vendedor/inbound-message' },
  async ({ event, step }) => {
    const { conversationId, workspaceId } = event.data

    // 1. Ler buffer acumulado no Redis
    const buffer = await step.run('get-buffer', () =>
      getDebounceBuffer(conversationId)
    )

    if (!buffer.length) return { skipped: true }

    // 2. Limpar buffer
    await step.run('clear-buffer', () =>
      clearDebounceBuffer(conversationId)
    )

    // 3. Processar todas as mensagens concatenadas
    const concatenated = buffer.join(' ')
    await step.run('process-ai', () =>
      processAiResponse(workspaceId, conversationId, concatenated)
    )

    return { processed: buffer.length, conversationId }
  }
)
```

### Alterar webhook UazAPI

**Arquivo:** `app/api/webhooks/uazapi/route.ts` — seção vendedor SDR (linhas ~235-256)

**Antes:** fire-and-forget fetch para `/api/agents/vendedor/process`

**Depois:**
```typescript
// 1. Adicionar ao buffer Redis (mantém o padrão existente)
await addToDebounceBuffer(conversation.id, text)

// 2. Enviar evento Inngest (debounce de 15s built-in)
inngest.send({
  name: 'vendedor/inbound-message',
  data: {
    conversationId: conversation.id,
    message: text,
    workspaceId: channel.workspaceId,
  },
}).catch(err => console.error('[UAZAPI WEBHOOK] Inngest vendedor send failed:', err))
```

**Adicionar imports:**
```typescript
import { inngest } from '@/lib/inngest/client'
import { addToDebounceBuffer } from '@/lib/agents/vendedor-redis'
```

### Manter rota vendedor/process como fallback
Não deletar `app/api/agents/vendedor/process/route.ts` — útil para trigger manual ou debug.

### IMPORTANTE: adicionar TTL no debounce buffer

**Arquivo:** `lib/agents/vendedor-redis.ts` — função `addToDebounceBuffer` (linha 22)

**Depois do `rpush`, adicionar expire:**
```typescript
export async function addToDebounceBuffer(conversationId: string, message: string): Promise<void> {
  const key = KEYS.debounce(conversationId)
  await redis.rpush(key, message)
  await redis.expire(key, 300) // 5 min TTL — cleanup se Inngest não processar
}
```

### Edge cases e testes
- [ ] Enviar 1 mensagem no WhatsApp → esperar 15s → verificar que resposta do SDR chega (via Inngest dashboard)
- [ ] Enviar 3 mensagens rápidas (<15s entre elas) → verificar que Inngest debounce agrupa → 1 resposta com todas as mensagens
- [ ] Enviar mensagem quando IA está bloqueada (`blockAI`) → `processAiResponse` verifica `isBlocked` internamente e retorna cedo
- [ ] Verificar no Inngest dashboard que eventos são re-delayed a cada nova mensagem
- [ ] Testar com resposta longa (5+ linhas) → todas as linhas devem ser enviadas via UazAPI
- [ ] Verificar handoff para humano quando `maxMessages` é atingido
- [ ] Se Inngest estiver fora → mensagem fica no buffer Redis com TTL de 5 min → pode ser processada manualmente

**Possíveis falhas:**
- `processAiResponse` é uma função longa (~5-25s) que faz OpenAI call + send messages + DB updates. Se falhar no meio, o retry recomeça **toda a step** `process-ai`, potencialmente enviando mensagens duplicadas. Mitigação: o vendedor já verifica `isBlocked` e `lastAiMessage` no Redis.
- Se o buffer Redis expirar (5 min TTL) antes do Inngest processar, as mensagens são perdidas. Improvável a menos que Inngest esteja totalmente fora por >5 min.
- O `addToDebounceBuffer` agora é chamado no webhook (blocking), não mais no vendedor process. Isso adiciona 1 Redis call ao webhook path — latência: ~5ms.

---

## 2.4 — Migrar Transcrição para Inngest

### Novo arquivo: `lib/inngest/functions/transcription.ts`
```typescript
import { inngest } from '../client'
import { db } from '@/lib/db'
import { downloadUazapiMedia } from '@/lib/integrations/uazapi'
import { put } from '@vercel/blob'
import { pusherServer } from '@/lib/pusher'

export const transcribeAudio = inngest.createFunction(
  {
    id: 'transcribe-audio',
    retries: 3,
    concurrency: [{ limit: 5 }], // Não sobrecarregar OpenAI Whisper
  },
  { event: 'media/transcribe' },
  async ({ event, step }) => {
    const { messageId, conversationId, workspaceId, instanceToken, mediaMessageId } = event.data

    // 1. Download audio from UazAPI
    const audioBuffer = await step.run('download-audio', async () => {
      const { buffer } = await downloadUazapiMedia(instanceToken, mediaMessageId)
      return Buffer.from(buffer).toString('base64') // serialize for step boundary
    })

    // 2. Transcribe with OpenAI Whisper
    const transcription = await step.run('transcribe', async () => {
      const buffer = Buffer.from(audioBuffer, 'base64')
      // ... OpenAI Whisper API call (move from app/api/transcription/route.ts)
      // Return transcription text
    })

    // 3. Update message in DB
    await step.run('update-db', async () => {
      await db.message.update({
        where: { id: messageId },
        data: { transcription },
      })
    })

    // 4. Notify frontend
    await step.run('notify', async () => {
      pusherServer.trigger(`workspace-${workspaceId}`, 'message-updated', {
        conversationId, messageId, transcription,
      }).catch(() => {})
    })

    return { messageId, transcription: transcription?.slice(0, 50) }
  }
)
```

### Alterar webhook UazAPI

**Antes (linhas ~194-205):** fire-and-forget fetch para `/api/transcription`
**Depois:**
```typescript
inngest.send({
  name: 'media/transcribe',
  data: { messageId: savedMessage.id, conversationId: conversation.id, workspaceId: channel.workspaceId, instanceToken: channel.instanceToken, mediaMessageId: data.messageid },
}).catch(err => console.error('[UAZAPI WEBHOOK] Inngest transcribe send failed:', err))
```

---

## 2.5 — Migrar Media Persist para Inngest

### Novo arquivo: `lib/inngest/functions/media.ts`
```typescript
import { inngest } from '../client'
import { db } from '@/lib/db'
import { downloadUazapiMedia } from '@/lib/integrations/uazapi'
import { put } from '@vercel/blob'
import { pusherServer } from '@/lib/pusher'

export const persistMedia = inngest.createFunction(
  {
    id: 'persist-media',
    retries: 3,
    concurrency: [{ limit: 10 }],
  },
  { event: 'media/persist' },
  async ({ event, step }) => {
    const { messageId, conversationId, workspaceId, instanceToken, mediaMessageId, mediaType, mediaMime } = event.data

    // 1. Download from UazAPI
    const mediaBase64 = await step.run('download', async () => {
      const { buffer, contentType } = await downloadUazapiMedia(instanceToken, mediaMessageId)
      return { buffer: Buffer.from(buffer).toString('base64'), contentType }
    })

    // 2. Upload to Vercel Blob
    const blobUrl = await step.run('upload-blob', async () => {
      const buffer = Buffer.from(mediaBase64.buffer, 'base64')
      const ext = mediaBase64.contentType.split('/')[1]?.split(';')[0] ?? 'bin'
      const filename = `uazapi-${Date.now()}-${messageId}.${ext}`
      const blob = await put(`media/${filename}`, buffer, { access: 'public', contentType: mediaBase64.contentType })
      return blob.url
    })

    // 3. Update DB
    await step.run('update-db', async () => {
      await db.message.update({
        where: { id: messageId },
        data: { mediaUrl: blobUrl, mediaMime: mediaBase64.contentType },
      })
    })

    // 4. Notify frontend
    await step.run('notify', async () => {
      pusherServer.trigger(`workspace-${workspaceId}`, 'message-updated', {
        conversationId, messageId, mediaUrl: blobUrl, mediaMime: mediaBase64.contentType,
      }).catch(() => {})
    })

    return { messageId, blobUrl }
  }
)
```

### Alterar webhook UazAPI

**Antes (linhas ~208-226):** fire-and-forget async com downloadUazapiMedia + put
**Depois:**
```typescript
inngest.send({
  name: 'media/persist',
  data: {
    messageId: savedMessage.id,
    conversationId: conversation.id,
    workspaceId: channel.workspaceId,
    instanceToken: channel.instanceToken,
    mediaMessageId: data.messageid,
    mediaType,
    mediaMime,
  },
}).catch(err => console.error('[UAZAPI WEBHOOK] Inngest media persist failed:', err))
```

---

## 2.6 — Rate limiting por workspace com Upstash

### Instalar
```bash
bun add @upstash/ratelimit
```

### Novo arquivo: `lib/ratelimit.ts`
```typescript
import { Ratelimit } from '@upstash/ratelimit'
import { redis } from '@/lib/redis'

// 100 requests per 10 seconds per workspace (general API)
export const apiRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, '10 s'),
  prefix: 'ratelimit:api',
})

// 10 messages per second per workspace (outbound sending)
export const sendRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 s'),
  prefix: 'ratelimit:send',
})

// 5 dispatches per minute per workspace
export const dispatchRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1 m'),
  prefix: 'ratelimit:dispatch',
})
```

### Aplicar nas rotas críticas

**Arquivo:** `app/api/conversations/[id]/messages/route.ts` — POST handler, após auth:
```typescript
import { sendRateLimit } from '@/lib/ratelimit'

// Após session check:
const { success } = await sendRateLimit.limit(session.user.workspaceId)
if (!success) {
  return NextResponse.json({ error: 'Rate limit exceeded. Try again in a moment.' }, { status: 429 })
}
```

**Arquivo:** `app/api/agents/disparador/route.ts` — POST handler, após auth:
```typescript
import { dispatchRateLimit } from '@/lib/ratelimit'

const { success } = await dispatchRateLimit.limit(session.user.workspaceId)
if (!success) {
  return NextResponse.json({ error: 'Muitos disparos recentes. Aguarde 1 minuto.' }, { status: 429 })
}
```

### Edge cases e testes
- [ ] Enviar 15 mensagens em 1 segundo → 10 devem passar, 5 devem retornar 429
- [ ] Verificar que workspaces diferentes têm limites independentes (keys são diferentes)
- [ ] Verificar que Upstash Redis commands/dia não estoura (1 command por rate limit check)
- [ ] Verificar que o frontend mostra erro ao receber 429 (toast ou similar)
- [ ] Disparar 6 dispatches em 1 minuto → 5 devem passar, 1 retorna 429

**Possíveis falhas:**
- Rate limit bloqueia o próprio disparador Inngest se a rota for chamada internamente — garantir que Inngest NÃO passa pelo rate limit (chama `inngest.send()` diretamente, não a rota HTTP)
- Upstash free tier: 10K commands/dia. Com rate limit em 2 rotas + ~500 requests/dia = 1K commands. Safe.

---

## 2.7 — waitUntil() como ponte imediata (ANTES do Inngest)

Se o Inngest demorar para implementar, usar `waitUntil()` da Vercel como fix imediato para o bug do vendedor SDR.

### Instalar
```bash
bun add @vercel/functions
```

### Alterar `app/api/agents/vendedor/process/route.ts`

**Antes:**
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { handleInboundWithDebounce } from '@/lib/agents/vendedor'

export async function POST(req: NextRequest) {
  const { conversationId, message, workspaceId, debounceSeconds } = await req.json() as {
    conversationId: string
    message: string
    workspaceId: string
    debounceSeconds?: number
  }

  // Fire-and-forget: start debounce + processing
  handleInboundWithDebounce(conversationId, message, workspaceId, debounceSeconds)
    .catch(err => console.error('[VENDEDOR PROCESS] error:', err))

  return NextResponse.json({ started: true })
}
```

**Depois:**
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { handleInboundWithDebounce } from '@/lib/agents/vendedor'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const { conversationId, message, workspaceId, debounceSeconds } = await req.json() as {
    conversationId: string
    message: string
    workspaceId: string
    debounceSeconds?: number
  }

  // waitUntil garante que a função continua após enviar a response
  waitUntil(
    handleInboundWithDebounce(conversationId, message, workspaceId, debounceSeconds)
      .catch(err => console.error('[VENDEDOR PROCESS] error:', err))
  )

  return NextResponse.json({ started: true })
}
```

### Edge cases e testes
- [ ] Enviar mensagem WhatsApp com SDR ativo → verificar que resposta chega após 15s
- [ ] Verificar nos logs da Vercel que a função roda por >15s (não é cortada)
- [ ] `waitUntil` só funciona na Vercel, não em dev local. Em dev, o fire-and-forget anterior continua funcionando (Node.js não mata processos async)

---

## CHECKLIST FINAL FASE 2

1. [ ] `bun add inngest` (ou `bun add @vercel/functions` como ponte)
2. [ ] Criar `lib/inngest/client.ts`
3. [ ] Criar `app/api/inngest/route.ts` (serve handler)
4. [ ] Criar `lib/inngest/functions/disparador.ts` (fan-out + send-message + failure handler)
5. [ ] Criar `lib/inngest/functions/vendedor.ts` (debounce durável)
6. [ ] Criar `lib/inngest/functions/transcription.ts` (audio transcribe)
7. [ ] Criar `lib/inngest/functions/media.ts` (media persist)
8. [ ] Alterar `app/api/agents/disparador/route.ts` → usar `inngest.send()` com fallback
9. [ ] Alterar `app/api/webhooks/uazapi/route.ts` → substituir fire-and-forget por `inngest.send()`
10. [ ] Adicionar TTL no debounce buffer (`vendedor-redis.ts`)
11. [ ] `bun add @upstash/ratelimit`
12. [ ] Criar `lib/ratelimit.ts`
13. [ ] Aplicar rate limit em messages POST e disparador POST
14. [ ] Adicionar env vars do Inngest na Vercel
15. [ ] Testar: dispatch 10 contatos → Inngest dashboard mostra 10 jobs
16. [ ] Testar: vendedor debounce → 3 msgs rápidas → 1 resposta
17. [ ] Testar: rate limit → 15 msgs/s → 10 passam, 5 retornam 429
18. [ ] Monitorar Inngest dashboard por 1 semana em produção
