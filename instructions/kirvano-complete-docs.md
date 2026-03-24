# Kirvano — Documentação Completa de Integração

Documentação standalone para reutilização em qualquer projeto Next.js + Prisma.

---

## 1. Visão Geral

O **Kirvano** é um gateway de pagamento brasileiro que funciona como **hosted checkout** (checkout hospedado). Os links de pagamento são fixos por produto/plano — não há criação de sessão via API como no Stripe.

**Fluxo básico:**
1. Usuário clica em "Assinar" → redireciona para `https://pay.kirvano.com/PLAN_ID?utm_content=WORKSPACE_ID&utm_source=PLAN_SLUG`
2. Usuário paga no checkout do Kirvano
3. Kirvano envia webhook POST para o servidor com o resultado
4. Servidor atualiza o status da assinatura no banco

**Identificação do workspace via UTM:**
Como os links são fixos (sem sessão dinâmica), o workspace é identificado pelos parâmetros UTM que o Kirvano devolve no payload:
- `utm_content` → ID do workspace
- `utm_source` → slug do plano (ex: `"growth"`, `"tokens_pack-100"`)

---

## 2. Configuração do Webhook no Painel Kirvano

1. Acesse **Integrações → Webhooks** no painel Kirvano
2. Clique em **Criar Webhook**
3. Preencha:
   - **Nome:** Nome do seu app
   - **Webhook URL:** `https://SEU_DOMINIO/api/webhooks/kirvano`
     - ⚠️ Usar `www.seudominio.com` (não sem `www` — causa redirect 301 que pode quebrar o POST)
   - **Token:** Deixar **vazio** (o Kirvano não envia header de auth)
   - **Produto:** Selecionar todos os planos
   - **Eventos:** Selecionar todos os eventos listados na seção 4

---

## 3. Autenticação do Webhook

O Kirvano **não envia token de autenticação** por padrão. A variável `KIRVANO_WEBHOOK_TOKEN` deve estar **vazia ou ausente**.

O handler suporta token opcional — se `KIRVANO_WEBHOOK_TOKEN` estiver definido, valida via:
- Header `Authorization: Bearer <token>`
- Header `X-Kirvano-Token: <token>`

> ⚠️ Se definir `KIRVANO_WEBHOOK_TOKEN` no Vercel/servidor com qualquer valor, todas as requisições do Kirvano retornarão 401 pois ele não envia o header.

---

## 4. Eventos Webhook

### Eventos que alteram status da assinatura

| Evento | Nome no Painel | Ação |
|--------|----------------|------|
| `SALE_APPROVED` | Compra aprovada | Ativa plano (`subscriptionStatus = ACTIVE`) — dispara em compra inicial E renovação |
| `SUBSCRIPTION_RENEWED` | Assinatura renovada | Atualiza `currentPeriodEnd` |
| `SALE_REFUSED` | Compra recusada | `subscriptionStatus = EXPIRED` |
| `SUBSCRIPTION_OVERDUE` | Assinatura atrasada | `subscriptionStatus = EXPIRED` |
| `SALE_CHARGEBACK` | Chargeback | `subscriptionStatus = CANCELED` |
| `REFUND` | Reembolso | `subscriptionStatus = CANCELED` |
| `SUBSCRIPTION_CANCELED` | Assinatura cancelada | `subscriptionStatus = CANCELED` |

### Eventos informativos (apenas log)

| Evento | Nome no Painel |
|--------|----------------|
| `PIX_GENERATED` | PIX gerado |
| `PIX_EXPIRED` | PIX expirado |
| `BANK_SLIP_GENERATED` | Boleto gerado |
| `BANK_SLIP_EXPIRED` | Boleto expirado |
| `PICPAY_GENERATED` | PicPay gerado |
| `PICPAY_EXPIRED` | PicPay expirado |

---

## 5. Estrutura do Payload Webhook

### Interface TypeScript

```typescript
type KirvanoEvent =
  | 'SALE_APPROVED'
  | 'SALE_REFUSED'
  | 'SALE_CHARGEBACK'
  | 'REFUND'
  | 'SUBSCRIPTION_CANCELED'
  | 'SUBSCRIPTION_RENEWED'
  | 'SUBSCRIPTION_OVERDUE'
  | 'BANK_SLIP_GENERATED'
  | 'BANK_SLIP_EXPIRED'
  | 'PIX_GENERATED'
  | 'PIX_EXPIRED'
  | 'PICPAY_GENERATED'
  | 'PICPAY_EXPIRED'

interface KirvanoPayload {
  event: KirvanoEvent
  sale_id?: string           // ID da venda (raiz do payload)
  status?: string            // "APPROVED", "REFUSED", "CHARGEBACK", etc.
  type?: string              // "RECURRING" ou "ONE_TIME"
  plan?: {
    name?: string            // Nome do plano (ex: "Plano Mensal")
    charge_number?: number   // Número da cobrança (1 = primeira)
    charge_frequency?: string // "MONTHLY", "ANNUAL"
    next_charge_date?: string // "2026-04-18 14:42:54" — próxima cobrança
  }
  customer?: {
    email: string
    name: string
    document?: string        // CPF
    phone_number?: string
  }
  products?: Array<{
    id?: string
    name?: string
    offer_id?: string
    offer_name?: string
  }>
  payment?: {
    method?: string          // "PIX", "CREDIT_CARD", "BANK_SLIP"
    qrcode?: string          // Para PIX_GENERATED
    expires_at?: string      // Para PIX/boleto
  }
  utm?: {
    utm_content?: string     // workspaceId (CRÍTICO)
    utm_source?: string      // plan slug (CRÍTICO)
    utm_medium?: string
    utm_campaign?: string
  }
}
```

### Diferença: doc oficial vs. campos reais (confirmados em produção)

| Campo (doc oficial) | Campo real confirmado em prod |
|---------------------|-------------------------------|
| `sale.id` | `sale_id` (raiz do payload) |
| `subscription.next_billing_date` | `plan.next_charge_date` |
| `subscription.id` | Não enviado em `SALE_APPROVED` |

> ⚠️ A documentação oficial do Kirvano pode estar desatualizada. Sempre usar os campos reais acima.

---

## 6. Payloads Reais de Produção

### SALE_APPROVED — Assinatura recorrente

```json
{
  "event": "SALE_APPROVED",
  "event_description": "Compra aprovada",
  "sale_id": "XEQP966E",
  "type": "RECURRING",
  "status": "APPROVED",
  "payment_method": "CREDIT_CARD",
  "total_price": "R$ 1,00",
  "created_at": "2026-03-18 14:42:54",
  "plan": {
    "name": "Plano Mensal",
    "charge_number": 1,
    "charge_frequency": "MONTHLY",
    "next_charge_date": "2026-04-18 14:42:54"
  },
  "customer": {
    "name": "João Silva",
    "email": "joao@example.com",
    "document": "12345678900",
    "phone_number": "5511999999999"
  },
  "products": [
    {
      "id": "1cf14b55-5f3e-4699-a42a-f83bb65f2862",
      "name": "MeuApp",
      "offer_id": "feff51ac-cffb-42e6-81f5-baa96ceeef24",
      "offer_name": "Growth - Até 7 usuários"
    }
  ],
  "utm": {
    "utm_content": "WORKSPACE_ID",
    "utm_source": "growth"
  }
}
```

### SALE_APPROVED — Compra única (sem plano)

```json
{
  "event": "SALE_APPROVED",
  "sale_id": "D2RP8RQ7",
  "type": "ONE_TIME",
  "status": "APPROVED",
  "utm": { "utm_content": "WORKSPACE_ID", "utm_source": "PLAN_SLUG" }
}
```

> `plan` não é enviado para `ONE_TIME`. Usar +30 dias como fallback para `currentPeriodEnd`.

### SALE_REFUSED

```json
{
  "event": "SALE_REFUSED",
  "sale_id": "D2RP8RQ7",
  "type": "ONE_TIME",
  "status": "REFUSED",
  "utm": { "utm_content": "WORKSPACE_ID", "utm_source": "PLAN_SLUG" }
}
```

### SALE_CHARGEBACK

```json
{
  "event": "SALE_CHARGEBACK",
  "sale_id": "D2RP8RQ7",
  "status": "CHARGEBACK",
  "utm": { "utm_content": "WORKSPACE_ID", "utm_source": "PLAN_SLUG" }
}
```

### PIX_GENERATED

```json
{
  "event": "PIX_GENERATED",
  "sale_id": "D2RP8RQ7",
  "status": "PENDING",
  "payment": {
    "method": "PIX",
    "qrcode": "00020101021226870014br.gov.bcb.pix...",
    "expires_at": "2023-12-18 17:38:17"
  },
  "utm": { "utm_content": "WORKSPACE_ID", "utm_source": "PLAN_SLUG" }
}
```

---

## 7. Handler do Webhook (Next.js App Router)

```typescript
// app/api/webhooks/kirvano/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { activatePlan, cancelPlan } from '@/lib/billing/subscriptionService'
import { addTokens } from '@/lib/billing/tokenService'
import { findPackageBySlug } from '@/lib/billing/tokenPackages'
import { TokenTransactionType } from '@/generated/prisma/enums'

type KirvanoEvent =
  | 'SALE_APPROVED' | 'SALE_REFUSED' | 'SALE_CHARGEBACK' | 'REFUND'
  | 'SUBSCRIPTION_CANCELED' | 'SUBSCRIPTION_RENEWED' | 'SUBSCRIPTION_OVERDUE'
  | 'BANK_SLIP_GENERATED' | 'BANK_SLIP_EXPIRED'
  | 'PIX_GENERATED' | 'PIX_EXPIRED'
  | 'PICPAY_GENERATED' | 'PICPAY_EXPIRED'

interface KirvanoPayload {
  event: KirvanoEvent
  sale_id?: string
  status?: string
  type?: string
  plan?: {
    name?: string
    charge_number?: number
    charge_frequency?: string
    next_charge_date?: string
  }
  customer?: { email: string; name: string }
  products?: Array<{ name?: string; offer_name?: string }>
  utm?: {
    utm_content?: string   // workspaceId
    utm_source?: string    // plan slug (e.g. "growth")
    utm_medium?: string
    utm_campaign?: string
  }
}

export async function POST(req: NextRequest) {
  // Verificar token (opcional — deixar KIRVANO_WEBHOOK_TOKEN vazio)
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
    ?? req.headers.get('x-kirvano-token')
  if (process.env.KIRVANO_WEBHOOK_TOKEN && token !== process.env.KIRVANO_WEBHOOK_TOKEN) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  let payload: KirvanoPayload
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Identificar workspace via utm_content
  const workspaceId = payload.utm?.utm_content
  const planSlug = payload.utm?.utm_source ?? 'starter'

  if (!workspaceId) {
    console.warn('[Kirvano] Webhook sem utm_content:', payload.event)
    return NextResponse.json({ received: true })
  }

  const workspace = await db.workspace.findUnique({ where: { id: workspaceId } })
  if (!workspace) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  }

  switch (payload.event) {
    case 'SALE_APPROVED': {
      if (planSlug.startsWith('tokens_')) {
        // Compra de tokens
        const pkgSlug = planSlug.replace('tokens_', '')
        const pkg = findPackageBySlug(pkgSlug)
        if (pkg) {
          await addTokens(workspaceId, pkg.tokenAmount, TokenTransactionType.PURCHASE,
            payload.sale_id, `Compra: ${pkg.name}`)
        }
      } else {
        // Ativação de plano
        const nextBilling = payload.plan?.next_charge_date
          ? new Date(payload.plan.next_charge_date)
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // fallback: +30 dias

        await activatePlan(workspaceId, planSlug, payload.sale_id, nextBilling)
      }
      break
    }

    case 'SUBSCRIPTION_RENEWED': {
      const nextBilling = payload.plan?.next_charge_date
        ? new Date(payload.plan.next_charge_date)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

      await db.workspace.update({
        where: { id: workspaceId },
        data: { subscriptionStatus: 'ACTIVE', currentPeriodEnd: nextBilling },
      })
      await db.subscription.updateMany({
        where: { workspaceId, status: 'ACTIVE' },
        data: { currentPeriodEnd: nextBilling },
      })
      break
    }

    case 'SALE_REFUSED':
    case 'SUBSCRIPTION_OVERDUE': {
      await db.workspace.update({
        where: { id: workspaceId },
        data: { subscriptionStatus: 'EXPIRED' },
      })
      break
    }

    case 'SALE_CHARGEBACK':
    case 'REFUND': {
      if (planSlug.startsWith('tokens_')) {
        const pkgSlug = planSlug.replace('tokens_', '')
        const pkg = findPackageBySlug(pkgSlug)
        if (pkg) {
          await addTokens(workspaceId, -pkg.tokenAmount, TokenTransactionType.REFUND,
            payload.sale_id, `Reembolso: ${pkg.name}`)
        }
      } else {
        await cancelPlan(workspaceId)
      }
      break
    }

    case 'SUBSCRIPTION_CANCELED': {
      await cancelPlan(workspaceId)
      break
    }

    // Eventos informativos — apenas log
    case 'BANK_SLIP_GENERATED':
    case 'BANK_SLIP_EXPIRED':
    case 'PIX_GENERATED':
    case 'PIX_EXPIRED':
    case 'PICPAY_GENERATED':
    case 'PICPAY_EXPIRED':
      console.info(`[Kirvano] Evento informativo: ${payload.event} workspace ${workspaceId}`)
      break
  }

  return NextResponse.json({ received: true })
}
```

---

## 8. Database Schema (Prisma)

### Campos necessários no model Workspace

```prisma
model Workspace {
  id                       String             @id @default(uuid())
  // ... outros campos ...

  // Billing
  subscriptionStatus       SubscriptionStatus @default(TRIAL)
  kirvanoSubscriptionId    String?            // sale_id do Kirvano
  currentPeriodEnd         DateTime?
  trialEndsAt              DateTime?
  plan                     String             @default("trial")
  maxUsers                 Int                @default(2)
  maxConversationsPerMonth Int                @default(10)
  conversationsThisMonth   Int                @default(0)

  // Tokens (se usar sistema de tokens)
  tokenBalance             Int                @default(0)
}
```

### Model Subscription

```prisma
model Subscription {
  id                     String             @id @default(uuid())
  workspaceId            String
  provider               String             @default("kirvano")
  providerSubscriptionId String?            // sale_id do Kirvano
  plan                   String
  status                 SubscriptionStatus
  currentPeriodEnd       DateTime?
  pendingPlan            String?
  pendingUserLimit       Int?
  effectiveDate          DateTime?
  createdAt              DateTime           @default(now())
  updatedAt              DateTime           @updatedAt

  workspace              Workspace          @relation(fields: [workspaceId], references: [id])
}
```

### Enum SubscriptionStatus

```prisma
enum SubscriptionStatus {
  TRIAL
  ACTIVE
  CANCELED
  EXPIRED
}
```

### Model TokenTransaction (se usar tokens)

```prisma
enum TokenTransactionType {
  PURCHASE
  CONSUMPTION
  REFUND
  BONUS
  ADJUSTMENT
}

model TokenTransaction {
  id            String               @id @default(uuid())
  workspaceId   String
  type          TokenTransactionType
  amount        Int                  // positivo = crédito, negativo = débito
  balanceBefore Int
  balanceAfter  Int
  referenceType String?              // "disparador", "vendedor", "buscador", "kirvano_purchase"
  referenceId   String?              // ID da venda ou operação
  description   String?
  createdAt     DateTime             @default(now())

  workspace     Workspace            @relation(fields: [workspaceId], references: [id])
}
```

---

## 9. Planos e Configuração

```typescript
// lib/billing/planService.ts
export interface PlanConfig {
  slug: string
  name: string
  priceCents: number
  userLimit: number
  conversationLimit: number
  checkoutUrl: string
}

export const PLANS: Record<string, PlanConfig> = {
  trial: {
    slug: 'trial',
    name: 'Trial',
    priceCents: 0,
    userLimit: 2,
    conversationLimit: 10,
    checkoutUrl: '',
  },
  solo: {
    slug: 'solo',
    name: 'Solo',
    priceCents: 9700,        // R$97
    userLimit: 1,
    conversationLimit: 999999,
    checkoutUrl: process.env.NEXT_PUBLIC_KIRVANO_CHECKOUT_URL_SOLO ?? '',
  },
  starter: {
    slug: 'starter',
    name: 'Starter',
    priceCents: 29700,       // R$297
    userLimit: 3,
    conversationLimit: 999999,
    checkoutUrl: process.env.NEXT_PUBLIC_KIRVANO_CHECKOUT_URL_STARTER ?? '',
  },
  growth: {
    slug: 'growth',
    name: 'Growth',
    priceCents: 49700,       // R$497
    userLimit: 7,
    conversationLimit: 999999,
    checkoutUrl: process.env.NEXT_PUBLIC_KIRVANO_CHECKOUT_URL_GROWTH ?? '',
  },
  business: {
    slug: 'business',
    name: 'Business',
    priceCents: 99700,       // R$997
    userLimit: 12,
    conversationLimit: 999999,
    checkoutUrl: process.env.NEXT_PUBLIC_KIRVANO_CHECKOUT_URL_BUSINESS ?? '',
  },
}

export function getPlanConfig(slug: string): PlanConfig {
  return PLANS[slug] ?? PLANS.trial
}

export function getUserLimit(slug: string): number {
  return getPlanConfig(slug).userLimit
}

export function getNextPlan(currentSlug: string): PlanConfig | null {
  if (currentSlug === 'trial' || currentSlug === 'solo') return PLANS.starter
  const order = ['starter', 'growth', 'business']
  const idx = order.indexOf(currentSlug)
  if (idx === -1 || idx >= order.length - 1) return null
  return PLANS[order[idx + 1]] ?? null
}
```

---

## 10. Subscription Service

```typescript
// lib/billing/subscriptionService.ts
import { db } from '@/lib/db'
import { getPlanConfig } from './planService'

export async function activatePlan(
  workspaceId: string,
  plan: string,
  providerSubscriptionId?: string,
  currentPeriodEnd?: Date,
) {
  const config = getPlanConfig(plan)
  const periodEnd = currentPeriodEnd ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

  await db.$transaction([
    db.workspace.update({
      where: { id: workspaceId },
      data: {
        plan,
        subscriptionStatus: 'ACTIVE',
        maxUsers: config.userLimit,
        maxConversationsPerMonth: config.conversationLimit,
        currentPeriodEnd: periodEnd,
        kirvanoSubscriptionId: providerSubscriptionId ?? undefined,
      },
    }),
    db.subscription.create({
      data: {
        workspaceId,
        plan,
        status: 'ACTIVE',
        providerSubscriptionId: providerSubscriptionId ?? null,
        currentPeriodEnd: periodEnd,
      },
    }),
  ])
}

export async function cancelPlan(workspaceId: string) {
  await db.workspace.update({
    where: { id: workspaceId },
    data: { subscriptionStatus: 'CANCELED' },
  })
  await db.subscription.updateMany({
    where: { workspaceId, status: 'ACTIVE' },
    data: { status: 'CANCELED' },
  })
}

export async function checkUserLimit(workspaceId: string): Promise<{
  allowed: boolean
  activeUsers: number
  maxUsers: number
  plan: string
}> {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { maxUsers: true, plan: true },
  })
  if (!workspace) return { allowed: false, activeUsers: 0, maxUsers: 0, plan: 'trial' }

  const activeUsers = await db.user.count({
    where: { workspaceId, isActive: true },
  })

  return {
    allowed: activeUsers < workspace.maxUsers,
    activeUsers,
    maxUsers: workspace.maxUsers,
    plan: workspace.plan,
  }
}
```

---

## 11. Token Service

```typescript
// lib/billing/tokenService.ts
import { db } from '@/lib/db'
import { TokenTransactionType } from '@/generated/prisma/enums'

export async function getTokenBalance(workspaceId: string): Promise<number> {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { tokenBalance: true },
  })
  return workspace?.tokenBalance ?? 0
}

export async function canConsumeTokens(workspaceId: string, amount: number): Promise<boolean> {
  const balance = await getTokenBalance(workspaceId)
  return balance >= amount
}

export async function consumeTokens(
  workspaceId: string,
  amount: number,
  referenceType: string,
  referenceId: string,
  description?: string,
): Promise<{ success: boolean; newBalance: number }> {
  return await db.$transaction(async (tx) => {
    const workspace = await tx.workspace.findUnique({
      where: { id: workspaceId },
      select: { tokenBalance: true },
    })
    if (!workspace || workspace.tokenBalance < amount) {
      return { success: false, newBalance: workspace?.tokenBalance ?? 0 }
    }

    const balanceBefore = workspace.tokenBalance
    const balanceAfter = balanceBefore - amount

    await tx.workspace.update({
      where: { id: workspaceId },
      data: { tokenBalance: balanceAfter },
    })

    await tx.tokenTransaction.create({
      data: {
        workspaceId,
        type: TokenTransactionType.CONSUMPTION,
        amount: -amount,
        balanceBefore,
        balanceAfter,
        referenceType,
        referenceId,
        description: description ?? `Consumo ${referenceType}`,
      },
    })

    return { success: true, newBalance: balanceAfter }
  })
}

export async function addTokens(
  workspaceId: string,
  amount: number,            // negativo para estorno
  type: TokenTransactionType,
  referenceId?: string,
  description?: string,
): Promise<{ newBalance: number }> {
  return await db.$transaction(async (tx) => {
    const workspace = await tx.workspace.findUnique({
      where: { id: workspaceId },
      select: { tokenBalance: true },
    })
    const balanceBefore = workspace?.tokenBalance ?? 0
    const balanceAfter = Math.max(0, balanceBefore + amount)

    await tx.workspace.update({
      where: { id: workspaceId },
      data: { tokenBalance: balanceAfter },
    })

    await tx.tokenTransaction.create({
      data: {
        workspaceId,
        type,
        amount,
        balanceBefore,
        balanceAfter,
        referenceId,
        referenceType: type === TokenTransactionType.PURCHASE ? 'kirvano_purchase'
          : type === TokenTransactionType.REFUND ? 'kirvano_refund'
          : undefined,
        description,
      },
    })

    return { newBalance: balanceAfter }
  })
}
```

---

## 12. Token Packages

```typescript
// lib/billing/tokenPackages.ts
export interface TokenPackageConfig {
  slug: string
  name: string
  tokenAmount: number
  priceCents: number
  checkoutUrl: string
  recommended?: boolean
}

// 1 token = R$1,00
export const TOKEN_PACKAGES: TokenPackageConfig[] = [
  { slug: 'pack-50',  name: '50 Tokens',  tokenAmount: 50,  priceCents: 5000,
    checkoutUrl: process.env.NEXT_PUBLIC_KIRVANO_CHECKOUT_URL_TOKENS_50 ?? '' },
  { slug: 'pack-75',  name: '75 Tokens',  tokenAmount: 75,  priceCents: 7500,
    checkoutUrl: process.env.NEXT_PUBLIC_KIRVANO_CHECKOUT_URL_TOKENS_75 ?? '' },
  { slug: 'pack-100', name: '100 Tokens', tokenAmount: 100, priceCents: 10000,
    checkoutUrl: process.env.NEXT_PUBLIC_KIRVANO_CHECKOUT_URL_TOKENS_100 ?? '',
    recommended: true },
  { slug: 'pack-150', name: '150 Tokens', tokenAmount: 150, priceCents: 15000,
    checkoutUrl: process.env.NEXT_PUBLIC_KIRVANO_CHECKOUT_URL_TOKENS_150 ?? '' },
  { slug: 'pack-200', name: '200 Tokens', tokenAmount: 200, priceCents: 20000,
    checkoutUrl: process.env.NEXT_PUBLIC_KIRVANO_CHECKOUT_URL_TOKENS_200 ?? '' },
]

export function findPackageBySlug(slug: string): TokenPackageConfig | undefined {
  return TOKEN_PACKAGES.find((pkg) => pkg.slug === slug)
}

// Taxas de consumo por tipo de agente
export const TOKEN_RATES = {
  buscador:  { tokensPerUnit: 1, unitsPerToken: 2,  unit: 'leads' },
  disparador:{ tokensPerUnit: 1, unitsPerToken: 1,  unit: 'disparo' },
  vendedor:  { tokensPerUnit: 1, unitsPerToken: 10, unit: 'msgs' },
} as const
```

**URL do checkout de tokens:**
```
https://pay.kirvano.com/TOKEN_PLAN_ID?utm_content=WORKSPACE_ID&utm_source=tokens_pack-100
```

O prefixo `tokens_` no `utm_source` é a chave que distingue compra de tokens de ativação de plano no handler.

---

## 13. Conversation Gate

```typescript
// lib/billing/conversationGate.ts
import { db } from '@/lib/db'

/**
 * Verifica se pode criar nova conversa (respeita limite mensal do plano).
 * Conversas existentes sempre permitidas.
 */
export async function canCreateConversation(
  workspaceId: string,
  channelId: string,
  externalId: string,
): Promise<boolean> {
  // Conversa já existente — sempre permitido
  const existing = await db.conversation.findUnique({
    where: { workspaceId_channelId_externalId: { workspaceId, channelId, externalId } },
    select: { id: true },
  })
  if (existing) return true

  // Nova conversa — verificar limite
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { conversationsThisMonth: true, maxConversationsPerMonth: true },
  })
  if (!workspace) return false
  return workspace.conversationsThisMonth < workspace.maxConversationsPerMonth
}

/**
 * Incrementa contador de conversas. Chamar após criar nova conversa.
 */
export async function incrementConversationCount(workspaceId: string): Promise<void> {
  await db.workspace.update({
    where: { id: workspaceId },
    data: { conversationsThisMonth: { increment: 1 } },
  })
}
```

**Uso nos webhooks de mensagem:**
```typescript
// Antes de criar nova conversa
const canCreate = await canCreateConversation(workspaceId, channelId, externalId)
if (!canCreate) return // silenciosamente ignorar

// Depois de criar
await incrementConversationCount(workspaceId)
```

---

## 14. Status Lifecycle

```
Workspace criado → TRIAL (2 usuários, 10 conversas/mês)
     ↓ SALE_APPROVED
   ACTIVE (limites do plano aplicados)
     ↓ SUBSCRIPTION_RENEWED      → continua ACTIVE (atualiza currentPeriodEnd)
     ↓ SALE_REFUSED / OVERDUE    → EXPIRED
     ↓ CHARGEBACK / REFUND / CANCELED → CANCELED
```

| Status | Acesso à plataforma | Efeito na UI |
|--------|---------------------|--------------|
| `TRIAL` | Limitado (2 users, 10 convos) | Banner de trial |
| `ACTIVE` | Completo (limites do plano) | Normal |
| `EXPIRED` | Bloqueado | Modal bloqueante + link para checkout |
| `CANCELED` | Bloqueado | Modal bloqueante + link para checkout |

---

## 15. UI — Modal Bloqueante

```tsx
// components/billing/SubscriptionBlockedModal.tsx
'use client'

import { AlertTriangle, CreditCard } from 'lucide-react'
import { getPlanConfig } from '@/lib/billing/planService'

interface SubscriptionBlockedModalProps {
  workspaceId: string
  plan: string
  status: 'EXPIRED' | 'CANCELED'
}

export function SubscriptionBlockedModal({ workspaceId, plan, status }: SubscriptionBlockedModalProps) {
  const planConfig = getPlanConfig(plan)

  function handleRegularize() {
    const url = planConfig.checkoutUrl
      ? `${planConfig.checkoutUrl}?utm_content=${workspaceId}&utm_source=${plan}`
      : '#'
    window.location.href = url
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 mx-4">
        <div className="flex flex-col items-center text-center">
          <AlertTriangle size={28} className="text-red-500 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            {status === 'EXPIRED' ? 'Pagamento em atraso' : 'Assinatura cancelada'}
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            {status === 'EXPIRED'
              ? 'Regularize o pagamento para continuar usando a plataforma.'
              : 'Renove sua assinatura para continuar.'}
          </p>
          <button
            onClick={handleRegularize}
            className="w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-3 rounded-xl text-sm"
          >
            <CreditCard size={15} className="inline mr-2" />
            Regularizar pagamento
          </button>
        </div>
      </div>
    </div>
  )
}
```

**Renderização no layout (bloqueia toda a UI):**
```tsx
// app/[workspaceSlug]/layout.tsx
const isBlocked =
  workspace?.subscriptionStatus === 'EXPIRED' ||
  workspace?.subscriptionStatus === 'CANCELED'

if (isBlocked && workspace) {
  return (
    <div>
      {children}
      <SubscriptionBlockedModal
        workspaceId={workspace.id}
        plan={workspace.plan}
        status={workspace.subscriptionStatus as 'EXPIRED' | 'CANCELED'}
      />
    </div>
  )
}
```

---

## 16. API Routes de Billing

### GET /api/billing

Retorna dados atuais da assinatura.

```typescript
// app/api/billing/route.ts
// Retorna:
{
  plan: string              // slug do plano atual
  status: SubscriptionStatus
  currentPeriodEnd: string | null
  trialEndsAt: string | null
  activeUsers: number
  maxUsers: number
  conversationsThisMonth: number
  maxConversationsPerMonth: number
  tokenBalance: number
}
```

### GET /api/billing/history

Retorna histórico de pagamentos (todos os registros `Subscription` do workspace).

```typescript
// Retorna array de Subscription[]
[
  {
    id: string
    plan: string
    status: SubscriptionStatus
    providerSubscriptionId: string | null  // sale_id do Kirvano
    currentPeriodEnd: string | null
    createdAt: string
  }
]
```

> Múltiplos registros `ACTIVE` são normais — um por pagamento. O status real é `Workspace.subscriptionStatus`.

---

## 17. Variáveis de Ambiente

```env
# ==============================
# KIRVANO — Checkout URLs
# ==============================
# Links fixos dos planos no painel Kirvano → Produtos → Oferta → Link de Checkout

# Planos de assinatura
NEXT_PUBLIC_KIRVANO_CHECKOUT_URL_SOLO=https://pay.kirvano.com/SEU_LINK_SOLO
NEXT_PUBLIC_KIRVANO_CHECKOUT_URL_STARTER=https://pay.kirvano.com/SEU_LINK_STARTER
NEXT_PUBLIC_KIRVANO_CHECKOUT_URL_GROWTH=https://pay.kirvano.com/SEU_LINK_GROWTH
NEXT_PUBLIC_KIRVANO_CHECKOUT_URL_BUSINESS=https://pay.kirvano.com/SEU_LINK_BUSINESS

# Pacotes de tokens (se usar sistema de tokens)
NEXT_PUBLIC_KIRVANO_CHECKOUT_URL_TOKENS_50=https://pay.kirvano.com/SEU_LINK_TOKENS_50
NEXT_PUBLIC_KIRVANO_CHECKOUT_URL_TOKENS_75=https://pay.kirvano.com/SEU_LINK_TOKENS_75
NEXT_PUBLIC_KIRVANO_CHECKOUT_URL_TOKENS_100=https://pay.kirvano.com/SEU_LINK_TOKENS_100
NEXT_PUBLIC_KIRVANO_CHECKOUT_URL_TOKENS_150=https://pay.kirvano.com/SEU_LINK_TOKENS_150
NEXT_PUBLIC_KIRVANO_CHECKOUT_URL_TOKENS_200=https://pay.kirvano.com/SEU_LINK_TOKENS_200

# Token de auth do webhook — DEVE estar VAZIO (Kirvano não envia header de auth)
# KIRVANO_WEBHOOK_TOKEN=   # ← NÃO definir / deixar comentado
```

---

## 18. Fluxo de Checkout (Frontend)

```typescript
// Como montar a URL de checkout com UTM
function getCheckoutUrl(planSlug: string, workspaceId: string): string {
  const config = getPlanConfig(planSlug)
  if (!config.checkoutUrl) return '#'
  return `${config.checkoutUrl}?utm_content=${workspaceId}&utm_source=${planSlug}`
}

// Para tokens
function getTokenCheckoutUrl(packageSlug: string, workspaceId: string): string {
  const pkg = TOKEN_PACKAGES.find(p => p.slug === packageSlug)
  if (!pkg?.checkoutUrl) return '#'
  return `${pkg.checkoutUrl}?utm_content=${workspaceId}&utm_source=tokens_${packageSlug}`
}
```

---

## 19. Como Testar

1. Configure o webhook no painel Kirvano com URL `https://SEU_DOMINIO/api/webhooks/kirvano` (sem token)
2. Construa a URL de checkout:
   ```
   https://pay.kirvano.com/PLAN_ID?utm_content=SEU_WORKSPACE_ID&utm_source=PLAN_SLUG
   ```
3. Faça uma compra de teste (Kirvano tem modo de teste/sandbox)
4. Verifique nos logs do servidor se o evento chegou com status 200
5. Confirme no banco: `subscriptionStatus = ACTIVE`, `currentPeriodEnd` correto
6. Para testar modal bloqueante: defina `subscriptionStatus = EXPIRED` manualmente no banco e recarregue

**Simular webhook com curl:**
```bash
curl -X POST https://SEU_DOMINIO/api/webhooks/kirvano \
  -H "Content-Type: application/json" \
  -d '{
    "event": "SALE_APPROVED",
    "sale_id": "TEST123",
    "type": "RECURRING",
    "plan": { "next_charge_date": "2026-04-23 10:00:00" },
    "utm": { "utm_content": "SEU_WORKSPACE_ID", "utm_source": "growth" }
  }'
```

---

## 20. Como Migrar para Outro Projeto

1. Copiar os arquivos de `lib/billing/` (planService, subscriptionService, tokenService, tokenPackages, conversationGate)
2. Criar rota `app/api/webhooks/kirvano/route.ts`
3. Adicionar campos ao schema Prisma (seção 8) e rodar `npx prisma db push`
4. Criar os produtos no painel Kirvano e copiar os links de checkout para as env vars
5. Configurar webhook no painel Kirvano apontando para a nova URL
6. **Não definir** `KIRVANO_WEBHOOK_TOKEN`
7. Adicionar `<SubscriptionBlockedModal>` no layout principal
8. Chamar `canCreateConversation` / `incrementConversationCount` nos webhooks de mensagem

---

## 21. Arquivos de Referência

| Arquivo | Função |
|---------|--------|
| `app/api/webhooks/kirvano/route.ts` | Handler principal de webhooks |
| `lib/billing/subscriptionService.ts` | `activatePlan`, `cancelPlan`, `checkUserLimit` |
| `lib/billing/planService.ts` | Configs dos planos, preços, URLs |
| `lib/billing/tokenService.ts` | `addTokens`, `consumeTokens`, `getTokenBalance` |
| `lib/billing/tokenPackages.ts` | Configs dos pacotes de tokens + `TOKEN_RATES` |
| `lib/billing/conversationGate.ts` | Gate de limite de conversas por plano |
| `components/billing/SubscriptionBlockedModal.tsx` | Modal bloqueante EXPIRED/CANCELED |
| `components/billing/PlansContent.tsx` | UI completa de billing |
| `app/api/billing/route.ts` | GET — dados atuais da assinatura |
| `app/api/billing/history/route.ts` | GET — histórico de pagamentos |
| `app/[workspaceSlug]/layout.tsx` | Renderiza modal bloqueante se necessário |
| `__tests__/webhooks/kirvano.test.ts` | Testes do webhook handler |
| `__tests__/billing/subscriptionService.test.ts` | Testes do subscription service |
