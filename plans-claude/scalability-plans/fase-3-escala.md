# FASE 3: ESCALA — Cache, Event Bus, Workers Dedicados

**Esforço:** 2-3 dias | **Impacto:** Escala ilimitada | **Quando:** Quando métricas justificarem

**Pré-requisitos:** Fase 1 + Fase 2 completas, Inngest funcionando em produção

**Gatilhos para iniciar esta fase:**
- Supabase connections > 80% do limite
- Upstash commands > 80K/dia
- Vercel GB-hours > 800/mês
- Inngest runs > 80K/mês
- Latência de webhook > 500ms p95

---

## 3.1 — Cache layer com Redis

### Contexto
O webhook UazAPI faz `channel.findFirst({ where: { instanceToken }})` em CADA evento. Com o index da Fase 1, isso é rápido (~5ms), mas com centenas de msgs/seg, cada query é um roundtrip desnecessário. O mesmo vale para workspace config e AI config que raramente mudam.

### Caches recomendados
| Query | TTL | Key pattern | Invalidação |
|-------|-----|-------------|-------------|
| Channel by instanceToken | 10 min | `cache:ch:token:{token}` | On channel update/disconnect |
| Workspace config | 5 min | `cache:ws:{id}` | On workspace settings save |
| AiSalesConfig | 5 min | `cache:ai:{wsId}` | On AI config update |
| Conversation gate | 1 min | `cache:gate:{wsId}` | On new conversation create |

### Novo arquivo: `lib/cache.ts`
```typescript
import { redis } from '@/lib/redis'

/**
 * Cache-aside pattern with TTL.
 * Returns cached value if exists, otherwise executes fn and caches result.
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<T> {
  // Try cache first
  const existing = await redis.get(key)
  if (existing !== null && existing !== undefined) {
    // Upstash auto-deserializes JSON, but Dates become strings
    return existing as T
  }

  // Cache miss: execute function
  const result = await fn()
  if (result !== null && result !== undefined) {
    await redis.set(key, result, { ex: ttlSeconds })
  }
  return result
}

/**
 * Invalidate a specific cache key.
 */
export async function invalidate(key: string): Promise<void> {
  await redis.del(key)
}

/**
 * Invalidate all keys matching a pattern (use sparingly).
 * Upstash doesn't support SCAN efficiently, so use specific keys.
 */
export async function invalidateMany(...keys: string[]): Promise<void> {
  if (keys.length === 0) return
  await Promise.all(keys.map(k => redis.del(k)))
}

// ===== Key builders =====
export const cacheKeys = {
  channelByToken: (token: string) => `cache:ch:token:${token}`,
  workspace: (id: string) => `cache:ws:${id}`,
  aiConfig: (wsId: string) => `cache:ai:${wsId}`,
  convGate: (wsId: string) => `cache:gate:${wsId}`,
}
```

### Aplicar no webhook UazAPI

**Arquivo:** `app/api/webhooks/uazapi/route.ts` — channel lookup (linha ~64)

**Antes:**
```typescript
const channel = await db.channel.findFirst({
  where: { instanceToken: payload.token, provider: 'UAZAPI', type: 'WHATSAPP' },
})
```

**Depois:**
```typescript
import { cached, cacheKeys } from '@/lib/cache'

const channel = await cached(
  cacheKeys.channelByToken(payload.token),
  600, // 10 min
  () => db.channel.findFirst({
    where: { instanceToken: payload.token, provider: 'UAZAPI', type: 'WHATSAPP' },
  })
)
```

### Aplicar no vendedor (AiSalesConfig)

**Arquivo:** `lib/agents/vendedor.ts` — dentro de `processAiResponse`, onde carrega config

**Antes:**
```typescript
const config = await db.aiSalesConfig.findUnique({ where: { workspaceId } })
```

**Depois:**
```typescript
import { cached, cacheKeys } from '@/lib/cache'

const config = await cached(
  cacheKeys.aiConfig(workspaceId),
  300, // 5 min
  () => db.aiSalesConfig.findUnique({ where: { workspaceId } })
)
```

### Invalidação: quando settings mudam

**Arquivo:** `app/api/ai-agent/route.ts` (ou equivalente que salva AiSalesConfig)

Após update:
```typescript
import { invalidate, cacheKeys } from '@/lib/cache'

// Após salvar config:
await invalidate(cacheKeys.aiConfig(workspaceId))
```

**Arquivo:** Settings page API (channel update/disconnect):
```typescript
await invalidate(cacheKeys.channelByToken(channel.instanceToken))
```

### Edge cases e testes
- [ ] **Cache hit:** Enviar 2 mensagens rápidas → segunda deve pular query DB (verificar em logs)
- [ ] **Cache invalidation:** Alterar AI config no settings → próxima resposta do vendedor usa config nova
- [ ] **TTL expiry:** Após 10 min sem webhooks, cache expira → próximo webhook faz query fresh
- [ ] **Race condition:** Dois webhooks simultâneos ambos fazem cache miss → ambos setam cache (OK, idempotente)
- [ ] **Serialização:** Verificar que campos `Date` (createdAt, updatedAt) funcionam corretamente após cache (vêm como string ISO)
- [ ] **Null cache:** Se channel não existe (token inválido), `cached` não armazena null → cada request invalido faz query DB. OK para segurança.

**Possíveis falhas:**
- **Cache stale:** Channel desconectado mas cache diz ativo → webhook processa msg de canal desativado por até 10 min. Mitigação: invalidar cache no disconnect handler.
- **Date serialization:** `Date` objects viram strings após cache. Se o código downstream espera `Date`, precisa converter. Tipicamente não é problema pois Prisma retorna objetos que são serializados anyway.
- **Memory:** Upstash free = 256MB. Cada cache entry ~500 bytes. 10K entries = 5MB. Safe.

---

## 3.2 — Separar webhook receiver de processor

### Contexto
Mesmo com Inngest para background tasks (Fase 2), o webhook UazAPI ainda faz 8-10 queries DB bloqueantes antes de retornar 200 ao UazAPI. Se o DB estiver lento, UazAPI pode fazer timeout e retentar.

### Arquitetura
```
[UazAPI] → POST /api/webhooks/uazapi
             → parse payload + basic validation (~5ms)
             → inngest.send('webhook/uazapi', payload) (~50ms)
             → return 200 EVENT_RECEIVED (~55ms total)
                    ↓
           [Inngest worker: webhook/uazapi]
             → processMessage(payload)
               → channel lookup (cached)
               → dedup check
               → conversation upsert
               → message create
               → pusher trigger
               → trigger SDR/transcription/media jobs
```

### Implementação

**Novo arquivo:** `lib/inngest/functions/webhook-processor.ts`
```typescript
import { inngest } from '../client'
// Import processMessage from existing webhook code (extract to shared function)

export const processUazapiWebhook = inngest.createFunction(
  {
    id: 'process-uazapi-webhook',
    retries: 3,
    concurrency: [{ limit: 50 }], // Max 50 concurrent webhook processors
  },
  { event: 'webhook/uazapi' },
  async ({ event, step }) => {
    const payload = event.data

    if (payload.EventType === 'messages') {
      await step.run('process-message', () =>
        processMessage(payload, { isHistory: false })
      )
    } else if (payload.EventType === 'connection') {
      await step.run('handle-connection', () =>
        handleConnection(payload)
      )
    } else if (payload.EventType === 'messages_update') {
      await step.run('handle-update', () =>
        handleMessagesUpdate(payload)
      )
    }
  }
)
```

### Refatorar webhook route

**Arquivo:** `app/api/webhooks/uazapi/route.ts` (simplificado)
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { inngest } from '@/lib/inngest/client'

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()
    const payload = JSON.parse(body)

    // Basic validation only
    if (!payload.token && !payload.instance) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    // Enqueue for async processing
    await inngest.send({
      name: 'webhook/uazapi',
      data: payload,
    })

    return NextResponse.json({ status: 'EVENT_RECEIVED' })
  } catch (err) {
    console.error('[UAZAPI WEBHOOK] Parse error:', err)
    return NextResponse.json({ status: 'ERROR' }, { status: 200 }) // Return 200 to prevent retries
  }
}
```

### Extrair processMessage para arquivo compartilhado

Mover `processMessage`, `handleConnection`, `handleMessagesUpdate` do `route.ts` para:
**Novo arquivo:** `lib/webhooks/uazapi-processor.ts`

Isso permite que tanto a rota (fallback) quanto o Inngest worker usem a mesma lógica.

### Edge cases e testes
- [ ] **Inngest down:** Se `inngest.send()` falhar, o webhook retorna 200 mas a msg é perdida. Considerar fallback para processamento inline.
- [ ] **Dedup:** UazAPI retenta webhook → 2 Inngest events → dedup check no `processMessage` garante que só 1 é processado
- [ ] **Ordering:** Inngest não garante ordem. 2 msgs do mesmo contato podem ser processadas fora de ordem. O `lastMessageAt` pode ficar incorreto momentaneamente. Mitigação: usar `MAX(lastMessageAt, new_timestamp)` no update.
- [ ] **Latência percebida:** Mensagens agora levam ~1-2s extras para aparecer no CRM (Inngest processing delay). Aceitável para a maioria dos casos.
- [ ] **Connection events:** Estado do canal pode demorar para atualizar no UI. Aceitável.

**Possíveis falhas:**
- **Latência aumentada:** Antes a mensagem aparecia em ~200ms no CRM. Com Inngest, pode levar 1-3s. Se isso for inaceitável, manter processamento inline para `new-message` events e só usar Inngest para background tasks.
- **Inngest billing:** Cada webhook event = 1 run. Com 1000 msgs/dia = 30K runs/mês. Somando com dispatches e vendedor, pode ultrapassar 100K free tier.

### Decisão recomendada
**Implementar separação receiver/processor APENAS se a latência do webhook exceder 500ms p95.** Caso contrário, o benefício não justifica a complexidade adicional e o aumento de runs no Inngest.

---

## 3.3 — Worker dedicado para IA

### Quando migrar
Quando o consumo de GB-hours da Vercel por AI processing (vendedor SDR) exceder 50% do total. Indicadores:
- Vercel dashboard → Functions → `vendedor/process` com avg duration >20s
- GB-hours mensais acima de 500 (de 1000 do Pro)

### Análise de custo atual
- Cada resposta do vendedor SDR: ~20-30s de function time
- 100 respostas/dia × 25s = 2500s/dia = 41 min/dia = 20.5 GB-hours/mês (a 1024MB)
- 1000 respostas/dia = 205 GB-hours/mês (20% do Pro tier)
- 5000 respostas/dia = 1025 GB-hours/mês (EXCEDE Pro tier → overage charges)

### Opção 1: Railway worker ($5-10/mês)

**Estrutura:**
```
worker/
├── package.json
├── tsconfig.json
├── src/
│   └── index.ts    // Inngest worker process
```

**worker/src/index.ts:**
```typescript
import { serve } from 'inngest/express'  // ou fastify
import express from 'express'
import { inngest } from '../lib/inngest/client'  // shared
import { vendedorProcess } from '../lib/inngest/functions/vendedor'
import { transcribeAudio } from '../lib/inngest/functions/transcription'

const app = express()
app.use('/api/inngest', serve({ client: inngest, functions: [vendedorProcess, transcribeAudio] }))
app.listen(3001)
```

**Benefícios:**
- IA processing sai do Vercel → GB-hours reduzem drasticamente
- Worker roda 24/7 sem cold starts → latência consistente
- Railway auto-scales baseado em CPU/memory

**Railway pricing:**
- $5/mês pelo plano básico
- ~$0.01/GB-hour de compute
- 100 respostas/dia = ~$2/mês

### Opção 2: Vercel Cron + Redis queue

Não recomendado. Polling é wasteful e adiciona latência.

### Opção 3: Manter no Vercel + otimizar

Se o custo de GB-hours estiver aceitável, otimizar:
- Reduzir debounce de 15s para 10s (economiza 33% por resposta)
- Usar streaming para OpenAI (enviar primeira linha antes de completar todas)
- Mover para gpt-4.1-mini se não estiver usando (mais rápido/barato)

### Edge cases
- [ ] Worker Railway precisa acessar o mesmo banco (DATABASE_URL) — configurar env vars
- [ ] Worker precisa de UPSTASH_REDIS vars para debounce
- [ ] Inngest routing: funções registradas no worker são processadas lá, não na Vercel. Verificar que o Inngest app reconhece ambos os serve endpoints.

---

## 3.4 — Observabilidade e Alertas

### Dashboard mínimo

Criar uma rota interna `GET /api/admin/health` que retorna métricas:

```typescript
export async function GET() {
  const [
    activeConnections,
    totalChannels,
    totalConversations,
    pendingDispatches,
  ] = await Promise.all([
    // Supabase connections (approximate via query)
    db.$queryRaw`SELECT count(*) FROM pg_stat_activity WHERE state = 'active'`,
    db.channel.count({ where: { isActive: true } }),
    db.conversation.count({ where: { lastMessageAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
    db.templateDispatch.count({ where: { status: 'SENDING' } }),
  ])

  return NextResponse.json({
    activeConnections,
    totalChannels,
    activeConversations24h: totalConversations,
    pendingDispatches,
    timestamp: new Date().toISOString(),
  })
}
```

### Métricas a monitorar (por serviço)

| Serviço | Métrica | Onde verificar | Alerta threshold |
|---------|---------|----------------|-----------------|
| Vercel | Function duration p95 | Vercel dashboard → Functions | > 10s |
| Vercel | GB-hours used | Vercel dashboard → Usage | > 800/1000 |
| Vercel | Error rate | Vercel dashboard → Logs | > 1% |
| Supabase | Active connections | Supabase dashboard → Database | > 80% do limite |
| Supabase | Query latency p95 | Supabase dashboard → Performance | > 100ms |
| Upstash | Commands/day | Upstash console | > 8K/10K (free) |
| Upstash | Memory usage | Upstash console | > 200MB/256MB (free) |
| Pusher | Messages/day | Pusher dashboard | > 150K/200K (free) |
| Pusher | Peak connections | Pusher dashboard | > 80/100 (free) |
| Inngest | Monthly runs | Inngest dashboard | > 80K/100K (free) |
| Inngest | Function failure rate | Inngest dashboard → Functions | > 5% |
| Inngest | Queue depth | Inngest dashboard | > 1000 pending |

### Alertas automatizados (via Vercel Cron ou Inngest scheduled)

```typescript
// Inngest scheduled function: run every hour
export const healthCheck = inngest.createFunction(
  { id: 'health-check' },
  { cron: '0 * * * *' }, // Every hour
  async ({ step }) => {
    const health = await step.run('check-health', async () => {
      const pendingDispatches = await db.templateDispatch.count({ where: { status: 'SENDING', updatedAt: { lt: new Date(Date.now() - 10 * 60 * 1000) } } })
      return { stuckDispatches: pendingDispatches }
    })

    if (health.stuckDispatches > 0) {
      await step.run('alert-stuck-dispatches', async () => {
        // Send alert (Slack webhook, email via Resend, etc.)
        console.warn(`[HEALTH] ${health.stuckDispatches} dispatches stuck in SENDING for >10min`)
      })
    }
  }
)
```

---

## 3.5 — Otimizações adicionais (quando necessário)

### 3.5a — Conversation upsert com transaction

**Problema:** `canCreateConversation` + `incrementConversationCount` não são atômicos (race condition).

**Solução:** Wrapping em `db.$transaction`:
```typescript
const conversation = await db.$transaction(async (tx) => {
  const existing = await tx.conversation.findUnique({ where: { workspaceId_channelId_externalId: { ... } } })
  if (existing) return existing

  const ws = await tx.workspace.findUnique({ where: { id: workspaceId } })
  if (ws.conversationsThisMonth >= ws.maxConversationsPerMonth) throw new Error('Limit reached')

  const conv = await tx.conversation.create({ data: { ... } })
  await tx.workspace.update({ where: { id: workspaceId }, data: { conversationsThisMonth: { increment: 1 } } })
  return conv
})
```

### 3.5b — Batch Pusher events

Pusher suporta `trigger_batch` para até 10 events em 1 call:
```typescript
await pusherServer.triggerBatch([
  { channel: `workspace-${wsId}`, name: 'new-message', data: msg1 },
  { channel: `workspace-${wsId}`, name: 'conversation-updated', data: conv1 },
])
```

Útil quando o webhook precisa enviar múltiplos events.

### 3.5c — Connection pooling separado para workers

Se usando Railway worker, criar URL separada com session mode (port 5432) para queries longas:
```
DATABASE_URL=postgresql://...@pooler:6543/postgres?pgbouncer=true  # Vercel (transaction mode)
DATABASE_URL_DIRECT=postgresql://...@db:5432/postgres               # Railway worker (session mode)
```

---

## CHECKLIST FINAL FASE 3

1. [ ] Implementar `lib/cache.ts` com Redis cache-aside pattern
2. [ ] Aplicar cache no webhook UazAPI (channel lookup por instanceToken)
3. [ ] Aplicar cache no vendedor (AiSalesConfig lookup)
4. [ ] Adicionar invalidação nas rotas de settings (channel disconnect, AI config save)
5. [ ] Avaliar latência do webhook (se >500ms p95, implementar receiver/processor split)
6. [ ] Se necessário: extrair `processMessage` para `lib/webhooks/uazapi-processor.ts`
7. [ ] Se necessário: criar Inngest `webhook/uazapi` function
8. [ ] Avaliar GB-hours do vendedor SDR (se >50%, configurar Railway worker)
9. [ ] Criar `GET /api/admin/health` endpoint
10. [ ] Configurar health check Inngest cron (hourly)
11. [ ] Documentar thresholds de alertas no README ou CLAUDE.md
12. [ ] Wrapping conversation creation em transaction (se race conditions observadas)
13. [ ] Batch Pusher events onde aplicável

---

## DECISÃO: Quando fazer o quê

| Gatilho observado | Ação |
|-------------------|------|
| Webhook latency > 500ms p95 | 3.1 (Cache) → 3.2 (Receiver/Processor split) |
| Vercel GB-hours > 500/mês | 3.3 (Railway worker para IA) |
| Supabase connections > 160/200 | Aumentar max pool + 3.1 (Cache) |
| Conversation count race condition | 3.5a (Transaction wrapping) |
| Pusher events > 150K/dia | 3.5b (Batch events) |
| Inngest runs > 80K/mês | Avaliar Inngest Pro ($50/mês) ou mover mais functions para Railway |

**Regra de ouro:** Não implementar nada da Fase 3 preemptivamente. Monitorar métricas e agir quando thresholds são atingidos.
