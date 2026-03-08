# Evolution API — Guia Completo de Integração

Guia reutilizável para integrar o **Evolution API** (WhatsApp via Baileys/QR Code) em projetos Next.js com Prisma, Inngest e Pusher.

---

## 1. O que é o Evolution API

Evolution API é um gateway WhatsApp open-source baseado em **Baileys** (biblioteca Node.js). Permite conectar números WhatsApp via **leitura de QR Code**, sem precisar de aprovação da Meta Business.

**Vantagens:**
- Sem aprovação Meta Business
- Conexão instantânea via QR
- Self-hosted (controle total dos dados)
- Suporte a grupos, mídia, e múltiplas instâncias

**Fluxo resumido:**
```
App → POST /instance/create → Evolution (cria instância + retorna QR)
App → GET  /instance/connectionState/{instance} → poll até state=open
Evolution → POST /seu-webhook → App (mensagens recebidas em tempo real)
```

---

## 2. Instalação com Docker

### Pré-requisitos
- Docker e Docker Compose instalados
- Domínio com HTTPS (obrigatório para webhooks de produção)
- Porta 8080 disponível (ou outra de sua escolha)

### docker-compose.yml

```yaml
version: '3.8'

services:
  evolution-api:
    image: atendai/evolution-api:latest
    container_name: evolution_api
    restart: always
    ports:
      - "8080:8080"
    environment:
      # Autenticação global
      AUTHENTICATION_API_KEY: "sua-chave-api-aqui"

      # Banco de dados (recomendado: PostgreSQL ou MongoDB)
      DATABASE_ENABLED: "true"
      DATABASE_PROVIDER: "postgresql"
      DATABASE_CONNECTION_URI: "postgresql://user:password@host:5432/evolution"
      DATABASE_SAVE_DATA_INSTANCE: "true"
      DATABASE_SAVE_DATA_NEW_MESSAGE: "true"
      DATABASE_SAVE_MESSAGE_UPDATE: "true"
      DATABASE_SAVE_DATA_CONTACTS: "true"
      DATABASE_SAVE_DATA_CHATS: "true"

      # Redis (opcional mas recomendado para performance)
      CACHE_REDIS_ENABLED: "false"
      CACHE_REDIS_URI: "redis://redis:6379"

      # Webhook global (opcional — sobreposto por webhook por instância)
      WEBHOOK_GLOBAL_ENABLED: "false"

      # Configurações gerais
      SERVER_TYPE: "http"
      SERVER_PORT: "8080"
      DEL_INSTANCE: "false"
      LANGUAGE: "pt-BR"

    volumes:
      - evolution_instances:/evolution/instances
      - evolution_store:/evolution/store

volumes:
  evolution_instances:
  evolution_store:
```

### Com PostgreSQL incluído

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    restart: always
    environment:
      POSTGRES_DB: evolution
      POSTGRES_USER: evolution
      POSTGRES_PASSWORD: evolution_pass
    volumes:
      - postgres_data:/var/lib/postgresql/data

  evolution-api:
    image: atendai/evolution-api:latest
    container_name: evolution_api
    restart: always
    depends_on:
      - postgres
    ports:
      - "8080:8080"
    environment:
      AUTHENTICATION_API_KEY: "sua-chave-api-aqui"
      DATABASE_ENABLED: "true"
      DATABASE_PROVIDER: "postgresql"
      DATABASE_CONNECTION_URI: "postgresql://evolution:evolution_pass@postgres:5432/evolution"
      DATABASE_SAVE_DATA_INSTANCE: "true"
      DATABASE_SAVE_DATA_NEW_MESSAGE: "true"
      DATABASE_SAVE_MESSAGE_UPDATE: "true"
      DATABASE_SAVE_DATA_CONTACTS: "true"
      DATABASE_SAVE_DATA_CHATS: "true"
      SERVER_TYPE: "http"
      SERVER_PORT: "8080"
    volumes:
      - evolution_instances:/evolution/instances

volumes:
  postgres_data:
  evolution_instances:
```

### Comandos

```bash
# Subir
docker compose up -d

# Ver logs
docker compose logs -f evolution-api

# Parar
docker compose down

# Atualizar para nova versão
docker compose pull && docker compose up -d
```

### Verificar instalação

```bash
curl http://localhost:8080/instance/fetchInstances \
  -H "apikey: sua-chave-api-aqui"
```

Resposta esperada: `[]` (lista vazia, nenhuma instância criada ainda).

---

## 3. Proxy reverso com Nginx (produção)

```nginx
server {
    listen 443 ssl;
    server_name evolution.seudominio.com;

    ssl_certificate /etc/letsencrypt/live/evolution.seudominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/evolution.seudominio.com/privkey.pem;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 4. Variáveis de Ambiente no Next.js

Adicionar em `.env.local`:

```env
# URL da Evolution API (sem barra final)
EVOLUTION_API_URL=https://evolution.seudominio.com

# Chave global de autenticação (AUTHENTICATION_API_KEY do docker-compose)
EVOLUTION_API_KEY=sua-chave-api-aqui

# Segredo opcional para verificar assinatura HMAC dos webhooks
EVOLUTION_WEBHOOK_SECRET=
```

Todas são **server-only** — nunca expor ao cliente.

---

## 5. Alterações no Schema Prisma

```prisma
enum ChannelProvider {
  META
  EVOLUTION
}

model Channel {
  // ... campos existentes ...
  provider     ChannelProvider @default(META)
  instanceName String?

  @@index([instanceName])
}
```

Aplicar:

```bash
npx prisma db push
npx prisma generate
```

> Reiniciar o servidor Next.js após `prisma generate` para recarregar o cliente gerado.

---

## 6. Cliente Evolution API (`lib/integrations/evolution.ts`)

```typescript
import { createHmac } from 'crypto'

const BASE_URL = process.env.EVOLUTION_API_URL?.replace(/\/$/, '') ?? ''
const API_KEY = process.env.EVOLUTION_API_KEY ?? ''
const WEBHOOK_EVENTS = ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED']

// ---- Tipos de Webhook ----

export interface EvolutionMessageUpsertPayload {
  event: 'MESSAGES_UPSERT'
  instance: string
  data: {
    key: { remoteJid: string; fromMe: boolean; id: string }
    pushName?: string
    message?: {
      conversation?: string
      extendedTextMessage?: { text: string }
      imageMessage?: { caption?: string }
      audioMessage?: Record<string, unknown>
      documentMessage?: { title?: string }
    }
    messageType: string
    messageTimestamp: number
  }
}

export interface EvolutionConnectionUpdatePayload {
  event: 'CONNECTION_UPDATE'
  instance: string
  data: { state: 'open' | 'connecting' | 'close'; statusReason?: number }
}

export interface EvolutionQRCodeUpdatedPayload {
  event: 'QRCODE_UPDATED'
  instance: string
  data: { qrcode: { base64: string; code: string } }
}

export type EvolutionWebhookPayload =
  | EvolutionMessageUpsertPayload
  | EvolutionConnectionUpdatePayload
  | EvolutionQRCodeUpdatedPayload
  | { event: 'SEND_MESSAGE'; instance: string; data: unknown }

// ---- Fetch helper interno ----

async function evolutionFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      apikey: API_KEY,
      ...(options?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Evolution API error [${res.status}] ${path}: ${body}`)
  }
  return res.json() as Promise<T>
}

// ---- Funções públicas ----

export async function createEvolutionInstance(instanceName: string) {
  return evolutionFetch<{ qrcode?: { base64: string; code: string } }>('/instance/create', {
    method: 'POST',
    body: JSON.stringify({ instanceName, qrcode: true, integration: 'WHATSAPP-BAILEYS' }),
  })
}

export async function setEvolutionWebhook(instanceName: string, webhookUrl: string) {
  await evolutionFetch<unknown>(`/webhook/set/${instanceName}`, {
    method: 'POST',
    body: JSON.stringify({
      url: webhookUrl,
      webhook_by_events: false,
      webhook_base64: false,
      events: WEBHOOK_EVENTS,
    }),
  })
}

export async function getEvolutionQR(instanceName: string) {
  const data = await evolutionFetch<{
    base64?: string; code?: string; qrcode?: { base64: string; code: string }
  }>(`/instance/connect/${instanceName}`)
  return {
    base64: data.base64 ?? data.qrcode?.base64 ?? '',
    code: data.code ?? data.qrcode?.code ?? '',
  }
}

export async function getEvolutionConnectionState(instanceName: string) {
  const data = await evolutionFetch<{ instance?: { state?: string }; state?: string }>(
    `/instance/connectionState/${instanceName}`
  )
  const raw = data.instance?.state ?? data.state ?? 'close'
  if (raw === 'open') return 'open' as const
  if (raw === 'connecting') return 'connecting' as const
  return 'close' as const
}

export async function sendEvolutionMessage(instanceName: string, to: string, text: string) {
  const data = await evolutionFetch<{ key?: { id?: string } }>(
    `/message/sendText/${instanceName}`,
    { method: 'POST', body: JSON.stringify({ number: to, text }) }
  )
  return data.key?.id ?? ''
}

export async function logoutEvolutionInstance(instanceName: string) {
  await evolutionFetch<unknown>(`/instance/logout/${instanceName}`, { method: 'DELETE' })
}

export async function deleteEvolutionInstance(instanceName: string) {
  await evolutionFetch<unknown>(`/instance/delete/${instanceName}`, { method: 'DELETE' })
}

export function verifyEvolutionSignature(payload: string, signature: string, secret: string) {
  const expected = createHmac('sha256', secret).update(payload).digest('hex')
  return `sha256=${expected}` === signature
}
```

---

## 7. Rota de Conexão (`app/api/evolution/connect/route.ts`)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  createEvolutionInstance,
  setEvolutionWebhook,
  getEvolutionQR,
  getEvolutionConnectionState,
} from '@/lib/integrations/evolution'

// POST — cria instância + retorna QR
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.workspaceId || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  try {
    const { channelName } = await req.json().catch(() => ({}))
    const workspaceId = session.user.workspaceId
    const instanceName = `${workspaceId}-wa-${Date.now()}`
    const webhookUrl = `${process.env.NEXTAUTH_URL}/api/webhooks/evolution`

    const created = await createEvolutionInstance(instanceName)
    await setEvolutionWebhook(instanceName, webhookUrl)

    const qr = created.qrcode ?? await getEvolutionQR(instanceName)

    const channel = await db.channel.create({
      data: {
        workspaceId,
        type: 'WHATSAPP',
        provider: 'EVOLUTION',
        instanceName,
        name: channelName?.trim() || 'WhatsApp (Evolution)',
        isActive: false,
      },
    })

    return NextResponse.json({ instanceName, channelId: channel.id, qr })
  } catch (error) {
    console.error('[EVOLUTION CONNECT POST]', error)
    return NextResponse.json({ error: 'Erro ao conectar Evolution.' }, { status: 500 })
  }
}

// GET — poll de estado de conexão
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.workspaceId) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const instanceName = new URL(req.url).searchParams.get('instanceName')
  if (!instanceName) {
    return NextResponse.json({ error: 'instanceName é obrigatório.' }, { status: 400 })
  }

  const channel = await db.channel.findFirst({
    where: { workspaceId: session.user.workspaceId, instanceName },
  })
  if (!channel) {
    return NextResponse.json({ error: 'Canal não encontrado.' }, { status: 404 })
  }

  try {
    const state = await getEvolutionConnectionState(instanceName)

    if (state === 'open' && !channel.isActive) {
      await db.channel.update({
        where: { id: channel.id },
        data: { isActive: true, webhookVerifiedAt: new Date() },
      })
    }

    return NextResponse.json({ state, channelId: channel.id })
  } catch (error) {
    console.error('[EVOLUTION CONNECT GET]', error)
    return NextResponse.json({ error: 'Erro ao verificar estado.' }, { status: 500 })
  }
}
```

---

## 8. Webhook Receiver (`app/api/webhooks/evolution/route.ts`)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { inngest } from '@/lib/inngest'
import {
  verifyEvolutionSignature,
  type EvolutionWebhookPayload,
} from '@/lib/integrations/evolution'

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()

    if (process.env.EVOLUTION_WEBHOOK_SECRET) {
      const sig = req.headers.get('x-hub-signature-256') ?? ''
      if (!verifyEvolutionSignature(body, sig, process.env.EVOLUTION_WEBHOOK_SECRET)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const payload = JSON.parse(body) as EvolutionWebhookPayload

    if (payload.event === 'MESSAGES_UPSERT') {
      await inngest.send({ name: 'evolution/message.received', data: payload })
    } else if (payload.event === 'CONNECTION_UPDATE') {
      await inngest.send({ name: 'evolution/connection.update', data: payload })
    } else if (payload.event === 'QRCODE_UPDATED') {
      await inngest.send({ name: 'evolution/qrcode.updated', data: payload })
    }
    // SEND_MESSAGE (eco de saída) é ignorado silenciosamente

    return NextResponse.json({ status: 'EVENT_RECEIVED' })
  } catch {
    // Sempre retornar 200 — Evolution retentar em não-200
    return NextResponse.json({ status: 'ERROR' })
  }
}
```

> Garantir que `/api/webhooks/evolution` está na lista de rotas públicas do `auth.config.ts`.

---

## 9. Funções Inngest (`lib/inngest-functions.ts`)

### processEvolutionMessage

```typescript
export const processEvolutionMessage = inngest.createFunction(
  { id: 'process-evolution-message', retries: 3 },
  { event: 'evolution/message.received' },
  async ({ event }) => {
    const payload = event.data as EvolutionMessageUpsertPayload
    const msg = payload.data

    // Ignorar mensagens enviadas pelo próprio número
    if (msg.key.fromMe) return

    const channel = await db.channel.findFirst({
      where: { instanceName: payload.instance, provider: 'EVOLUTION' },
    })
    if (!channel) return

    const remoteJid = msg.key.remoteJid
    const text =
      msg.message?.conversation ??
      msg.message?.extendedTextMessage?.text ??
      '[Mídia]'

    // Deduplicação
    const existing = await db.message.findFirst({ where: { externalId: msg.key.id } })
    if (existing) return

    const conversation = await db.conversation.upsert({
      where: {
        workspaceId_channelId_externalId: {
          workspaceId: channel.workspaceId,
          channelId: channel.id,
          externalId: remoteJid,
        },
      },
      create: {
        workspaceId: channel.workspaceId,
        channelId: channel.id,
        externalId: remoteJid,
        contactName: msg.pushName ?? remoteJid.replace('@s.whatsapp.net', ''),
        contactPhone: remoteJid.replace('@s.whatsapp.net', ''),
        status: 'UNASSIGNED',
      },
      update: {},
    })

    const savedMessage = await db.message.create({
      data: {
        conversationId: conversation.id,
        workspaceId: channel.workspaceId,
        direction: 'INBOUND',
        content: text,
        externalId: msg.key.id,
        status: 'DELIVERED',
      },
    })

    await db.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: text.slice(0, 100),
        unreadCount: { increment: 1 },
      },
    })

    await pusherServer.trigger(
      `workspace-${channel.workspaceId}`,
      'new-message',
      { conversationId: conversation.id, message: savedMessage }
    )
  }
)
```

### processEvolutionConnectionUpdate

```typescript
export const processEvolutionConnectionUpdate = inngest.createFunction(
  { id: 'process-evolution-connection-update', retries: 2 },
  { event: 'evolution/connection.update' },
  async ({ event }) => {
    const payload = event.data as EvolutionConnectionUpdatePayload
    const channel = await db.channel.findFirst({
      where: { instanceName: payload.instance },
    })
    if (!channel) return

    if (payload.data.state === 'open') {
      await db.channel.update({
        where: { id: channel.id },
        data: { isActive: true, webhookVerifiedAt: new Date() },
      })
    } else if (payload.data.state === 'close') {
      await db.channel.update({
        where: { id: channel.id },
        data: { isActive: false },
      })
      await pusherServer.trigger(
        `workspace-${channel.workspaceId}`,
        'channel-status-update',
        { channelId: channel.id, state: 'close' }
      )
    }
  }
)
```

### processEvolutionQRCodeUpdated

```typescript
export const processEvolutionQRCodeUpdated = inngest.createFunction(
  { id: 'process-evolution-qrcode-updated', retries: 2 },
  { event: 'evolution/qrcode.updated' },
  async ({ event }) => {
    const payload = event.data as EvolutionQRCodeUpdatedPayload
    const channel = await db.channel.findFirst({
      where: { instanceName: payload.instance },
    })
    if (!channel) return

    await pusherServer.trigger(
      `workspace-${channel.workspaceId}`,
      'evolution-qr-updated',
      { channelId: channel.id, qr: payload.data.qrcode }
    )
  }
)
```

Registrar em `app/api/inngest/route.ts`:

```typescript
import {
  processInstagramMessage,
  processFacebookMessage,
  processEvolutionMessage,
  processEvolutionConnectionUpdate,
  processEvolutionQRCodeUpdated,
} from '@/lib/inngest-functions'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processInstagramMessage,
    processFacebookMessage,
    processEvolutionMessage,
    processEvolutionConnectionUpdate,
    processEvolutionQRCodeUpdated,
  ],
})
```

---

## 10. Envio de Mensagens (Outbound)

Em `app/api/conversations/[id]/messages/route.ts`, no bloco POST:

```typescript
if (channel.type === 'WHATSAPP' && channel.instanceName) {
  // Remover sufixo @s.whatsapp.net ou @g.us
  const to = conversation.contactPhone
    ?? conversation.externalId.replace('@s.whatsapp.net', '').replace('@g.us', '')
  externalId = await sendEvolutionMessage(channel.instanceName, to, content)
}
```

---

## 11. UI — Modal QR + Polling (Settings Page)

```typescript
// Estado
const [evolutionQR, setEvolutionQR] = useState<{
  base64: string
  code: string
  instanceName: string
  channelId: string
} | null>(null)
const evolutionPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

// Conectar
async function handleEvolutionConnect() {
  const res = await fetch('/api/evolution/connect', { method: 'POST' })
  const data = await res.json()
  if (!res.ok) { alert(data.error); return }
  setEvolutionQR({ ...data.qr, instanceName: data.instanceName, channelId: data.channelId })
  startEvolutionPoll(data.instanceName)
}

// Poll de conexão
function startEvolutionPoll(instanceName: string) {
  evolutionPollRef.current = setInterval(async () => {
    const res = await fetch(`/api/evolution/connect?instanceName=${instanceName}`)
    const data = await res.json()
    if (data.state === 'open') {
      stopEvolutionPoll()
      setEvolutionQR(null)
      refreshChannels() // rebuscar lista de canais
    }
  }, 3000)
}

function stopEvolutionPoll() {
  if (evolutionPollRef.current) {
    clearInterval(evolutionPollRef.current)
    evolutionPollRef.current = null
  }
}

// Cleanup no unmount
useEffect(() => () => stopEvolutionPoll(), [])

// Renovação automática do QR via Pusher
useEffect(() => {
  channel.bind('evolution-qr-updated', (data: { channelId: string; qr: { base64: string; code: string } }) => {
    setEvolutionQR((prev) => prev ? { ...prev, ...data.qr } : null)
  })
}, [channel])
```

**Modal QR:**

```tsx
{evolutionQR && (
  <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
    <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center">
      <h2 className="text-lg font-bold mb-2">Conectar WhatsApp</h2>
      <p className="text-sm text-gray-500 mb-4">
        Abra o WhatsApp → Aparelhos conectados → Conectar aparelho
      </p>
      <img src={evolutionQR.base64} alt="QR Code WhatsApp" className="mx-auto w-56 h-56" />
      <button
        onClick={() => { stopEvolutionPoll(); setEvolutionQR(null) }}
        className="mt-4 text-sm text-gray-500 hover:underline"
      >
        Cancelar
      </button>
    </div>
  </div>
)}
```

---

## 12. Referência dos Eventos de Webhook

### MESSAGES_UPSERT
```json
{
  "event": "MESSAGES_UPSERT",
  "instance": "workspace-id-wa-1234567890",
  "data": {
    "key": {
      "remoteJid": "5511999999999@s.whatsapp.net",
      "fromMe": false,
      "id": "MSG_ID_AQUI"
    },
    "pushName": "Nome do Contato",
    "message": {
      "conversation": "Texto da mensagem"
    },
    "messageType": "conversation",
    "messageTimestamp": 1700000000
  }
}
```

### CONNECTION_UPDATE
```json
{
  "event": "CONNECTION_UPDATE",
  "instance": "workspace-id-wa-1234567890",
  "data": {
    "state": "open"
  }
}
```
Estados possíveis: `open` | `connecting` | `close`

### QRCODE_UPDATED
```json
{
  "event": "QRCODE_UPDATED",
  "instance": "workspace-id-wa-1234567890",
  "data": {
    "qrcode": {
      "base64": "data:image/png;base64,...",
      "code": "2@abc123..."
    }
  }
}
```

### SEND_MESSAGE (ignorar)
Echo de mensagens enviadas pelo próprio sistema — deve ser descartado silenciosamente.

---

## 13. Convenção de instanceName

Formato: `{workspaceId}-wa-{Date.now()}`

- Garante unicidade por workspace
- Permite identificar o workspace a partir do `instanceName` via DB
- Seguro para a Evolution API (sem espaços, sem caracteres especiais)

---

## 14. Checklist de Verificação

- [ ] Evolution API acessível em HTTPS
- [ ] `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` configurados no `.env.local`
- [ ] `prisma db push` + `prisma generate` executados
- [ ] Servidor Next.js reiniciado após `prisma generate`
- [ ] Rota `/api/webhooks/evolution` na lista de rotas públicas do middleware de auth
- [ ] POST `/api/evolution/connect` cria instância + retorna QR
- [ ] QR exibido no modal → scan com WhatsApp → poll retorna `state: open`
- [ ] Canal marcado como `isActive: true` no banco
- [ ] Mensagem recebida aparece no inbox via Pusher
- [ ] Mensagem enviada do CRM chega no dispositivo
- [ ] QR expirado é renovado automaticamente via evento `QRCODE_UPDATED`
