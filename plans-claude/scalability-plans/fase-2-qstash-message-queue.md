# Fase 2: Message Queue — QStash (COMPLETO)

## Status

### Fase 2A — Fire-and-forget → QStash ✅ IMPLEMENTADO

Side-effects (transcription, media-persist, profile-fetch, vendedor-check, dispatch, human-takeover,
qualify-lead) já foram migrados para workers QStash. Webhooks ainda fazem 5-7 DB calls síncronos.

### Fase 2B — Zero DB nos Webhooks 🔲 A IMPLEMENTAR

Mover TODOS os DB calls dos webhooks para um worker `message-ingest`. Webhook faz apenas
parse + publish ao QStash. Objetivo: escalabilidade (50+ webhooks simultâneos sem saturar pool DB).

---

## Fase 2B: Webhooks "Parse + Publish" — Zero DB

### Contexto

Cada webhook (UazAPI, Facebook, Instagram) faz 5-7 DB round-trips síncronos (~30-50ms cada = 200-350ms).
Com 30+ workspaces, 50 webhooks simultâneos = 50 conexões Prisma no Supabase pool (port 6543, max limitado).
Sob carga, conexões esgotam e mensagens falham.

**Solução:** Webhook faz ZERO DB calls. Apenas parse + `publishToQueue()`. Worker QStash faz tudo.
**Tradeoff:** Mensagens demoram 1-2s para UI (vs ~250ms). Aceitável para escalabilidade.

### Arquitetura

```
WEBHOOK (~10-30ms, ZERO DB)      QSTASH              WORKER message-ingest (~300-600ms)
┌────────────────────┐           ┌─────────┐         ┌──────────────────────────────────┐
│ Parse payload      │           │         │         │ 1. Channel lookup                │
│ Normalize fields   │──publish─>│ DEDUP   │──────>  │ 2. Billing gate (Redis SETNX)    │
│ Return 200         │           │ by msgId│         │ 3. Conversation upsert           │
└────────────────────┘           └─────────┘         │ 4. Message dedup + create        │
                                                     │ 5. Metadata update               │
  ZERO imports de:                                   │ 6. Pusher trigger                │
  - db (Prisma)                                      │ 7. Queue side-effects            │
  - billing                                          │    (transcribe, media-persist,   │
  - pusher                                           │    vendedor, dispatch, etc.)     │
                                                     └──────────────────────────────────┘
```

**Deduplicação em 2 níveis:**

1. QStash `deduplicationId: "msg-{externalId}"` → rejeita publish duplicado
2. Worker `db.message.findFirst({ externalId })` → rejeita se já existe no DB

---

## Fase 2B.1 — Payload Normalizado + Tipos (15min)

### Criar `lib/queue/types.ts`

```typescript
/**
 * Payload normalizado para o worker message-ingest.
 * Provider-agnostic: UazAPI, Facebook e Instagram produzem o mesmo shape.
 */
export type MessageIngestPayload = {
  // Routing
  provider: "UAZAPI" | "FACEBOOK" | "INSTAGRAM";
  channelIdentifier: string; // instanceToken (UazAPI) | pageId (FB) | businessAccountId (IG)

  // Contato
  contactExternalId: string; // chatid (UazAPI) | senderId (Meta)
  contactName: string;
  contactPhone?: string;
  contactPhotoUrl?: string;

  // Mensagem
  externalId: string; // msg.messageid (UazAPI) | messaging.message.mid (Meta)
  direction: "INBOUND" | "OUTBOUND";
  content: string; // texto ou placeholder ("[Imagem]", "[Áudio]", etc.)
  senderName?: string;
  sentAt: string; // ISO string

  // Mídia
  mediaType?: string; // 'image' | 'video' | 'audio' | 'document'
  mediaUrl?: string;
  mediaMime?: string;
  mediaName?: string;

  // Flags
  isHistory?: boolean;
  aiGenerated?: boolean;

  // UazAPI-specific (downstream: transcription, media-persist)
  instanceToken?: string;
  mediaMessageId?: string; // UazAPI msg.messageid para download

  // Meta-specific (downstream: media-persist, profile-fetch)
  attachmentUrl?: string; // URL do CDN Meta (expira ~15min)
  attachmentType?: string; // 'image' | 'video' | 'audio' | 'file'
};

export type MessageStatusUpdatePayload = {
  provider: "UAZAPI";
  channelIdentifier: string;
  externalIds: string[];
  status: "SENT" | "DELIVERED" | "READ" | "FAILED";
};

export type ChannelStatusUpdatePayload = {
  provider: "UAZAPI";
  channelIdentifier: string;
  status: "connected" | "disconnected" | "connecting";
};
```

**Testes 2B.1:**

- [ ] `import { MessageIngestPayload } from '@/lib/queue/types'` sem erro de compilação

---

## Fase 2B.2 — Worker `message-ingest` (1-2h)

### Criar `app/api/queue/message-ingest/route.ts`

**Este é o worker mais complexo. Ele faz TUDO que os 3 webhooks faziam.**

**Imports necessários:**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { verifyQStashSignature, parseQStashBody } from "@/lib/queue/verify";
import type { MessageIngestPayload } from "@/lib/queue/types";
import { db } from "@/lib/db";
import { pusherServer } from "@/lib/pusher";
import { redis } from "@/lib/redis";
import { publishToQueue } from "@/lib/qstash";
import { processMessageContent } from "@/lib/agents/vendedor";
import {
  addToDebounceBuffer,
  setDebounceTimestamp,
} from "@/lib/agents/vendedor-redis";
import { incrementConversationCount } from "@/lib/billing/conversationGate";

export const maxDuration = 60;
```

**Lógica completa do worker — 9 steps:**

#### STEP 1 — Channel lookup (provider-specific)

```typescript
let channel;
if (payload.provider === "UAZAPI") {
  channel = await db.channel.findFirst({
    where: {
      instanceToken: payload.channelIdentifier,
      provider: "UAZAPI",
      type: "WHATSAPP",
    },
  });
} else if (payload.provider === "FACEBOOK") {
  channel = await db.channel.findFirst({
    where: {
      pageId: payload.channelIdentifier,
      type: "FACEBOOK",
      isActive: true,
    },
  });
} else {
  channel = await db.channel.findFirst({
    where: {
      businessAccountId: payload.channelIdentifier,
      type: "INSTAGRAM",
      isActive: true,
    },
  });
}
if (!channel)
  return NextResponse.json({ skipped: true, reason: "channel-not-found" });
```

**Edge case:** Canal deletado entre publish e worker → skip. Retornar 200 (não retentar).

#### STEP 2 — Message dedup (DB-level, segundo nível de proteção)

```typescript
if (payload.externalId) {
  const existing = await db.message.findFirst({
    where: { externalId: payload.externalId },
  });
  if (existing) {
    // Mensagem já existe — trigger Pusher mesmo assim (caso retry perdeu o Pusher)
    await pusherServer
      .trigger(
        `workspace-${channel.workspaceId}`,
        payload.isHistory ? "history-message" : "new-message",
        { conversationId: existing.conversationId, message: existing },
      )
      .catch(() => {});
    return NextResponse.json({ skipped: true, reason: "duplicate" });
  }
}
```

**Edge case:** Worker crashou após criar mensagem mas antes do Pusher. No retry, dedup encontra
a mensagem. O Pusher é re-disparado aqui. Frontend recebe o event e mostra a mensagem. **Safe.**

**Edge case:** Mensagem sem `externalId` (outbound manual UazAPI raro): pula dedup. Risco de
duplicata é baixo (mensagens outbound não são retentadas pelo webhook provider).

#### STEP 3 — Billing gate (Redis atomic)

```typescript
const { allowed, isNew } = await tryCreateConversationAtomic(
  channel.workspaceId,
  channel.id,
  payload.contactExternalId,
);
if (!allowed) {
  console.log(
    `[QUEUE/MESSAGE-INGEST] conversation limit reached ws=${channel.workspaceId}`,
  );
  return NextResponse.json({ skipped: true, reason: "conversation-limit" });
}
```

`tryCreateConversationAtomic` usa Redis SETNX — ver Fase 2B.4.

**Edge case:** 2 workers para o MESMO contato simultaneamente: SETNX retorna 1 para o primeiro,
0 para o segundo. Apenas o primeiro incrementa o counter. O `upsert` é idempotente. **Safe.**

**Edge case:** 2 workers para contatos DIFERENTES simultaneamente: ambos SETNX retornam 1. Ambos
leem `conversationsThisMonth=99` (limite=100). Ambos passam. Resultado: 101 conversas (1 a mais
que o limite). Margem aceitável. Se precisar exatidão: usar Redis INCR para o counter.

#### STEP 4 — Conversation upsert

```typescript
const conversation = await db.conversation.upsert({
  where: {
    workspaceId_channelId_externalId: {
      workspaceId: channel.workspaceId,
      channelId: channel.id,
      externalId: payload.contactExternalId,
    },
  },
  create: {
    workspaceId: channel.workspaceId,
    channelId: channel.id,
    externalId: payload.contactExternalId,
    contactName: payload.contactName,
    contactPhone: payload.contactPhone,
    contactPhotoUrl: payload.contactPhotoUrl,
    status: "UNASSIGNED",
    pipelineStage: "Não Atribuído",
  },
  update: {
    contactName: payload.contactName,
    ...(payload.contactPhotoUrl
      ? { contactPhotoUrl: payload.contactPhotoUrl }
      : {}),
  },
});
```

**Edge case para Meta:** Facebook/Instagram cria com `"Facebook User ABC123"`. O `profile-fetch`
worker atualiza o nome depois. O upsert.update atualiza contactName — se o worker já rodou e
o nome real já está no DB, a próxima mensagem vai sobrescrever com o placeholder novamente.
**FIX:** Para Meta, NÃO atualizar contactName no update se já existe:

```typescript
// Para Meta: não sobrescrever nome real com placeholder
update: payload.provider === 'UAZAPI'
  ? { contactName: payload.contactName, ...(payload.contactPhotoUrl ? { contactPhotoUrl: payload.contactPhotoUrl } : {}) }
  : { ...(payload.contactPhotoUrl ? { contactPhotoUrl: payload.contactPhotoUrl } : {}) },
```

#### STEP 5 — Increment conversation count

```typescript
if (isNew) {
  await incrementConversationCount(channel.workspaceId);
}
```

#### STEP 6 — Create message

```typescript
const savedMessage = await db.message.create({
  data: {
    conversationId: conversation.id,
    workspaceId: channel.workspaceId,
    direction: payload.direction,
    content: payload.content,
    externalId: payload.externalId || undefined,
    status: payload.direction === "OUTBOUND" ? "SENT" : "DELIVERED",
    senderName: payload.senderName ?? null,
    sentAt: new Date(payload.sentAt),
    aiGenerated: payload.aiGenerated ?? false,
    ...(payload.mediaType
      ? {
          mediaType: payload.mediaType,
          mediaUrl: payload.mediaUrl,
          mediaMime: payload.mediaMime,
          mediaName: payload.mediaName,
        }
      : {}),
  },
});
```

#### STEP 7 — Conversation metadata update

```typescript
await db.conversation.update({
  where: { id: conversation.id },
  data: {
    lastMessageAt: new Date(payload.sentAt),
    lastMessagePreview: payload.content.slice(0, 100),
    ...(payload.direction === "INBOUND"
      ? { unreadCount: { increment: 1 } }
      : {}),
  },
});
```

#### STEP 8 — Pusher notification

```typescript
pusherServer
  .trigger(
    `workspace-${channel.workspaceId}`,
    payload.isHistory ? "history-message" : "new-message",
    { conversationId: conversation.id, message: savedMessage },
  )
  .catch((err) => console.error("[QUEUE/MESSAGE-INGEST] Pusher failed:", err));
```

#### STEP 9 — Queue side-effects (INBOUND + !isHistory only)

```typescript
if (payload.direction === "INBOUND" && !payload.isHistory) {
  const workspaceId = channel.workspaceId;
  const conversationId = conversation.id;

  // 9A. Audio transcription (UazAPI only)
  if (
    payload.mediaType === "audio" &&
    payload.instanceToken &&
    payload.mediaMessageId
  ) {
    await publishToQueue("/api/queue/transcribe", {
      messageId: savedMessage.id,
      conversationId,
      workspaceId,
      instanceToken: payload.instanceToken,
      mediaMessageId: payload.mediaMessageId,
    }).catch((err) =>
      console.error("[QUEUE/MESSAGE-INGEST] transcribe error:", err),
    );
  }

  // 9B. Media persist
  if (
    payload.mediaType &&
    ["image", "video", "document"].includes(payload.mediaType)
  ) {
    if (
      payload.provider === "UAZAPI" &&
      payload.instanceToken &&
      payload.mediaMessageId
    ) {
      await publishToQueue("/api/queue/media-persist", {
        messageId: savedMessage.id,
        conversationId,
        workspaceId,
        source: "uazapi",
        instanceToken: payload.instanceToken,
        mediaMessageId: payload.mediaMessageId,
        mediaMime: payload.mediaMime,
      }).catch((err) =>
        console.error("[QUEUE/MESSAGE-INGEST] media-persist error:", err),
      );
    } else if (payload.attachmentUrl && channel.accessToken) {
      await publishToQueue("/api/queue/media-persist", {
        messageId: savedMessage.id,
        conversationId,
        workspaceId,
        source: "meta",
        mediaUrl: payload.attachmentUrl,
        accessToken: channel.accessToken,
        mediaMime: payload.attachmentType,
      }).catch((err) =>
        console.error("[QUEUE/MESSAGE-INGEST] media-persist error:", err),
      );
    }
  }

  // 9C. Profile fetch (Meta only, new conversations)
  if (isNew && channel.accessToken && payload.provider !== "UAZAPI") {
    await publishToQueue("/api/queue/profile-fetch", {
      conversationId,
      workspaceId,
      senderId: payload.contactExternalId,
      channelType: payload.provider,
      accessToken: channel.accessToken,
    }).catch((err) =>
      console.error("[QUEUE/MESSAGE-INGEST] profile-fetch error:", err),
    );
  }

  // 9D. Dispatch response
  if (conversation.pipelineStage === "Disparo Enviado") {
    await publishToQueue("/api/queue/dispatch-response", {
      conversationId,
      workspaceId,
    }).catch((err) =>
      console.error("[QUEUE/MESSAGE-INGEST] dispatch-response error:", err),
    );
  }

  // 9E. Vendedor SDR
  if (conversation.aiSalesEnabled && conversation.dispatchListId) {
    const processedContent = await processMessageContent({
      content: payload.content,
      mediaType: payload.mediaType ?? null,
      mediaUrl: payload.mediaUrl ?? null,
      transcription: null,
    }).catch(() => null);

    if (processedContent) {
      const scheduledAt = Date.now();
      await addToDebounceBuffer(conversationId, processedContent);
      await setDebounceTimestamp(conversationId, scheduledAt);
      await publishToQueue(
        "/api/queue/vendedor-check",
        {
          conversationId,
          workspaceId,
          scheduledAt,
        },
        { delay: 15 },
      ).catch((err) =>
        console.error("[QUEUE/MESSAGE-INGEST] vendedor error:", err),
      );
    }
  }
}

// 9F. Human takeover (OUTBOUND only)
if (
  payload.direction === "OUTBOUND" &&
  !payload.aiGenerated &&
  conversation.aiSalesEnabled &&
  conversation.dispatchListId
) {
  await publishToQueue("/api/queue/human-takeover", {
    conversationId: conversation.id,
    textContent: payload.content,
  }).catch((err) =>
    console.error("[QUEUE/MESSAGE-INGEST] human-takeover error:", err),
  );
}
```

**NOTA sobre `conversation.pipelineStage` e `conversation.aiSalesEnabled`:** O `upsert` no Step 4
retorna o conversation, mas **sem** os campos `pipelineStage`, `aiSalesEnabled`, `dispatchListId`.
**FIX:** Adicionar `select` no upsert ou fazer um `findUnique` separado após o upsert:

```typescript
const convDetails = await db.conversation.findUnique({
  where: { id: conversation.id },
  select: { pipelineStage: true, aiSalesEnabled: true, dispatchListId: true },
});
```

Usar `convDetails` nos steps 9D, 9E, 9F.

**Testes 2B.2:**

- [ ] Worker cria conversa nova + mensagem quando não existem
- [ ] Worker faz upsert (não duplica) quando conversa já existe
- [ ] Worker rejeita mensagem duplicada por externalId
- [ ] Worker re-dispara Pusher em mensagem duplicada (retry safety)
- [ ] Worker respeita billing limit
- [ ] Worker dispara Pusher `new-message` com payload correto
- [ ] Worker enfileira `transcribe` para áudio UazAPI
- [ ] Worker enfileira `media-persist` para imagem UazAPI e Meta
- [ ] Worker enfileira `profile-fetch` para nova conversa Meta
- [ ] Worker enfileira `dispatch-response` para conversa dispatch
- [ ] Worker enfileira `vendedor-check` com delay 15s
- [ ] Worker enfileira `human-takeover` para OUTBOUND
- [ ] Meta: não sobrescreve contactName real com placeholder no update

---

## Fase 2B.3 — Workers auxiliares (30min)

### Criar `app/api/queue/message-status-update/route.ts`

Recebe `MessageStatusUpdatePayload`. Para cada `externalId`:

1. `db.message.findFirst({ externalId })`
2. Skip se não existe ou mesmo status
3. `db.message.update({ status, readAt?, deliveredAt? })`
4. `pusherServer.trigger('message-updated', { messageId, status })`

**Config QStash:** `retries: 2`

**Edge cases:**

- IDs que não existem no DB (mensagens antigas) → skip
- Status fora de ordem (READ antes de DELIVERED) → aceitar, não verificar ordem
- Array grande (50+) → loop sequencial ok (workers sem rate limit externo)

**Testes 2B.3a:**

- [ ] READ → message.readAt atualizado + Pusher event
- [ ] DELIVERED → message.deliveredAt atualizado
- [ ] ID inexistente → skip sem erro
- [ ] Status repetido → skip sem update

### Criar `app/api/queue/channel-status-update/route.ts`

Recebe `ChannelStatusUpdatePayload`:

1. `db.channel.findFirst({ instanceToken: channelIdentifier, provider: 'UAZAPI' })`
2. `connected` → `isActive: true, webhookVerifiedAt: new Date()`
3. `disconnected` → `isActive: false` + Pusher `channel-status-update`
4. `connecting` → noop, retornar 200

**Config QStash:** `retries: 2`

**Testes 2B.3b:**

- [ ] `connected` → channel.isActive = true
- [ ] `disconnected` → channel.isActive = false + Pusher event
- [ ] `connecting` → nenhuma mudança

---

## Fase 2B.4 — Billing Gate Redis (30min)

### Modificar `lib/billing/conversationGate.ts`

Adicionar função com Redis atomic SETNX:

```typescript
import { redis } from "@/lib/redis";

/**
 * Atomic billing gate for concurrent workers.
 * Uses Redis SETNX to prevent double-counting new conversations.
 */
export async function tryCreateConversationAtomic(
  workspaceId: string,
  channelId: string,
  externalId: string,
): Promise<{ allowed: boolean; isNew: boolean }> {
  const convKey = `conv-lock:${workspaceId}:${channelId}:${externalId}`;

  // SETNX: 1 se criou key (conversa nova), 0 se já existia
  const wasSet = await redis.setnx(convKey, "1");
  if (wasSet) await redis.expire(convKey, 300); // TTL 5min

  const isNew = wasSet === 1;

  if (!isNew) {
    // Conversa existente ou outro worker está criando → allowed
    return { allowed: true, isNew: false };
  }

  // Nova conversa — verificar limite do workspace
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { conversationsThisMonth: true, maxConversationsPerMonth: true },
  });
  if (!workspace) {
    await redis.del(convKey);
    return { allowed: false, isNew: false };
  }

  if (workspace.conversationsThisMonth >= workspace.maxConversationsPerMonth) {
    await redis.del(convKey);
    return { allowed: false, isNew: false };
  }

  return { allowed: true, isNew: true };
}
```

**Manter** `canCreateConversation` e `incrementConversationCount` originais como estão (usadas em outros contextos).

**Edge cases:**

- Redis SETNX + worker crash antes do upsert: key expira em 5min, próxima mensagem tenta de novo. Safe.
- 2 workers para mesmo contato: SETNX garante 1 só incrementa. Safe.
- 2 workers para contatos diferentes no limite: margem de ±1 conversa. Aceitável.

**Testes 2B.4:**

- [ ] Nova conversa → `{ allowed: true, isNew: true }`
- [ ] Conversa existente → `{ allowed: true, isNew: false }`
- [ ] Limite atingido → `{ allowed: false, isNew: false }` + key deletada
- [ ] 2 chamadas simultâneas para mesmo contato → só 1 `isNew: true`

---

## Fase 2B.5 — Refatorar Webhooks (1-2h)

### Refatorar `app/api/webhooks/uazapi/route.ts`

**Código completo do webhook refatorado:**

```typescript
import { NextRequest, NextResponse } from "next/server";
import {
  type UazapiWebhookPayload,
  type UazapiWebhookMessagePayload,
  type UazapiWebhookConnectionPayload,
  type UazapiWebhookHistoryPayload,
} from "@/lib/integrations/uazapi";
import { publishToQueue } from "@/lib/qstash";
import type { MessageIngestPayload } from "@/lib/queue/types";

// ZERO imports de: db, pusherServer, canCreateConversation, incrementConversationCount,
// processMessageContent, addToDebounceBuffer, setDebounceTimestamp, persistMedia

export async function GET() {
  return NextResponse.json({ status: "OK" });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const payload = JSON.parse(body) as UazapiWebhookPayload;
    console.log("[UAZAPI WEBHOOK] EventType:", payload.EventType);

    if (payload.EventType === "messages" || payload.EventType === "history") {
      await handleMessage(
        payload as UazapiWebhookMessagePayload | UazapiWebhookHistoryPayload,
        payload.EventType === "history",
      );
    } else if (payload.EventType === "messages_update") {
      await handleMessagesUpdate(payload);
    } else if (payload.EventType === "connection") {
      await handleConnection(payload as UazapiWebhookConnectionPayload);
    }

    return NextResponse.json({ status: "EVENT_RECEIVED" });
  } catch (error) {
    console.error("[UAZAPI WEBHOOK] error:", error);
    return NextResponse.json({ status: "ERROR" });
  }
}

function extractMediaType(messageType: string): string | null {
  const t = messageType.toLowerCase();
  if (t === "image" || t.includes("image")) return "image";
  if (t === "video" || t.includes("video")) return "video";
  if (t === "document" || t.includes("document") || t.includes("pdf"))
    return "document";
  if (
    t === "audio" ||
    t === "ptt" ||
    t === "myaudio" ||
    t.includes("audio") ||
    t.includes("ptt") ||
    t.includes("voice")
  )
    return "audio";
  return null;
}

async function handleMessage(
  payload: UazapiWebhookMessagePayload | UazapiWebhookHistoryPayload,
  isHistory: boolean,
) {
  const msg = payload.message;
  if (!isHistory && msg.fromMe && msg.wasSentByApi) return;

  const direction = msg.fromMe ? "OUTBOUND" : "INBOUND";
  const chat = payload.chat ?? {};
  const chatid = msg.chatid;
  const isGroup = chatid.endsWith("@g.us");

  const contactPhone = isGroup
    ? undefined
    : chat.phone
      ? chat.phone.replace(/\D/g, "")
      : chatid.replace("@s.whatsapp.net", "").replace("@lid", "");

  const contactName =
    chat.wa_contactName ||
    chat.wa_name ||
    chat.name ||
    msg.senderName ||
    contactPhone ||
    chatid.split("@")[0];
  const contactPhotoUrl = chat.imagePreview || chat.image || undefined;

  const mediaType = extractMediaType(msg.messageType) ?? undefined;
  const mediaUrl = msg.fileURL ?? msg.media?.url ?? undefined;
  const mediaMime = msg.media?.mimetype ?? undefined;
  const mediaName = msg.media?.filename ?? undefined;

  const rawText =
    msg.text ||
    (typeof msg.content === "string" ? msg.content : "") ||
    msg.media?.caption ||
    "";
  const textContent = rawText === "[Media]" && mediaType ? "" : rawText;

  const sentAt = msg.messageTimestamp
    ? new Date(
        msg.messageTimestamp > 1e12
          ? msg.messageTimestamp
          : msg.messageTimestamp * 1000,
      )
    : new Date();

  // Build display content
  const content =
    mediaType && !textContent
      ? `[${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)}]`
      : textContent || "[Mensagem]";

  const ingestPayload: MessageIngestPayload = {
    provider: "UAZAPI",
    channelIdentifier: payload.token,
    contactExternalId: chatid,
    contactName,
    contactPhone,
    contactPhotoUrl,
    externalId: msg.messageid || "",
    direction,
    content,
    senderName: msg.senderName,
    sentAt: sentAt.toISOString(),
    mediaType,
    mediaUrl,
    mediaMime,
    mediaName,
    isHistory,
    instanceToken: payload.token,
    mediaMessageId: msg.messageid || undefined,
  };

  await publishToQueue("/api/queue/message-ingest", ingestPayload, {
    deduplicationId: msg.messageid ? `msg-${msg.messageid}` : undefined,
    retries: 3,
  }).catch((err) =>
    console.error("[UAZAPI WEBHOOK] qstash publish error:", err),
  );
}

async function handleMessagesUpdate(payload: UazapiWebhookPayload) {
  const event = (
    payload as { event?: { MessageIDs?: string[]; Type?: string } }
  ).event;
  if (!event?.MessageIDs?.length) return;

  const statusMap: Record<string, string> = {
    read: "READ",
    delivered: "DELIVERED",
    sent: "SENT",
    failed: "FAILED",
  };
  const newStatus = statusMap[event.Type?.toLowerCase() ?? ""];
  if (!newStatus) return;

  await publishToQueue(
    "/api/queue/message-status-update",
    {
      provider: "UAZAPI",
      channelIdentifier: (payload as { token: string }).token,
      externalIds: event.MessageIDs,
      status: newStatus,
    },
    { retries: 2 },
  ).catch((err) =>
    console.error("[UAZAPI WEBHOOK] qstash status-update error:", err),
  );
}

async function handleConnection(payload: UazapiWebhookConnectionPayload) {
  const status = payload.data?.status;
  if (!status) return;

  await publishToQueue(
    "/api/queue/channel-status-update",
    {
      provider: "UAZAPI",
      channelIdentifier: payload.token,
      status,
    },
    { retries: 2 },
  ).catch((err) =>
    console.error("[UAZAPI WEBHOOK] qstash channel-status error:", err),
  );
}
```

**Edge case:** Se QStash falhar no publish, mensagem é perdida. Para zero data loss, adicionar
fallback síncrono no `.catch()`:

```typescript
.catch(async (err) => {
  console.error('[UAZAPI WEBHOOK] qstash failed, processing sync:', err)
  const { processMessageIngest } = await import('@/lib/queue/message-ingest-logic')
  await processMessageIngest(ingestPayload).catch(e => console.error('[FALLBACK]', e))
})
```

**Recomendação:** Implementar o fallback. É a diferença entre "escalável" e "escalável + confiável".

---

### Refatorar `app/api/webhooks/facebook/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import type { FacebookWebhookPayload } from "@/lib/integrations/facebook";
import { publishToQueue } from "@/lib/qstash";
import type { MessageIngestPayload } from "@/lib/queue/types";

// ZERO imports de: db, pusher, billing, crypto, blob, meta-common

const MEDIA_TYPE_MAP: Record<string, string> = {
  image: "image",
  video: "video",
  audio: "audio",
  file: "document",
};
const MEDIA_PLACEHOLDER: Record<string, string> = {
  image: "[Imagem]",
  video: "[Vídeo]",
  audio: "[Áudio]",
  document: "[Arquivo]",
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token ===
      (process.env.META_VERIFY_TOKEN ?? process.env.WHATSAPP_VERIFY_TOKEN)
  ) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  try {
    const payload = (await req.json()) as FacebookWebhookPayload;
    console.log("[FB WEBHOOK] entries:", payload.entry?.length ?? 0);

    if (payload.object === "page") {
      for (const entry of payload.entry) {
        for (const messaging of entry.messaging) {
          if (messaging.message?.is_echo) continue;
          const hasText = !!messaging.message?.text;
          const hasAttachment =
            (messaging.message?.attachments?.length ?? 0) > 0;
          if (!hasText && !hasAttachment) continue;

          const senderId = messaging.sender.id;
          const mid = messaging.message!.mid;

          const attachment = messaging.message?.attachments?.[0];
          const hasMedia = !!(
            attachment?.payload?.url && attachment.type !== "fallback"
          );
          const mediaType = hasMedia
            ? (MEDIA_TYPE_MAP[attachment!.type] ?? "document")
            : undefined;

          const textContent = messaging.message?.text ?? "";
          let content: string;
          if (textContent) content = textContent;
          else if (mediaType)
            content = MEDIA_PLACEHOLDER[mediaType] ?? "[Mídia]";
          else if (attachment && !attachment.payload?.url)
            content = "[Mídia temporária]";
          else if (attachment?.type === "fallback")
            content = "[Conteúdo não suportado]";
          else content = "[Mensagem]";

          const ingestPayload: MessageIngestPayload = {
            provider: "FACEBOOK",
            channelIdentifier: entry.id,
            contactExternalId: senderId,
            contactName: `Facebook User ${senderId.slice(-6)}`,
            externalId: mid,
            direction: "INBOUND",
            content,
            sentAt: new Date(messaging.timestamp || Date.now()).toISOString(),
            mediaType,
            attachmentUrl: hasMedia ? attachment?.payload?.url : undefined,
            attachmentType: hasMedia ? attachment?.type : undefined,
          };

          await publishToQueue("/api/queue/message-ingest", ingestPayload, {
            deduplicationId: `msg-${mid}`,
            retries: 3,
          }).catch((err) => console.error("[FB WEBHOOK] qstash error:", err));
        }
      }
    }
  } catch (err) {
    console.error("[FB WEBHOOK]", err);
  }
  return NextResponse.json({ status: "EVENT_RECEIVED" });
}
```

**Edge case:** `messaging.timestamp` pode ser undefined → `new Date(undefined)` = Invalid Date.
**FIX já incluído:** `new Date(messaging.timestamp || Date.now())`

---

### Refatorar `app/api/webhooks/instagram/route.ts`

**Idêntico ao Facebook** com 4 diferenças:

1. `payload.object === 'instagram'` (não `'page'`)
2. `provider: 'INSTAGRAM'`
3. `channelIdentifier: entry.id` = `businessAccountId`
4. `contactName: \`Instagram User ${senderId.slice(-6)}\``

---

**Testes 2B.5:**

- [ ] UazAPI webhook retorna em <50ms (`curl -w "%{time_total}"`)
- [ ] Facebook webhook retorna em <30ms
- [ ] Instagram webhook retorna em <30ms
- [ ] ZERO imports de `db` em qualquer webhook (verificar com `grep "from '@/lib/db'" app/api/webhooks/`)
- [ ] Job `message-ingest` aparece no QStash dashboard após cada tipo de mensagem
- [ ] Job `message-status-update` aparece após read receipt UazAPI
- [ ] Job `channel-status-update` aparece após desconexão
- [ ] Mesma mensagem 2x → QStash dashboard mostra segunda como DUPLICATE
- [ ] Mensagem sem messageid (UazAPI outbound) → publica sem dedup → worker processa

---

## Verificação End-to-End

### Teste 1: Latência

```bash
curl -w "\nTotal: %{time_total}s\n" -X POST https://SEU-DOMINIO/api/webhooks/uazapi \
  -H "Content-Type: application/json" \
  -d '{"EventType":"messages","token":"xxx","message":{"messageid":"test1","chatid":"551199@s.whatsapp.net","fromMe":false,"messageType":"text","text":"Ola","messageTimestamp":1711900000}}'
# Esperado: < 0.050s
```

### Teste 2: Mensagem completa

1. Enviar mensagem WhatsApp → webhook publica em <50ms
2. QStash dashboard → job `message-ingest` aparece
3. Worker executa → mensagem aparece na UI em <2s

### Teste 3: Deduplicação

1. Chamar webhook 2x com mesmo payload/messageid
2. QStash → 1 job (segundo rejeitado por dedup)
3. DB → 1 mensagem

### Teste 4: Billing

1. Workspace com `maxConversationsPerMonth = 2`
2. 3 contatos diferentes enviam mensagem
3. 2 primeiras → conversas criadas
4. 3ª → worker loga `conversation-limit`, mensagem não criada

### Teste 5: Carga

```bash
for i in $(seq 1 20); do
  curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" \
    -X POST https://SEU-DOMINIO/api/webhooks/uazapi \
    -H "Content-Type: application/json" \
    -d "{\"EventType\":\"messages\",\"token\":\"xxx\",\"message\":{\"messageid\":\"load-$i\",\"chatid\":\"55119900${i}@s.whatsapp.net\",\"fromMe\":false,\"messageType\":\"text\",\"text\":\"Test $i\",\"messageTimestamp\":1711900000}}" &
done
wait
# Todas 200 em < 100ms. QStash → 20 jobs message-ingest.
```

---

## Checklist Final

### 2B.1 — Types

- [ ] `lib/queue/types.ts` criado com 3 tipos

### 2B.2 — Worker principal

- [ ] `app/api/queue/message-ingest/route.ts` — 9 steps completos

### 2B.3 — Workers auxiliares

- [ ] `app/api/queue/message-status-update/route.ts`
- [ ] `app/api/queue/channel-status-update/route.ts`

### 2B.4 — Billing

- [ ] `tryCreateConversationAtomic()` em `lib/billing/conversationGate.ts`

### 2B.5 — Webhooks

- [ ] `app/api/webhooks/uazapi/route.ts` → parse + publish
- [ ] `app/api/webhooks/facebook/route.ts` → parse + publish
- [ ] `app/api/webhooks/instagram/route.ts` → parse + publish
- [ ] ZERO `db` imports em webhooks

### Verificação

- [ ] Webhook < 50ms
- [ ] Mensagem na UI < 2s
- [ ] Dedup funciona
- [ ] Billing limit respeitado
- [ ] Read receipts atualizam
- [ ] Channel disconnect notifica UI

---

## Arquivos

| Arquivo                                        | Ação                                             |
| ---------------------------------------------- | ------------------------------------------------ |
| `lib/queue/types.ts`                           | **NOVO** — tipos normalizados                    |
| `app/api/queue/message-ingest/route.ts`        | **NOVO** — worker principal (~200 linhas)        |
| `app/api/queue/message-status-update/route.ts` | **NOVO** — status updates                        |
| `app/api/queue/channel-status-update/route.ts` | **NOVO** — channel connection                    |
| `app/api/webhooks/uazapi/route.ts`             | **REWRITE** — thin parse + publish (~130 linhas) |
| `app/api/webhooks/facebook/route.ts`           | **REWRITE** — thin parse + publish (~80 linhas)  |
| `app/api/webhooks/instagram/route.ts`          | **REWRITE** — thin parse + publish (~80 linhas)  |
| `lib/billing/conversationGate.ts`              | **MODIFY** — add `tryCreateConversationAtomic`   |

**NÃO MODIFICAR:** Todos os workers existentes da Fase 2A, `lib/qstash.ts`, `lib/queue/verify.ts`.
