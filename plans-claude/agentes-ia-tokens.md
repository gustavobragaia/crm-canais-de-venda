# Plano: 3 Agentes de IA + Sistema de Tokens/Créditos

## Contexto

O CRM já possui billing via Kirvano (planos solo/starter/growth/business), canais WhatsApp (UazAPI), Instagram e Facebook. O objetivo é adicionar 3 agentes de IA nativos no Next.js + um sistema de créditos recarregáveis (tokens) para monetizar o uso dos agentes. Todos os planos liberam acesso aos 3 agentes, mas o uso do Disparador e Vendedor consome tokens comprados separadamente.

**Modelo de negócio — 1 token = R$1,00:**

| Agente | Conversão | Custo real | Preço (1 token) | Margem |
|--------|-----------|-----------|-----------------|--------|
| **Buscador** | 1 token = 2 leads | R$0.03 | R$1.00 | **97%** |
| **Disparador** | 1 token = 1 disparo | R$0.04 | R$1.00 | **96%** |
| **SDR Vendedor** | 1 token = 10 msgs | R$0.04 | R$1.00 | **96%** |

- Buscador: 1ª busca grátis para experimentar, depois cobra tokens
- Tokens comprados via Kirvano — recarga mínima R$50

**Pacotes de recarga:**

| Valor | Tokens | Buscador (leads) | Disparador (msgs) | SDR (msgs) |
|-------|--------|-----------------|-------------------|------------|
| R$50 (mín) | 50 | 100 leads | 50 disparos | 500 msgs |
| R$75 | 75 | 150 leads | 75 disparos | 750 msgs |
| R$100 | 100 | 200 leads | 100 disparos | 1000 msgs |
| R$150 | 150 | 300 leads | 150 disparos | 1500 msgs |
| R$200 | 200 | 400 leads | 200 disparos | 2000 msgs |

**Stack adicional:**
- Redis (Upstash) — debounce, human takeover block, AI message buffer
- OpenAI GPT-4.1-mini — Vendedor SDR
- OpenAI GPT-4o-mini — análise de imagens + resumo de reviews (Buscador)
- OpenAI Whisper — transcrição de áudio
- Google Places API (New) — extração de leads
- Meta Cloud API (WABA) — disparo oficial de templates

---

## FASE 0: Infraestrutura Redis + Dependências

### 0.1 Redis (Upstash)

Arquivo: `lib/redis.ts`

```typescript
import { Redis } from '@upstash/redis'

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})
```

Dependência: `bun add @upstash/redis`

Env vars:
```
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

Upstash free tier: 10.000 comandos/dia — suficiente para início. Plano pay-as-you-go: $0.2/100K comandos.

### 0.2 OpenAI SDK (já existe no projeto)

Já instalado (`openai: "^6.27.0"` no package.json). Usado para transcrição em `app/api/transcription/route.ts`.

Env var existente: `OPENAI_API_KEY`

### 0.3 Google Places — credencial

Env var: `GOOGLE_PLACES_API_KEY` (API key simples, não OAuth — mais simples para nosso caso)

---

## FASE 1: Sistema de Tokens + Schema (Fundação)

### 1.1 Novos models no Prisma (`prisma/schema.prisma`)

```prisma
enum TokenTransactionType {
  PURCHASE
  CONSUMPTION
  REFUND
  BONUS
  ADJUSTMENT
}

// Adicionar ao Workspace:
//   tokenBalance           Int    @default(0)
//   scrapingSearchesThisMonth Int @default(0)
//   tokenTransactions      TokenTransaction[]
//   scrapingJobs           ScrapingJob[]
//   wabaChannels           WabaChannel[]
//   wabaTemplates          WabaTemplate[]
//   templateDispatches     TemplateDispatch[]
//   aiSalesConfig          AiSalesConfig?

// Adicionar ao Conversation:
//   aiSalesEnabled         Boolean @default(false)
//   aiSalesMessageCount    Int     @default(0)

// Adicionar ao Message:
//   aiGenerated            Boolean @default(false)

model TokenTransaction {
  id            String               @id @default(uuid())
  workspaceId   String
  type          TokenTransactionType
  amount        Int                   // positivo=crédito, negativo=débito
  balanceBefore Int
  balanceAfter  Int
  description   String?
  referenceId   String?               // kirvano sale_id, dispatch ID, message ID
  referenceType String?               // "kirvano_purchase", "disparador", "vendedor"
  createdAt     DateTime             @default(now())
  workspace     Workspace            @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@index([workspaceId, createdAt(sort: Desc)])
  @@map("token_transactions")
}

model TokenPackage {
  id             String   @id @default(uuid())
  name           String               // "500 MSG"
  slug           String   @unique
  tokenAmount    Int
  priceCents     Int                  // preço em centavos BRL
  checkoutUrl    String?
  isActive       Boolean  @default(true)
  position       Int      @default(0)
  createdAt      DateTime @default(now())

  @@map("token_packages")
}
```

### 1.2 Token Service (`lib/billing/tokenService.ts`)

Seguir padrão do `conversationGate.ts` (mesmo arquivo de referência):

```typescript
// Funções exportadas:
export async function getTokenBalance(workspaceId: string): Promise<number>

export async function canConsumeTokens(workspaceId: string, amount: number): Promise<boolean>

export async function consumeTokens(
  workspaceId: string,
  amount: number,
  referenceType: 'disparador' | 'vendedor',
  referenceId: string,
  description?: string
): Promise<{ success: boolean; newBalance: number }>
// Usa Prisma.$transaction com:
//   1. Ler workspace.tokenBalance
//   2. Se balance < amount → return { success: false }
//   3. Decrementar workspace.tokenBalance
//   4. Criar TokenTransaction com balanceBefore/After

export async function addTokens(
  workspaceId: string,
  amount: number,
  type: TokenTransactionType,
  referenceId?: string,
  description?: string
): Promise<{ newBalance: number }>
// Mesma lógica mas incrementa

export async function getTransactionHistory(
  workspaceId: string,
  page: number,
  limit: number
): Promise<{ transactions: TokenTransaction[]; total: number }>
```

### 1.3 Token Package Config (`lib/billing/tokenPackages.ts`)

```typescript
// 1 token = R$1,00
export const TOKEN_PACKAGES = [
  { slug: 'pack-50',  name: '50 Tokens',  tokenAmount: 50,  priceCents: 5000 },
  { slug: 'pack-75',  name: '75 Tokens',  tokenAmount: 75,  priceCents: 7500 },
  { slug: 'pack-100', name: '100 Tokens', tokenAmount: 100, priceCents: 10000 },
  { slug: 'pack-150', name: '150 Tokens', tokenAmount: 150, priceCents: 15000 },
  { slug: 'pack-200', name: '200 Tokens', tokenAmount: 200, priceCents: 20000 },
] as const

// Conversão por agente
export const TOKEN_RATES = {
  buscador: { tokensPerUnit: 1, unitsPerToken: 2, unit: 'leads' },    // 1 token = 2 leads (50 tokens = 100 leads)
  disparador: { tokensPerUnit: 1, unitsPerToken: 1, unit: 'disparo' }, // 1 token = 1 disparo
  vendedor: { tokensPerUnit: 1, unitsPerToken: 10, unit: 'msgs' },    // 1 token = 10 msgs (100 tokens = 1000 msgs)
} as const
```

**Consumo de tokens:**
- Buscador: cobra ao completar job → `ceil(totalLeadsEncontrados / 2)` tokens
- Disparador: cobra por msg enviada → 1 token por msg
- SDR: cobra a cada 10 msgs enviadas pelo AI → 1 token a cada 10 msgs (acumula, cobra quando atinge 10)

### 1.4 Kirvano webhook — estender para tokens

Arquivo: `app/api/webhooks/kirvano/route.ts`

Lógica no `SALE_APPROVED`:
```
if (utmSource?.startsWith('tokens_')) {
  const slug = utmSource.replace('tokens_', '')
  const pkg = findPackageBySlug(slug)
  await addTokens(workspaceId, pkg.tokenAmount, 'PURCHASE', saleId, pkg.name)
} else {
  // fluxo existente de plano/subscription
}
```

Lógica no `REFUND` / `SALE_CHARGEBACK`:
```
if (utmSource?.startsWith('tokens_')) {
  // Debitar tokens se possível, ou zerar balance
  await addTokens(workspaceId, -pkg.tokenAmount, 'REFUND', saleId)
}
```

### 1.5 API Routes — Tokens

| Rota | Método | Propósito |
|------|--------|-----------|
| `app/api/tokens/route.ts` | GET | Retorna `{ balance, packages[] }` |
| `app/api/tokens/history/route.ts` | GET | Histórico paginado `{ transactions[], total, page }` |

### 1.6 UI de Tokens

`app/[workspaceSlug]/settings/tokens/page.tsx`:
- Card de saldo atual (destaque grande)
- Grid de pacotes com preço e botão "Comprar" → link Kirvano com `?utm_content={workspaceId}&utm_source=tokens_{slug}&utm_medium=token_package`
- Tabela de histórico com: data, tipo (badge colorido), quantidade, saldo após, descrição

Componente reutilizável: `components/TokenBalance.tsx`
- Mostra saldo compacto (ícone + número)
- Usado no sidebar, hub de agentes, antes de ações que consomem tokens

---

## FASE 2: O Buscador (Extração de Leads) — FREE

### 2.1 Google Places API (`lib/integrations/google-places.ts`)

Baseado no flow n8n analisado. Usa Places API (New) — `places.googleapis.com/v1`:

```typescript
export async function searchPlaces(query: string, city: string, zip?: string): Promise<Place[]>
// POST https://places.googleapis.com/v1/places:searchText
// Headers: X-Goog-Api-Key, X-Goog-FieldMask
// FieldMask: places.id,places.displayName,places.formattedAddress,
//   places.primaryType,places.primaryTypeDisplayName,places.nationalPhoneNumber,
//   places.rating,places.userRatingCount,places.websiteUri,
//   places.editorialSummary,places.reviews
// Body: { textQuery: `${query} ${city} cep ${zip}` }

export interface Place {
  id: string
  displayName: { text: string }
  formattedAddress: string
  primaryType: string
  primaryTypeDisplayName?: { text: string }
  nationalPhoneNumber?: string
  rating?: number
  userRatingCount?: number
  websiteUri?: string
  editorialSummary?: { text: string }
  reviews?: Array<{ text: { text: string }; rating: number }>
}
```

### 2.2 Filtro de Leads (`lib/agents/buscador.ts`)

Replica a lógica do nó "Filter" do n8n:

```typescript
export function filterValidLeads(places: Place[]): Place[] {
  return places.filter(place => {
    if (!place.rating || place.rating <= 3) return false           // rating > 3
    if (!place.nationalPhoneNumber) return false                    // tem telefone
    if (!place.userRatingCount || place.userRatingCount <= 1) return false // tem reviews
    const digits = place.nationalPhoneNumber.replace(/\D/g, '')
    const phonePart = digits.slice(2)
    if (!phonePart.startsWith('9')) return false                    // é celular
    return true
  })
}
```

### 2.3 Resumo de Reviews via AI (`lib/agents/buscador.ts`)

Replica o nó "AI Agent" (GPT-4o-mini) do n8n:

```typescript
export async function summarizeReviews(place: Place): Promise<string>
// GPT-4o-mini (temperature: 0.2)
// Prompt: "Faça um resumo das reviews do estabelecimento.
//          Esse conhecimento será usado para outreach."
```

### 2.4 Schema

```prisma
model DispatchList {
  id              String   @id @default(uuid())
  workspaceId     String
  name            String               // "Dentistas SP", "Clínicas RJ"
  description     String?
  source          String   @default("buscador")  // "buscador" | "manual"
  scrapingJobId   String?              // referência ao job que gerou essa lista
  contactCount    Int      @default(0)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  workspace       Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  contacts        DispatchListContact[]
  dispatches      TemplateDispatch[]

  @@index([workspaceId])
  @@map("dispatch_lists")
}

model DispatchListContact {
  id              String   @id @default(uuid())
  listId          String
  name            String?
  phone           String               // formato +5511999999999
  address         String?
  businessType    String?
  rating          Float?
  reviewCount     Int?
  reviewSummary   String?  @db.Text
  website         String?
  placeId         String?              // Google Place ID (para dedup)
  createdAt       DateTime @default(now())
  list            DispatchList @relation(fields: [listId], references: [id], onDelete: Cascade)

  @@unique([listId, phone])
  @@index([listId])
  @@index([phone])
  @@map("dispatch_list_contacts")
}

model ScrapingJob {
  id              String   @id @default(uuid())
  workspaceId     String
  query           String               // "clinica estetica"
  city            String               // "Rio de Janeiro"
  zip             String?              // "20561018"
  status          String   @default("QUEUED")  // QUEUED, RUNNING, COMPLETED, FAILED
  totalFound      Int      @default(0)
  validLeads      Int      @default(0)
  results         Json     @default("[]")
  listId          String?              // lista gerada automaticamente
  error           String?
  startedAt       DateTime?
  completedAt     DateTime?
  createdAt       DateTime @default(now())
  workspace       Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@index([workspaceId, createdAt(sort: Desc)])
  @@map("scraping_jobs")
}
```

### 2.5 Processamento assíncrono (`lib/agents/buscador.ts`)

```typescript
export async function processScrapingJob(jobId: string): Promise<void>
// 1. Atualizar job: status=RUNNING, startedAt=now()
// 2. searchPlaces(query, city, zip)
// 3. filterValidLeads(places) + dedup por place.id
// 4. Para cada lead: summarizeReviews(place) via GPT-4o-mini
// 5. Criar DispatchList automaticamente:
//    name = "Busca: {query} {city}" (ex: "Busca: clínica estética Rio de Janeiro")
//    source = "buscador"
//    scrapingJobId = jobId
// 6. Criar DispatchListContact para cada lead válido
// 7. Atualizar job: status=COMPLETED, listId, totalFound, validLeads
// 8. Em caso de erro: status=FAILED, error=message
```

Trigger: fire-and-forget fetch no POST handler (mesmo padrão do webhook UazAPI).

### 2.6 Primeira busca grátis + tokens

Adicionar ao Workspace: `hasUsedFreeScraping Boolean @default(false)`

```typescript
export async function canSearch(workspaceId: string): Promise<{ allowed: boolean; isFree: boolean }> {
  const workspace = await prisma.workspace.findUnique(...)
  // 1ª busca grátis
  if (!workspace.hasUsedFreeScraping) return { allowed: true, isFree: true }
  // Depois: cobra tokens (50 tokens = 100 leads, estimado ~50 leads por busca = 25 tokens)
  // Cobra APÓS a busca, baseado no total de leads encontrados: ceil(validLeads / 2)
  return { allowed: workspace.tokenBalance >= 25, isFree: false }
}
```

### 2.7 API Routes

| Rota | Método | Propósito |
|------|--------|-----------|
| `app/api/agents/buscador/route.ts` | POST | Criar job `{ query, city, zip }` |
| `app/api/agents/buscador/route.ts` | GET | Listar jobs do workspace |
| `app/api/agents/buscador/process/route.ts` | POST | (interno) Processa job async |
| `app/api/agents/buscador/[id]/route.ts` | GET | Status + resultados do job |
| `app/api/agents/listas/route.ts` | GET | Listar todas as listas do workspace |
| `app/api/agents/listas/[id]/route.ts` | GET | Detalhes da lista + contatos |
| `app/api/agents/listas/[id]/route.ts` | PATCH | Renomear lista, editar descrição |
| `app/api/agents/listas/[id]/route.ts` | DELETE | Deletar lista |

### 2.8 UI

`app/[workspaceSlug]/agents/buscador/page.tsx`:

**Seção "Nova Busca":**
- Input: Nicho/Subcategoria (ex: "clínica estética")
- Input: Cidade (ex: "Rio de Janeiro")
- Input: CEP (opcional)
- Botão "Buscar Leads" (desabilitado se limite atingido)
- Indicador: "X de Y buscas usadas este mês"
- Polling a cada 3s enquanto status=QUEUED|RUNNING

**Seção "Minhas Listas":**
- Grid/lista de listas com: nome, quantidade de contatos, data, origem (badge "Buscador")
- Stats por lista: disparos feitos, taxa de resposta
- Ações: renomear, ver contatos, disparar, deletar
- Clicar abre detalhes

**Seção "Contatos da Lista" (ao clicar):**
- Tabela: Nome, Telefone, Endereço, Tipo, Rating (estrelas), Resumo Reviews
- Botão "Novo Disparo para esta Lista" → redireciona para Disparador com lista pré-selecionada

---

## FASE 3: O Disparador (WABA → UazAPI)

### Arquitetura de canais

**Decisão crítica:** O número WABA e o número UazAPI são o MESMO número.
- Disparo sai via WABA (API oficial Meta, templates aprovados, sem risco de ban)
- Respostas dos clientes chegam via webhook UazAPI (Baileys, mesmo número)
- Isso permite: disparo seguro + gestão de conversas no CRM existente

```
[Disparo WABA] ──template──→ Cliente
                                │
                                ↓ (responde)
[Webhook UazAPI] ←─────────── Cliente
       │
       ↓
 CRM Inbox (conversa gerenciada)
```

### 3.1 WABA Integration (`lib/integrations/waba.ts`)

Cloud API `graph.facebook.com/v21.0`:

```typescript
export async function sendTemplateMessage(
  accessToken: string,
  phoneNumberId: string,
  to: string,           // formato: 5511XXXXXXXX (sem 9° dígito)
  templateName: string,
  language: string,
  components?: any[]
): Promise<{ messageId: string }>

export async function getTemplates(accessToken: string, wabaId: string): Promise<WabaTemplate[]>
export async function createTemplate(accessToken: string, wabaId: string, template: CreateTemplatePayload): Promise<{ id: string }>
export async function deleteTemplate(accessToken: string, wabaId: string, templateName: string): Promise<void>
export async function getPhoneNumbers(accessToken: string, wabaId: string): Promise<PhoneNumber[]>
```

### 3.2 Formatação de telefone BR para WABA

```typescript
export function formatPhoneForWaba(phone: string): string {
  const raw = phone.replace(/\D/g, '')
  if (!raw.startsWith('55') || raw.length < 13) return raw
  const ddd = raw.slice(2, 4)
  let number = raw.slice(4)
  if (number.length === 9 && number.startsWith('9')) number = number.slice(1)
  return `55${ddd}${number}`
}
```

### 3.3 Meta Embedded Signup

1. Frontend carrega Facebook Login SDK
2. Popup com scopes `whatsapp_business_management, whatsapp_business_messaging`
3. Usuário seleciona/cria Business Manager → WABA → registra número
4. Callback retorna accessToken → backend troca por System User Token (long-lived)
5. Backend registra webhook para status updates

### 3.4 Pipeline de Estágios (Disparo → Conversa)

**Fluxo completo de uma conversa de disparo:**

```
DISPARO_ENVIADO → DISPARO_RESPONDIDO → NAO_ATRIBUIDA (ou) SDR_ATIVO
```

Novo enum para estágio de disparo na Conversation:

```typescript
enum DispatchStage {
  DISPARO_ENVIADO      // Template WABA enviado, aguardando resposta
  DISPARO_RESPONDIDO   // Cliente respondeu (msg chegou no UazAPI)
  NAO_ATRIBUIDA        // Transferido para inbox, sem SDR
  SDR_ATIVO            // Transferido para SDR (Vendedor AI)
  FINALIZADA           // Conversa encerrada
}
```

**Transições automáticas:**

1. **Disparo criado** → cria Conversation com `dispatchStage=DISPARO_ENVIADO`, `source='dispatch'`
   - Conversa NÃO aparece na inbox principal
   - Aparece na aba de Agentes > Disparos (Kanban/Lista)

2. **Cliente responde** (webhook UazAPI recebe msg inbound):
   - Match por telefone: busca Conversation com `customerPhone` + `dispatchStage=DISPARO_ENVIADO`
   - Atualiza `dispatchStage=DISPARO_RESPONDIDO`
   - Pusher notifica UI para mover card no Kanban

3. **Transferência** (automática ou manual):
   - Se SDR (Vendedor) está habilitado para o workspace:
     - `dispatchStage=SDR_ATIVO`, `aiSalesEnabled=true`
     - Conversa aparece na inbox com badge "SDR"
   - Se SDR desabilitado:
     - `dispatchStage=NAO_ATRIBUIDA`
     - Conversa aparece na inbox principal com status "Não Atribuída"
   - Transferência pode ser automática (ao responder) ou manual (botão no Kanban)

### 3.5 Schema

```prisma
enum DispatchStage {
  DISPARO_ENVIADO
  DISPARO_RESPONDIDO
  NAO_ATRIBUIDA
  SDR_ATIVO
  FINALIZADA
}

// Adicionar ao Conversation:
//   dispatchStage     DispatchStage?    // null = conversa normal (não de disparo)
//   dispatchListId    String?           // referência à lista de origem
//   templateDispatchId String?          // referência ao disparo de origem
//   source            String  @default("organic") // "organic" | "dispatch"

model WabaChannel {
  id              String   @id @default(uuid())
  workspaceId     String
  wabaId          String
  phoneNumberId   String
  phoneNumber     String
  displayName     String?
  accessToken     String               // encrypted (AES-256-CBC via lib/crypto.ts)
  qualityRating   String?
  messagingLimit  String?
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  workspace       Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  templateDispatches TemplateDispatch[]

  @@unique([workspaceId, phoneNumberId])
  @@index([workspaceId])
  @@map("waba_channels")
}

model WabaTemplate {
  id              String   @id @default(uuid())
  workspaceId     String
  wabaChannelId   String?
  metaTemplateId  String?
  name            String
  language        String   @default("pt_BR")
  category        String   @default("UTILITY")
  status          String   @default("PENDING")
  components      Json
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  workspace       Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@unique([workspaceId, name, language])
  @@index([workspaceId, status])
  @@map("waba_templates")
}

model TemplateDispatch {
  id              String   @id @default(uuid())
  workspaceId     String
  wabaChannelId   String
  dispatchListId  String               // OBRIGATÓRIO: disparo sempre é para uma lista
  templateName    String
  status          String   @default("QUEUED")
  totalRecipients Int      @default(0)
  sentCount       Int      @default(0)
  failedCount     Int      @default(0)
  respondedCount  Int      @default(0)  // quantos responderam
  tokensConsumed  Int      @default(0)
  startedAt       DateTime?
  completedAt     DateTime?
  createdAt       DateTime @default(now())
  workspace       Workspace    @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  wabaChannel     WabaChannel  @relation(fields: [wabaChannelId], references: [id], onDelete: Cascade)
  dispatchList    DispatchList @relation(fields: [dispatchListId], references: [id], onDelete: Cascade)

  @@index([workspaceId, createdAt(sort: Desc)])
  @@map("template_dispatches")
}
```

### 3.6 Motor de Disparo (`lib/agents/disparador.ts`)

```typescript
export async function processDispatch(dispatchId: string): Promise<void>
// 1. Carregar dispatch + wabaChannel + dispatchList + contacts
// 2. Verificar tokenBalance >= contacts.length
// 3. Para cada contact em batches de 50 (1s delay entre batches):
//    a. formatPhoneForWaba(contact.phone)
//    b. sendTemplateMessage(...)
//    c. Sucesso:
//       - consumeTokens(1, 'disparador', dispatchId)
//       - Criar Conversation no CRM:
//         customerPhone = contact.phone
//         customerName = contact.name
//         source = 'dispatch'
//         dispatchStage = DISPARO_ENVIADO
//         dispatchListId = dispatch.dispatchListId
//         templateDispatchId = dispatchId
//       - Criar ConversationActivity: "Template enviado: {templateName}"
//       - Incrementar sentCount
//    d. Falha: incrementar failedCount, log error
//    e. Atualizar dispatch no DB a cada batch
// 4. status=COMPLETED, completedAt=now()
// 5. Pusher: notificar workspace

export async function handleDispatchResponse(
  conversationId: string,
  workspaceId: string
): Promise<void>
// Chamado pelo webhook UazAPI quando recebe INBOUND de conversa com dispatchStage=DISPARO_ENVIADO
// 1. Atualizar conversation.dispatchStage = DISPARO_RESPONDIDO
// 2. Incrementar dispatch.respondedCount
// 3. Verificar se SDR está habilitado (AiSalesConfig.isEnabled):
//    - SIM: dispatchStage = SDR_ATIVO, aiSalesEnabled = true
//    - NÃO: dispatchStage = NAO_ATRIBUIDA
// 4. Pusher: notificar para mover card no Kanban + aparecer na inbox
```

### 3.7 Hook no webhook UazAPI

Arquivo: `app/api/webhooks/uazapi/route.ts` — adicionar ANTES do processamento normal:

```typescript
// Após identificar a conversa, ANTES de processar mensagem:
if (direction === 'INBOUND' && conversation.dispatchStage === 'DISPARO_ENVIADO') {
  await handleDispatchResponse(conversation.id, channel.workspaceId)
}
```

### 3.8 API Routes

| Rota | Método | Propósito |
|------|--------|-----------|
| `app/api/waba/connect/route.ts` | POST | Embedded Signup |
| `app/api/waba/channels/route.ts` | GET | Listar canais WABA |
| `app/api/waba/templates/route.ts` | GET/POST | Templates CRUD |
| `app/api/waba/templates/[id]/route.ts` | DELETE | Deletar template |
| `app/api/agents/disparador/route.ts` | POST | Criar disparo `{ wabaChannelId, templateName, listId }` |
| `app/api/agents/disparador/route.ts` | GET | Listar disparos |
| `app/api/agents/disparador/[id]/route.ts` | GET | Status + progresso |
| `app/api/agents/disparador/process/route.ts` | POST | (interno) Processa async |
| `app/api/agents/disparador/conversations/route.ts` | GET | Conversas de disparo (para Kanban/Lista) filtradas por stage |
| `app/api/agents/disparador/conversations/[id]/transfer/route.ts` | POST | Transferir manualmente para inbox/SDR |
| `app/api/webhooks/waba/route.ts` | GET/POST | Webhook Meta (status updates) |

### 3.9 UI — Aba de Disparos (dentro de Agentes)

`app/[workspaceSlug]/agents/disparador/page.tsx`:

**Tab "Conexão WABA":**
- Status do canal WABA (conectado/desconectado)
- Botão "Conectar WhatsApp Business" → Embedded Signup
- Detalhes: número, qualidade, limite de mensagens

**Tab "Templates":**
- Lista com: nome, categoria (badge UTILITY/MARKETING), status (badge APPROVED/PENDING/REJECTED)
- Botão "Criar Template" → modal com preview ao vivo
- Default: categoria UTILITY (R$0.04) com aviso sobre MARKETING (R$0.34)

**Tab "Novo Disparo":**
- Wizard:
  1. Selecionar lista (dropdown das DispatchLists)
  2. Selecionar template (só APPROVED)
  3. Preview: amostra de 3 msgs + "X contatos × 1 token = X tokens" + saldo atual
  4. Confirmar: verifica saldo, cria dispatch, inicia processamento

**Tab "Conversas de Disparo"** (a mais importante):

Toggle de visualização: **Kanban** | **Lista**

**Vista Kanban:**
```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ Disparo Enviado  │  │ Respondido      │  │ Transferido     │
│ (aguardando)     │  │ (cliente falou) │  │ (inbox/SDR)     │
├─────────────────┤  ├─────────────────┤  ├─────────────────┤
│ ┌─────────────┐ │  │ ┌─────────────┐ │  │ ┌─────────────┐ │
│ │ João Silva  │ │  │ │ Maria Lima  │ │  │ │ Pedro Costa │ │
│ │ Dentista    │ │  │ │ Clínica Est │ │  │ │ SDR Ativo   │ │
│ │ 2h atrás    │ │  │ │ "Quero saber│ │  │ │ 5 msgs AI   │ │
│ └─────────────┘ │  │ │  mais..."   │ │  │ └─────────────┘ │
│ ┌─────────────┐ │  │ └─────────────┘ │  │                 │
│ │ Ana Santos  │ │  │                 │  │                 │
│ └─────────────┘ │  │                 │  │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```
- Cards mostram: nome, tipo de negócio, tempo desde envio/resposta, preview da última msg
- Drag & drop para transferir manualmente
- Clicar no card abre a conversa (mesma interface de chat da inbox)
- Filtros: por lista, por disparo, por data

**Vista Lista:**
- Tabela: Nome, Telefone, Lista, Template, Estágio (badge), Última msg, Data
- Filtros: estágio, lista, disparo, data
- Ações em batch: selecionar múltiplos → "Transferir para Inbox" ou "Ativar SDR"
- Ordenação por: data, estágio, nome

**Histórico de Disparos:**
- Lista de disparos: template, lista, progresso (barra), enviados/falhos/respondidos, tokens, data
- Taxa de resposta por disparo
- Botão "Redisparar para esta lista" (com outro template ou o mesmo)

---

## FASE 4: O Vendedor SDR (Agente de IA para Vendas)

### 4.1 Arquitetura — baseada no flow n8n analisado

O Vendedor é o agente mais complexo. Replica fielmente o flow n8n com Redis:

```
Webhook UazAPI (msg inbound)
  ↓
fromMe? ──YES──→ É msg humana (não da AI)? ──YES──→ Block AI (Redis TTL=40min)
  │
  NO
  ↓
Blocked? (Redis check) ──YES──→ STOP
  │
  NO
  ↓
Tipo: áudio → Whisper transcrição
      texto → direto
      imagem → GPT-4o-mini vision
      PDF/doc → extração de texto
  ↓
Debounce (Redis, 15s) — espera msgs pararem
  ↓
AI Agent (GPT-4.1-mini) + histórico (últimas 20 msgs do Prisma)
  ↓
Split resposta em linhas
  ↓
Enviar cada linha com delay 1-2s (simula digitação humana)
  ↓
Consumir 1 token por resposta completa (não por linha)
```

### 4.2 Redis Keys (`lib/agents/vendedor-redis.ts`)

```typescript
// Keys por conversa (conversationId como identificador)
const KEYS = {
  block: (convId: string) => `vendedor:block:${convId}`,
  debounce: (convId: string) => `vendedor:debounce:${convId}`,
  aiBuffer: (convId: string) => `vendedor:ai_buffer:${convId}`,
  lastAiMsg: (convId: string) => `vendedor:last_ai:${convId}`,
}

// Funções Redis:
export async function isBlocked(conversationId: string): Promise<boolean>
// redis.get(KEYS.block(convId)) → se existe, está bloqueado

export async function blockAI(conversationId: string, ttlSeconds = 2400): Promise<void>
// redis.set(KEYS.block(convId), 'true', { ex: ttlSeconds })
// 2400s = 40 minutos (mesmo do n8n)

export async function unblockAI(conversationId: string): Promise<void>
// redis.del(KEYS.block(convId))

export async function addToDebounceBuffer(conversationId: string, message: string): Promise<void>
// redis.rpush(KEYS.debounce(convId), message)

export async function getDebounceBuffer(conversationId: string): Promise<string[]>
// redis.lrange(KEYS.debounce(convId), 0, -1)

export async function clearDebounceBuffer(conversationId: string): Promise<void>
// redis.del(KEYS.debounce(convId))

export async function setLastAiMessage(conversationId: string, message: string): Promise<void>
// redis.set(KEYS.lastAiMsg(convId), message, { ex: 3600 })

export async function getLastAiMessage(conversationId: string): Promise<string | null>
// redis.get(KEYS.lastAiMsg(convId))
```

### 4.3 Human Takeover Detection

Replica a lógica do n8n: se uma mensagem outgoing NÃO é da AI → humano interveio → bloquear.

```typescript
export async function detectHumanTakeover(
  conversationId: string,
  outgoingMessage: string
): Promise<boolean>
// 1. Buscar última msg da AI no Redis
// 2. Se a msg outgoing NÃO contém a última msg da AI → humano mandou manual
// 3. Chamar blockAI(conversationId)
// 4. Retornar true (bloqueou)
```

Hook: no webhook UazAPI, quando `direction === 'OUTBOUND'` (mensagem saindo):
```typescript
if (direction === 'OUTBOUND' && conversation.aiSalesEnabled) {
  detectHumanTakeover(conversation.id, textContent)
}
```

### 4.4 Debounce (15 segundos)

Agrupa mensagens rápidas antes de processar (evita responder a cada "oi" / "tudo bem?" separado):

```typescript
export async function handleInboundWithDebounce(
  conversationId: string,
  message: string,
  workspaceId: string
): Promise<void>
// 1. Adicionar msg ao buffer Redis: addToDebounceBuffer(convId, message)
// 2. Aguardar 15 segundos
// 3. Ler buffer atual: getDebounceBuffer(convId)
// 4. Se a última msg do buffer === message (nenhuma msg nova chegou):
//    a. Limpar buffer: clearDebounceBuffer(convId)
//    b. Concatenar todas as msgs: buffer.join(' ')
//    c. Chamar processAiResponse(workspaceId, convId, concatenatedMsg)
// 5. Se a última msg ≠ message → outra execução cuidará (debounce reset)
```

**Implementação do delay em serverless:**
Usar `setTimeout` com `waitUntil` do Next.js (ou `after()` do Next.js 15+):
```typescript
import { after } from 'next/server'

// No webhook handler:
after(async () => {
  await new Promise(resolve => setTimeout(resolve, 15000))
  // ... checar debounce e processar
})
```

### 4.5 Processamento Multimídia

Replica os nós Switch/Transcrição/Vision do n8n:

```typescript
export async function processMessageContent(
  message: Message,
  mediaUrl?: string
): Promise<string>
// Switch por tipo:
// - 'text' → retorna message.content direto
// - 'audio' → chamar OpenAI Whisper (já existe em app/api/transcription/route.ts)
//   Reusar: importar lógica de transcrição existente
// - 'image' → chamar OpenAI GPT-4o-mini Vision:
//   "Descreva essa imagem, o que tem nela?"
// - 'document' (PDF) → extrair texto (usar pdf-parse ou similar)
// - Qualquer outro → retorna '[mídia não suportada]'
```

### 4.6 AI Agent Core (`lib/agents/vendedor.ts`)

```typescript
export async function processAiResponse(
  workspaceId: string,
  conversationId: string,
  userMessage: string
): Promise<void>
// 1. Verificar AiSalesConfig.isEnabled
// 2. Verificar conversation.aiSalesEnabled
// 3. Verificar isBlocked(conversationId) → se sim, return
// 4. Verificar canConsumeTokens(workspaceId, 1)
// 5. Carregar últimas 20 mensagens da conversa (Prisma query)
// 6. Carregar AiSalesConfig (systemPrompt, businessContext, objectives)
// 7. Chamar OpenAI GPT-4.1-mini:
//    - System prompt: config.systemPrompt + businessContext + objectives
//    - Messages: histórico formatado como [{role, content}]
//    - User message: userMessage concatenado do debounce
//    - Temperature: 0.7
// 8. Parsear resposta
// 9. Split em linhas (mesmo Code_Split do n8n):
//    - Limpar aspas, converter **bold** para *bold*
//    - Quebrar por \n, filtrar linhas vazias
// 10. Para cada linha (com delay aleatório 1-2s entre elas):
//     - Enviar via sendUazapiMessage (função existente em lib/integrations/uazapi.ts)
//     - Salvar Message no DB com aiGenerated=true
//     - Salvar cada linha no Redis AI buffer (para detecção de human takeover)
//     - Trigger Pusher para UI atualizar em real-time
// 11. Consumir 1 token: consumeTokens(workspaceId, 1, 'vendedor', conversationId)
// 12. Incrementar conversation.aiSalesMessageCount
// 13. Guardar última resposta no Redis: setLastAiMessage(convId, fullResponse)
// 14. Verificar max messages: se aiSalesMessageCount >= maxMessagesPerConversation → handoff

// Detecção de ações na resposta (via prompt engineering no system prompt):
// Se resposta contém [HANDOFF] → desativar AI, notificar equipe
// Se resposta contém [AGENDAR] → incluir calendarUrl
// Se resposta contém [PAGAMENTO] → incluir paymentUrl
```

### 4.7 Hook no webhook existente

Arquivo: `app/api/webhooks/uazapi/route.ts`

Dois hooks — um para INBOUND, outro para OUTBOUND:

```typescript
// Após salvar mensagem INBOUND (dentro do bloco !isHistory):
if (direction === 'INBOUND' && conversation.aiSalesEnabled) {
  const processedContent = await processMessageContent(savedMessage, mediaUrl)
  handleInboundWithDebounce(conversation.id, processedContent, channel.workspaceId)
    .catch(err => console.error('[VENDEDOR]', err))
}

// Após salvar mensagem OUTBOUND:
if (direction === 'OUTBOUND' && conversation.aiSalesEnabled) {
  detectHumanTakeover(conversation.id, textContent)
    .catch(err => console.error('[VENDEDOR TAKEOVER]', err))
}
```

### 4.8 Schema

```prisma
model AiSalesConfig {
  id               String   @id @default(uuid())
  workspaceId      String   @unique
  isEnabled        Boolean  @default(false)

  // Identidade do SDR
  agentName        String?              // "Rafael" — como o SDR se apresenta
  tone             String   @default("informal") // "formal" | "informal" | "descontraido"

  // Sobre o negócio (UI guiada)
  businessName     String?              // Nome da empresa
  businessDescription String? @db.Text  // "O que sua empresa faz?"
  targetAudience   String?  @db.Text    // "Para quem você vende?"
  differentials    String?  @db.Text    // "O que te diferencia?"
  productsServices Json     @default("[]") // [{name, price, description}]
  commonObjections Json     @default("[]") // [{objection, response}]

  // Objetivos e ações
  objectives       Json     @default("[\"qualify\",\"schedule\"]")
  calendarUrl      String?
  paymentUrl       String?

  // Prompt (auto-gerado ou customizado)
  systemPrompt     String?  @db.Text    // se preenchido, sobrescreve o auto-gerado
  useCustomPrompt  Boolean  @default(false)

  // Configurações técnicas
  model            String   @default("gpt-4.1-mini")
  maxMessagesPerConversation Int @default(50)
  debounceSeconds  Int      @default(15)
  blockTtlSeconds  Int      @default(2400)

  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  workspace        Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@map("ai_sales_configs")
}

// Adicionar ao Conversation:
//   aiSalesEnabled       Boolean @default(false)
//   aiSalesMessageCount  Int     @default(0)
//   qualificationScore   Int?    // 1-10 (atualizado pelo AI)
//   qualificationNotes   String? // notas do AI sobre o lead

// Adicionar ao Message:
//   aiGenerated          Boolean @default(false)
```

### 4.9 System Prompt Builder (`lib/agents/vendedor-prompt.ts`)

Monta o system prompt automaticamente a partir dos campos da `AiSalesConfig`:

```typescript
export function buildSystemPrompt(config: AiSalesConfig, leadContext?: LeadContext): string
// Se config.useCustomPrompt && config.systemPrompt → retorna prompt customizado
// Senão, monta automaticamente:

// TEMPLATE DO PROMPT AUTO-GERADO:
`Você é ${config.agentName || 'um SDR'}, vendedor(a) da ${config.businessName}.
Tom: ${config.tone}.

## Sobre a Empresa
${config.businessDescription}

## Produtos/Serviços
${config.productsServices.map(p => `- ${p.name}: R$${p.price} — ${p.description}`).join('\n')}

## Público-Alvo
${config.targetAudience}

## Diferenciais
${config.differentials}

## Informações do Lead (se disponível)
Nome: ${leadContext?.name}
Tipo de negócio: ${leadContext?.businessType}
Resumo das avaliações: ${leadContext?.reviewSummary}

## Processo de Qualificação (BANT)
Avalie naturalmente na conversa:
- Budget: Tem capacidade de investir?
- Authority: É o decisor?
- Need: Tem o problema que resolvemos?
- Timeline: Precisa resolver agora?
Score: 1-3 frio, 4-6 morno, 7-10 quente

## Regras
1. Mensagens CURTAS (2-3 linhas max)
2. Seja natural como um humano no WhatsApp
3. NUNCA diga que é IA
4. Use emojis com moderação
5. Português brasileiro

## Fluxo
1. Apresentação → 2. Descoberta (2-3 perguntas) → 3. Qualificação →
4. Proposta de valor → 5. Quebra de objeções → 6. Ação

## Objeções Comuns
${config.commonObjections.map(o => `- "${o.objection}" → ${o.response}`).join('\n')}

## Ações
- [AGENDAR] quando lead aceitar reunião → sistema inclui link ${config.calendarUrl}
- [PAGAMENTO] quando lead quiser comprar → sistema inclui link ${config.paymentUrl}
- [HANDOFF] quando: pedir humano, sair do escopo, objeção técnica complexa`
```

O `LeadContext` é preenchido automaticamente quando a conversa veio de um disparo (dados da `DispatchListContact`).

### 4.10 Token Consumption do SDR

O SDR consome 1 token a cada 10 mensagens AI enviadas:

```typescript
// Após enviar resposta AI:
const newCount = conversation.aiSalesMessageCount + 1
await prisma.conversation.update({ data: { aiSalesMessageCount: newCount } })

// Cobra a cada 10 msgs
if (newCount % 10 === 0) {
  await consumeTokens(workspaceId, 1, 'vendedor', conversationId,
    `SDR: ${newCount} msgs na conversa`)
}
```

### 4.11 API Routes

| Rota | Método | Propósito |
|------|--------|-----------|
| `app/api/agents/vendedor/config/route.ts` | GET | Retorna AiSalesConfig do workspace |
| `app/api/agents/vendedor/config/route.ts` | POST | Cria/atualiza config (campos guiados ou prompt custom) |
| `app/api/agents/vendedor/toggle/route.ts` | POST | Toggle por conversa `{ conversationId, enabled }` |
| `app/api/agents/vendedor/unblock/route.ts` | POST | Manual: desbloqueia AI `{ conversationId }` |
| `app/api/agents/vendedor/stats/route.ts` | GET | Stats: tokens usados, conversas ativas, qualificação média |
| `app/api/agents/vendedor/preview-prompt/route.ts` | POST | Preview: monta prompt a partir dos campos e retorna para o usuário ver |

### 4.12 UI

**Página de config: `app/[workspaceSlug]/agents/vendedor/page.tsx`**

Toggle global ativar/desativar no topo.

**Seção 1 — "Identidade do Vendedor":**
- Input: Nome do vendedor (ex: "Rafael")
- Select: Tom de voz — Formal / Informal / Descontraído

**Seção 2 — "Sobre seu Negócio"** (formulário guiado):
- Input: Nome da empresa
- Textarea: "O que sua empresa faz?" (descrição)
- Textarea: "Para quem você vende?" (público-alvo)
- Textarea: "O que te diferencia?" (diferenciais)

**Seção 3 — "Produtos e Serviços":**
- Tabela editável com botão "+ Adicionar":
  | Nome | Preço | Descrição |
  |------|-------|-----------|
  | Gestão de Redes | R$1.500/mês | Posts + stories + reels |
  | Tráfego Pago | R$2.000/mês | Google Ads + Meta Ads |
- Botão remover por linha

**Seção 4 — "Objeções Comuns":**
- Lista editável com botão "+ Adicionar":
  | Objeção do cliente | Como responder |
  |-------------------|----------------|
  | "Tá caro" | "Entendo! Mas quanto você perde por mês sem..." |
  | "Vou pensar" | "Claro! O que te faria decidir agora?" |

**Seção 5 — "Objetivos e Links":**
- Checkboxes: ☑ Qualificar leads ☑ Agendar reunião ☑ Enviar link de pagamento
- Input: URL do calendário
- Input: URL de pagamento

**Seção 6 — "Configurações Avançadas"** (accordion/colapsável):
- Toggle: "Usar prompt customizado" → se ativo, mostra textarea com prompt
- Botão "Ver prompt gerado" → abre modal com preview do prompt auto-gerado
- Modelo (dropdown: gpt-4.1-mini, gpt-4o-mini, gpt-4o)
- Debounce (slider: 5-30s, default 15s)
- Block TTL (slider: 5-120min, default 40min)
- Max msgs por conversa (default 50)

**Stats do mês** (cards no topo):
- Tokens consumidos | Conversas atendidas | Score médio de qualificação | Handoffs

**Na conversa/inbox (componentes existentes):**
- Toggle "AI Vendedor" por conversa (no header ou drawer)
- Badge violeta "AI" quando ativa
- Indicador "Bloqueado por intervenção humana" (com botão "Reativar AI")
- Mensagens da IA com borda/fundo diferente + label "AI"
- Score de qualificação visível no drawer do lead (1-10 com cor)

---

## FASE 5: Hub de Agentes + Polish

### 5.1 Hub

`app/[workspaceSlug]/agents/page.tsx` — dashboard com 3 cards:

- **O Buscador** — ícone Search, "Extraia leads do Google Maps", stats: `X buscas este mês`, link `/agents/buscador`
- **O Disparador** — ícone Send, "Disparo oficial via WABA", stats: `X tokens disponíveis`, link `/agents/disparador`
- **O Vendedor** — ícone Bot, "Atendimento e vendas com IA", stats: `X conversas ativas`, link `/agents/vendedor`

Cada card mostra status (ativo/inativo) e métricas resumidas.

### 5.2 Navegação

Adicionar "Agentes" no sidebar (`app/[workspaceSlug]/layout.tsx`), entre Pipeline e Settings.
Ícone: `Bot` ou `Cpu` do Lucide.

### 5.3 Widget de Saldo

`components/TokenBalance.tsx` — reutilizável:
- Versão compacta: ícone + número (sidebar, header)
- Versão expandida: saldo + botão "Comprar mais" (hub, antes de disparos)
- Alerta vermelho quando saldo < 50 tokens

---

## Arquivos Críticos a Modificar

| Arquivo existente | Modificação |
|-------------------|-------------|
| `prisma/schema.prisma` | Novos models (DispatchList, DispatchListContact, ScrapingJob, WabaChannel, WabaTemplate, TemplateDispatch, AiSalesConfig, TokenTransaction, TokenPackage) + campos em Workspace/Conversation/Message |
| `app/api/webhooks/kirvano/route.ts` | Branch para compra de tokens |
| `app/api/webhooks/uazapi/route.ts` | Hook dispatch response + Vendedor (INBOUND + OUTBOUND) |
| `lib/billing/planService.ts` | Adicionar `scrapingSearchesPerMonth` |
| `app/[workspaceSlug]/layout.tsx` | Link "Agentes" no sidebar |

## Novos Arquivos

| Arquivo | Propósito |
|---------|-----------|
| **Infra** | |
| `lib/redis.ts` | Cliente Redis (Upstash) |
| `lib/billing/tokenService.ts` | CRUD de tokens (consume/add/balance/history) |
| `lib/billing/tokenPackages.ts` | Config de pacotes |
| **Integrações** | |
| `lib/integrations/google-places.ts` | Google Places API client |
| `lib/integrations/waba.ts` | WABA Cloud API client |
| **Agentes (lógica)** | |
| `lib/agents/buscador.ts` | Search + filter + summarize + criar lista |
| `lib/agents/disparador.ts` | Motor de disparo + handleDispatchResponse |
| `lib/agents/vendedor.ts` | AI Agent core (GPT + actions + split + send) |
| `lib/agents/vendedor-redis.ts` | Redis keys + debounce + block + takeover |
| `lib/agents/vendedor-prompt.ts` | System prompt builder (auto-gerado ou custom) |
| **API — Tokens** | |
| `app/api/tokens/route.ts` | GET saldo + pacotes |
| `app/api/tokens/history/route.ts` | GET histórico |
| **API — Buscador** | |
| `app/api/agents/buscador/route.ts` | POST criar job / GET listar jobs |
| `app/api/agents/buscador/process/route.ts` | POST processamento async |
| `app/api/agents/buscador/[id]/route.ts` | GET status + resultados |
| **API — Listas** | |
| `app/api/agents/listas/route.ts` | GET listar listas |
| `app/api/agents/listas/[id]/route.ts` | GET/PATCH/DELETE lista + contatos |
| **API — WABA** | |
| `app/api/waba/connect/route.ts` | POST Embedded Signup |
| `app/api/waba/channels/route.ts` | GET listar canais |
| `app/api/waba/templates/route.ts` | GET/POST templates |
| `app/api/waba/templates/[id]/route.ts` | DELETE template |
| **API — Disparador** | |
| `app/api/agents/disparador/route.ts` | POST criar disparo / GET listar |
| `app/api/agents/disparador/[id]/route.ts` | GET status + progresso |
| `app/api/agents/disparador/process/route.ts` | POST processamento async |
| `app/api/agents/disparador/conversations/route.ts` | GET conversas de disparo (Kanban/Lista) |
| `app/api/agents/disparador/conversations/[id]/transfer/route.ts` | POST transferir para inbox/SDR |
| `app/api/webhooks/waba/route.ts` | GET/POST webhook Meta |
| **API — Vendedor** | |
| `app/api/agents/vendedor/config/route.ts` | GET/POST config |
| `app/api/agents/vendedor/toggle/route.ts` | POST toggle por conversa |
| `app/api/agents/vendedor/unblock/route.ts` | POST desbloquear AI |
| `app/api/agents/vendedor/stats/route.ts` | GET stats |
| `app/api/agents/vendedor/preview-prompt/route.ts` | POST preview prompt auto-gerado |
| **UI — Páginas** | |
| `app/[workspaceSlug]/agents/page.tsx` | Hub de agentes (3 cards) |
| `app/[workspaceSlug]/agents/buscador/page.tsx` | UI Buscador + Listas |
| `app/[workspaceSlug]/agents/disparador/page.tsx` | UI Disparador (Kanban + Lista + Templates) |
| `app/[workspaceSlug]/agents/vendedor/page.tsx` | UI Vendedor (config) |
| `app/[workspaceSlug]/settings/tokens/page.tsx` | UI Tokens (saldo + pacotes + histórico) |
| **UI — Componentes** | |
| `components/TokenBalance.tsx` | Widget de saldo reutilizável |
| `components/agents/DispatchKanban.tsx` | Kanban de conversas de disparo |
| `components/agents/DispatchListView.tsx` | Vista lista de conversas de disparo |

## Env Vars Necessárias

```
# Fase 0 (Redis)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Fase 2 (Buscador)
GOOGLE_PLACES_API_KEY=

# Fase 3 (Disparador / WABA)
META_WABA_APP_ID=                # pode reusar META_APP_ID se mesmo app
META_WABA_APP_SECRET=            # pode reusar META_APP_SECRET
META_WABA_CONFIG_ID=             # Embedded Signup configuration ID
WABA_WEBHOOK_VERIFY_TOKEN=       # para verificação webhook Meta

# Fase 4 (Vendedor) — já existem
OPENAI_API_KEY=                  # já existe no projeto
```

## Sequência de Implementação

| Fase | O que entrega | Dependência |
|------|---------------|-------------|
| **0** | Redis client + Upstash setup | Nenhuma |
| **1** | Schema + token service + Kirvano tokens + UI compra | Fase 0 |
| **2** | Buscador: Google Places + filtro + review summary + UI | Fase 1 (para limites) |
| **3** | Disparador: WABA + Embedded Signup + templates + dispatch + UI | Fase 1 (para tokens) |
| **4** | Vendedor: GPT-4.1-mini + debounce + human takeover + UI | Fase 0 (Redis) + Fase 1 (tokens) |
| **5** | Hub de agentes + navegação + polish | Fases 2-4 |

## Verificação

- **Fase 0**: `redis.ping()` retorna "PONG"
- **Fase 1**: Comprar pacote via Kirvano → tokenBalance incrementa → histórico registra
- **Fase 2**: Buscar "dentista em São Paulo" → resultados filtrados (rating>3, celular) → review summary → **lista criada automaticamente** "Busca: dentista São Paulo" → ver contatos na lista
- **Fase 3 — Fluxo completo E2E**:
  1. Embedded Signup → canal WABA conectado
  2. Criar template utility → aprovar na Meta
  3. Selecionar lista do Buscador → disparar template
  4. Tokens consumidos (1 por msg)
  5. Conversas criadas com `dispatchStage=DISPARO_ENVIADO`
  6. No Kanban: cards aparecem na coluna "Disparo Enviado"
  7. Cliente responde → webhook UazAPI recebe → `dispatchStage=DISPARO_RESPONDIDO`
  8. Card move para coluna "Respondido" no Kanban
  9. Transferir para inbox: conversa aparece na inbox principal como "Não Atribuída"
  10. Ou transferir para SDR: conversa fica com `aiSalesEnabled=true`
- **Fase 4**: Ativar Vendedor → enviar msg de teste → debounce 15s → resposta AI em múltiplas linhas com delay → token consumido → enviar msg manual → AI bloqueada 40min → botão "Reativar" funciona
- **Fase 5**: Navegação sidebar, hub com stats, widget de saldo em todos os pontos

## Fluxo Completo do Usuário (E2E)

```
1. Buscador: "clínica estética Rio de Janeiro"
   → Lista criada: "Busca: clínica estética Rio de Janeiro" (15 contatos)

2. Disparador: Selecionar lista → Template "promoção" → Disparar
   → 15 templates WABA enviados → 15 tokens consumidos
   → 15 conversas com stage DISPARO_ENVIADO no Kanban

3. 5 clientes respondem (webhook UazAPI)
   → 5 conversas movem para DISPARO_RESPONDIDO no Kanban
   → Se SDR ativo: auto-transfere para SDR_ATIVO

4. SDR (Vendedor) atende automaticamente
   → Responde com delay humanizado
   → Qualifica, agenda reunião ou envia link
   → Handoff para humano quando necessário

5. Humano assume
   → AI bloqueada por 40min
   → Conversa aparece na inbox principal
```
