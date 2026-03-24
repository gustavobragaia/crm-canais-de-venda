# FASE 1: QUICK WINS — Otimização de Capacidade (prioridade imediata)

**Esforço:** ~30 min | **Impacto:** 3-5x throughput | **Quando:** AGORA

---

## 1.1 — Aumentar DB pool para max: 5

**Arquivo:** `lib/db.ts` (linha 9)

**Antes:**
```typescript
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 1 })
```

**Depois:**
```typescript
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 5 })
```

**Por que 5 e não mais:**
- Supabase Transaction mode (port 6543) suporta 200 conexões no Pro
- Cada instância serverless cria seu próprio pool
- Com ~100 funções concorrentes × 5 = 500 conexões teóricas — mas na prática Vercel reaproveita instâncias
- 5 é seguro para Transaction mode; 10+ pode causar `MaxClientsInSessionMode` se alguém configurar errado a URL
- Desbloqueia `Promise.all` real para queries paralelas em analytics e conversation list

**Edge cases e testes:**
- [ ] Verificar que `DATABASE_URL` usa port 6543 + `?pgbouncer=true` (OBRIGATÓRIO)
- [ ] Se usar port 5432 (session mode), max: 5 pode esgotar o pool rapidamente
- [ ] Testar `GET /api/analytics/overview` (usa Promise.all com 6+ queries) — deve ficar mais rápido
- [ ] Testar `GET /api/conversations` (usa Promise.all para count + find) — deve ficar mais rápido
- [ ] Monitorar Supabase dashboard → "Active connections" durante teste de carga
- [ ] Se houver erro `remaining connection slots are reserved`, reduzir para max: 3

**Possíveis falhas:**
- `DATABASE_URL` apontando para port 5432 → erro de conexão sob carga
- Pool starvation se uma query travar (timeout do PgBouncer = 30s por default)

---

## 1.2 — Adicionar index em `instanceToken`

**Arquivo:** `prisma/schema.prisma` — model Channel (entre linhas 108-109)

**Antes:**
```prisma
  @@index([instanceName])
  @@map("channels")
```

**Depois:**
```prisma
  @@index([instanceName])
  @@index([instanceToken])
  @@map("channels")
```

**Aplicar:** `npx prisma db push` (não precisa de migration, é só index)

**Por que é crítico:**
- O webhook UazAPI (`app/api/webhooks/uazapi/route.ts` linha 64) faz `channel.findFirst({ where: { instanceToken: payload.token } })` em CADA evento
- Sem index = full table scan. Com 100 canais, cada webhook faz scan em 100 rows
- Com index = O(1) lookup

**Edge cases e testes:**
- [ ] Executar `npx prisma db push` e verificar que o index foi criado
- [ ] Verificar no Supabase SQL editor: `SELECT indexname FROM pg_indexes WHERE tablename = 'channels';` — deve listar `channels_instanceToken_idx`
- [ ] Testar envio de mensagem WhatsApp via UazAPI e verificar que o webhook processa normalmente
- [ ] Garantir que `npx prisma generate` roda depois do push (gerar client atualizado)

**Possíveis falhas:**
- `db push` pode falhar se houver rows com `instanceToken = NULL` — index nullable é suportado, não deve ser problema
- Se o schema.prisma estiver dessincronizado com o banco, `db push` pode tentar dropar colunas — sempre revisar o output antes de confirmar

---

## 1.3 — maxDuration nas rotas críticas

### 1.3a — Disparador

**Arquivo:** `app/api/agents/disparador/route.ts` — adicionar no topo (após imports, antes do export)

**Adicionar na linha 5 (após imports):**
```typescript
export const maxDuration = 300 // 5 min — bulk dispatch can take long
```

**Por que 300:**
- Pro plan permite até 300s
- 1000 contatos × ~200ms cada = 200s + delays entre batches
- 300s cobre dispatches de até ~1500 contatos
- Acima disso, precisa de Inngest (Fase 2)

**ATENÇÃO:** Este `maxDuration` se aplica às funções POST e GET neste arquivo. O GET é rápido, não tem problema. A rota `POST /api/agents/disparador` faz fire-and-forget para `/api/agents/disparador/process`. O `maxDuration` deve ir TAMBÉM (e principalmente) no arquivo de process.

**Verificar se existe:** `app/api/agents/disparador/process/route.ts` — se existir, adicionar `maxDuration = 300` lá também. Se não existir, o processamento roda dentro do fire-and-forget fetch e o `maxDuration` no route principal não ajuda o processo de envio.

### 1.3b — Vendedor Process

**Arquivo:** `app/api/agents/vendedor/process/route.ts` — adicionar na linha 3 (após imports)

**Adicionar:**
```typescript
export const maxDuration = 60 // vendedor debounce (15s) + AI call + send
```

**Por que 60:**
- Debounce default = 15s
- OpenAI call = 1-5s
- Send messages (3-4 lines × 2s each) = 6-8s
- Total worst case = ~30s, mas com margem 60s é seguro
- NÃO colocar 300 aqui — cada invocação consome GB-hours da Vercel, e o debounce de 15s já é caro

**Edge cases e testes:**
- [ ] Deploy na Vercel e verificar no dashboard Functions → que o timeout mostra 300s para disparador e 60s para vendedor
- [ ] Testar disparo de 100 contatos — deve completar sem timeout
- [ ] Testar disparo de 500 contatos — deve completar em ~120s
- [ ] Testar vendedor com resposta de 4+ linhas — deve completar sem corte
- [ ] Verificar que a rota GET do disparador não é afetada negativamente (é rápida, ok)

**Possíveis falhas:**
- Se o plano Vercel for Free (não Pro), `maxDuration > 10` é ignorado e a função morre em 10s
- Se `maxDuration` for colocado depois de um `export async function`, pode não ser reconhecido — deve ser top-level export
- O fire-and-forget do disparador (`fetch` na linha 54) chama `/api/agents/disparador/process` — se essa rota NÃO EXISTE, o processamento roda no escopo do POST principal que faz o fetch, e o maxDuration do POST é o que importa

---

## 1.4 — Pusher fire-and-forget no webhook UazAPI

**Arquivo:** `app/api/webhooks/uazapi/route.ts` (linhas 179-183)

**Antes:**
```typescript
    await pusherServer.trigger(
      `workspace-${channel.workspaceId}`,
      isHistory ? 'history-message' : 'new-message',
      { conversationId: conversation.id, message: savedMessage }
    )
```

**Depois:**
```typescript
    pusherServer.trigger(
      `workspace-${channel.workspaceId}`,
      isHistory ? 'history-message' : 'new-message',
      { conversationId: conversation.id, message: savedMessage }
    ).catch(err => console.error('[UAZAPI WEBHOOK] Pusher trigger failed:', err))
```

**Mudança:** Remover `await`, adicionar `.catch()`.

**Por que:**
- Pusher é para UI real-time — se falhar, a mensagem já está no banco
- O frontend pode fazer refresh para buscar mensagens
- Bloquear a resposta do webhook por causa do Pusher é desperdício

**Edge cases e testes:**
- [ ] Enviar mensagem WhatsApp e verificar que aparece em real-time no CRM (Pusher funciona)
- [ ] Desconectar internet momentaneamente durante envio — verificar que o webhook retorna 200 mesmo se Pusher falhar
- [ ] Verificar que o log `[UAZAPI WEBHOOK] Pusher trigger failed:` aparece nos logs da Vercel quando Pusher falha
- [ ] Testar com Pusher dashboard metrics — eventos devem continuar sendo entregues normalmente

**Possíveis falhas:**
- Se o Pusher falhar silenciosamente por minutos, o UI não atualiza — mas a mensagem está no banco e um refresh manual resolve
- Race condition: se a UI recebe o evento Pusher ANTES do banco ter commitado a mensagem — improvável pois o DB write é síncrono antes do trigger

---

## 1.5 — Media download fire-and-forget nos webhooks Instagram/Facebook

### Estratégia
Salvar a mensagem imediatamente com um placeholder para mídia, e processar o download/upload em background (fire-and-forget). Igual ao padrão já usado no webhook UazAPI.

### 1.5a — Instagram

**Arquivo:** `app/api/webhooks/instagram/route.ts` (linhas 115-152)

**Antes (linhas 115-152):**
```typescript
        let mediaType: string | undefined
        let mediaUrl: string | undefined
        let mediaMime: string | undefined
        const attachment = messaging.message?.attachments?.[0]

        if (attachment?.payload?.url && attachment.type !== 'fallback') {
          const rawType = MEDIA_TYPE_MAP[attachment.type] ?? 'document'
          try {
            const accessToken = channel.accessToken ? decrypt(channel.accessToken) : ''
            const { buffer, contentType } = await downloadMetaMedia(attachment.payload.url, accessToken)
            const ext = contentType.split('/')[1]?.split(';')[0] ?? 'bin'
            const filename = `meta-ig-${Date.now()}.${ext}`
            const blob = await put(`media/${filename}`, buffer, { access: 'public', contentType })
            mediaType = rawType
            mediaUrl = blob.url
            mediaMime = contentType
          } catch (err) {
            console.error('[IG WEBHOOK] Failed to download/upload media:', err)
          }
        }

        const textContent = messaging.message?.text ?? ''
        const content = textContent || (mediaType ? (MEDIA_PLACEHOLDER[mediaType] ?? '[Mídia]') : '')
        const preview = content.slice(0, 100)

        const savedMessage = await db.message.create({
          data: {
            conversationId: conversation.id,
            workspaceId: channel.workspaceId,
            direction: 'INBOUND',
            content,
            externalId: messaging.message!.mid,
            status: 'DELIVERED',
            ...(mediaType ? { mediaType, mediaUrl, mediaMime } : {}),
          },
        })
```

**Depois:**
```typescript
        const attachment = messaging.message?.attachments?.[0]
        const hasMedia = attachment?.payload?.url && attachment.type !== 'fallback'
        const mediaType = hasMedia ? (MEDIA_TYPE_MAP[attachment.type] ?? 'document') : undefined

        const textContent = messaging.message?.text ?? ''
        const content = textContent || (mediaType ? (MEDIA_PLACEHOLDER[mediaType] ?? '[Mídia]') : '')
        const preview = content.slice(0, 100)

        // Save message immediately (without media URL — will be updated async)
        const savedMessage = await db.message.create({
          data: {
            conversationId: conversation.id,
            workspaceId: channel.workspaceId,
            direction: 'INBOUND',
            content,
            externalId: messaging.message!.mid,
            status: 'DELIVERED',
            ...(mediaType ? { mediaType } : {}),
          },
        })

        // Fire-and-forget: download media + persist + update message
        if (hasMedia) {
          (async () => {
            try {
              const accessToken = channel.accessToken ? decrypt(channel.accessToken) : ''
              const { buffer, contentType } = await downloadMetaMedia(attachment.payload.url, accessToken)
              const ext = contentType.split('/')[1]?.split(';')[0] ?? 'bin'
              const filename = `meta-ig-${Date.now()}.${ext}`
              const blob = await put(`media/${filename}`, buffer, { access: 'public', contentType })
              await db.message.update({
                where: { id: savedMessage.id },
                data: { mediaUrl: blob.url, mediaMime: contentType },
              })
              pusherServer.trigger(
                `workspace-${channel.workspaceId}`,
                'message-updated',
                { conversationId: conversation.id, messageId: savedMessage.id, mediaUrl: blob.url, mediaMime: contentType }
              ).catch(() => {})
            } catch (err) {
              console.error('[IG WEBHOOK] Failed to download/upload media:', err)
            }
          })()
        }
```

### 1.5b — Facebook

**Arquivo:** `app/api/webhooks/facebook/route.ts` (linhas 109-145)

Mesma refatoração do Instagram, apenas mudando `meta-ig-` para `meta-fb-` no filename e `[IG WEBHOOK]` para `[FB WEBHOOK]` nos logs.

### ATENÇÃO para o frontend

O frontend precisa lidar com mensagens que chegam **sem `mediaUrl`** mas com `mediaType`. Quando o evento `message-updated` chega com `mediaUrl`, o frontend deve atualizar a mensagem.

**Verificar:** Se o frontend já lida com o evento `message-updated` — o webhook UazAPI já usa esse padrão (linhas 208-226 do uazapi webhook). Se sim, o frontend já sabe atualizar.

**Edge cases e testes:**
- [ ] Enviar imagem no Instagram DM → verificar que mensagem aparece imediatamente com placeholder
- [ ] Após 1-3s, verificar que a imagem aparece (evento `message-updated` via Pusher)
- [ ] Enviar vídeo grande (>5MB) no Facebook Messenger → não deve causar timeout no webhook
- [ ] Enviar mensagem de texto puro → comportamento inalterado
- [ ] Enviar attachment tipo `fallback` (link preview) → deve ser ignorado como antes
- [ ] Se Meta CDN estiver lento, a mensagem de texto já está salva — media chega depois
- [ ] Se download da mídia falhar, mensagem fica sem media URL mas com `mediaType` — frontend deve mostrar "Mídia não disponível"
- [ ] Verificar que o Pusher `message-updated` é consumido pelo frontend (`usePusher` hook ou listener existente)

**Possíveis falhas:**
- Frontend não escuta `message-updated` para Instagram/Facebook → precisa verificar antes de implementar
- Meta CDN URL expira em ~15 min — se a função serverless morrer antes do download, a mídia é perdida. Inngest (Fase 2) resolve com retry
- Buffer de vídeos grandes pode consumir muita memória (1024MB limit na Vercel) — para Fase 3

### IMPORTANTE: Pusher nos webhooks Instagram/Facebook

Os webhooks Instagram e Facebook TAMBÉM fazem `await pusherServer.trigger(...)` nas linhas 163/156. Tornar fire-and-forget igual ao UazAPI:

**Instagram linha 163:**
```typescript
// Antes:
await pusherServer.trigger(...)
// Depois:
pusherServer.trigger(...).catch(err => console.error('[IG WEBHOOK] Pusher failed:', err))
```

**Facebook linha 156:**
```typescript
// Antes:
await pusherServer.trigger(...)
// Depois:
pusherServer.trigger(...).catch(err => console.error('[FB WEBHOOK] Pusher failed:', err))
```

---

## CHECKLIST FINAL FASE 1

1. [ ] `lib/db.ts` — max: 1 → max: 5
2. [ ] `prisma/schema.prisma` — `@@index([instanceToken])` no Channel model
3. [ ] `npx prisma db push` + `npx prisma generate`
4. [ ] `app/api/agents/disparador/route.ts` — `export const maxDuration = 300`
5. [ ] Verificar/criar `app/api/agents/disparador/process/route.ts` — `export const maxDuration = 300`
6. [ ] `app/api/agents/vendedor/process/route.ts` — `export const maxDuration = 60`
7. [ ] `app/api/webhooks/uazapi/route.ts` linha 179 — remover `await` do Pusher, add `.catch()`
8. [ ] `app/api/webhooks/instagram/route.ts` — media fire-and-forget + Pusher fire-and-forget
9. [ ] `app/api/webhooks/facebook/route.ts` — media fire-and-forget + Pusher fire-and-forget
10. [ ] Testar envio WhatsApp (mensagem chega, real-time funciona)
11. [ ] Testar envio Instagram com imagem (placeholder → imagem)
12. [ ] Testar disparo de 100+ contatos sem timeout
13. [ ] Verificar Supabase connections no dashboard
