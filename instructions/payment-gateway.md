# Payment Gateway — Kirvano

Este documento descreve a integração com o Kirvano como gateway de pagamento do ClosioCRM.

---

## Visão Geral

O Kirvano é um checkout hospedado (hosted checkout). O usuário é redirecionado para uma URL de pagamento do Kirvano, e o Kirvano envia webhooks para o servidor ao ocorrer eventos (compra aprovada, cancelamento, etc.).

**Diferente do Stripe**, não há criação de sessão de checkout via API — os links de pagamento são fixos por plano.

---

## Planos e Links de Checkout

| Plano | Usuários | Env Var | Link Kirvano |
|-------|----------|---------|--------------|
| Solo | 1 | `NEXT_PUBLIC_KIRVANO_CHECKOUT_URL_SOLO` | `https://pay.kirvano.com/9ff16802-c829-46e8-a7b1-efc922ff5166` |
| Starter | 3 | `NEXT_PUBLIC_KIRVANO_CHECKOUT_URL_STARTER` | `https://pay.kirvano.com/4f4bf484-0113-4257-8199-52f7fa0f5925` |
| Growth | 7 | `NEXT_PUBLIC_KIRVANO_CHECKOUT_URL_GROWTH` | `https://pay.kirvano.com/feff51ac-cffb-42e6-81f5-baa96ceeef24` |
| Business | 12 | `NEXT_PUBLIC_KIRVANO_CHECKOUT_URL_BUSINESS` | `https://pay.kirvano.com/7523a079-81e7-48f8-8176-1613dd7d27eb` |

---

## Identificação do Workspace

Como os links de checkout são fixos (sem sessão dinâmica), o workspace é identificado via **UTM parameters**:

```
https://pay.kirvano.com/PLAN_ID?utm_content=WORKSPACE_ID&utm_source=PLAN_SLUG
```

O Kirvano inclui os UTM params no payload do webhook. O handler extrai:
- `utm_content` → `workspaceId` (para encontrar o workspace no banco)
- `utm_source` → slug do plano (ex: `"growth"`)

---

## Configuração do Webhook no Kirvano

1. Acesse **Integrações → Webhooks** no painel Kirvano
2. Clique em **Criar Webhook**
3. Preencha:
   - **Nome:** ClosioCRM
   - **Webhook URL:** `https://www.closiocrm.com/api/webhooks/kirvano`
     - ⚠️ Usar `www.closiocrm.com` (não `closiocrm.com` — causa redirect 301)
   - **Token:** Deixar vazio (sem autenticação por token)
   - **Produto:** Selecionar todos os planos
   - **Eventos:** Selecionar todos os listados abaixo

---

## Eventos Webhook

### Obrigatórios (afetam status da assinatura)

| Evento Kirvano | Nome no Painel | Ação no sistema |
|----------------|---------------|-----------------|
| `SALE_APPROVED` | Compra aprovada | `subscriptionStatus = ACTIVE`, salva `currentPeriodEnd` — dispara em compra inicial E em cada renovação mensal (`type: "RECURRING"`) |
| `SALE_REFUSED` | Compra recusada | `subscriptionStatus = EXPIRED` |
| `SUBSCRIPTION_OVERDUE` | Assinatura atrasada | `subscriptionStatus = EXPIRED` |
| `SALE_CHARGEBACK` | Chargeback | `subscriptionStatus = CANCELED` |
| `REFUND` | Reembolso | `subscriptionStatus = CANCELED` |
| `SUBSCRIPTION_CANCELED` | Assinatura cancelada | `subscriptionStatus = CANCELED` |
| `SUBSCRIPTION_RENEWED` | Assinatura renovada | `subscriptionStatus = ACTIVE`, atualiza `currentPeriodEnd` |

### Opcionais (apenas log, não alteram status)

| Evento Kirvano | Nome no Painel |
|----------------|---------------|
| `PIX_GENERATED` | PIX gerado |
| `PIX_EXPIRED` | PIX expirado |
| `BANK_SLIP_GENERATED` | Boleto gerado |
| `BANK_SLIP_EXPIRED` | Boleto expirado |
| `PICPAY_GENERATED` | PicPay gerado |
| `PICPAY_EXPIRED` | PicPay expirado |

---

## Payload Real do Webhook (confirmado em produção)

### Compra aprovada — Assinatura (`SALE_APPROVED` + `type: "RECURRING"`)

Dispara em toda compra/renovação de plano recorrente. Campo `plan.next_charge_date` indica a próxima cobrança.

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
    "name": "Gustavo Bragaia",
    "email": "gustavobragaia12@gmail.com",
    "document": "51052499848",
    "phone_number": "5519996767751"
  },
  "products": [
    {
      "id": "1cf14b55-5f3e-4699-a42a-f83bb65f2862",
      "name": "ClosioCRM",
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

### Compra aprovada — Única (`SALE_APPROVED` + `type: "ONE_TIME"`)

Sem campo `plan`. O sistema usa +30 dias como fallback para `currentPeriodEnd`.

```json
{
  "event": "SALE_APPROVED",
  "sale_id": "D2RP8RQ7",
  "type": "ONE_TIME",
  "status": "APPROVED",
  "utm": { "utm_content": "WORKSPACE_ID", "utm_source": "PLAN_SLUG" }
}
```

### Compra recusada (`SALE_REFUSED`)

```json
{
  "event": "SALE_REFUSED",
  "sale_id": "D2RP8RQ7",
  "type": "ONE_TIME",
  "status": "REFUSED",
  "utm": { "utm_content": "WORKSPACE_ID", "utm_source": "PLAN_SLUG" }
}
```

### Chargeback (`SALE_CHARGEBACK`)

```json
{
  "event": "SALE_CHARGEBACK",
  "sale_id": "D2RP8RQ7",
  "status": "CHARGEBACK",
  "utm": { "utm_content": "WORKSPACE_ID", "utm_source": "PLAN_SLUG" }
}
```

### PIX gerado (`PIX_GENERATED`)

```json
{
  "event": "PIX_GENERATED",
  "sale_id": "D2RP8RQ7",
  "status": "PENDING",
  "payment": {
    "method": "PIX",
    "qrcode": "...",
    "expires_at": "2023-12-18 17:38:17"
  },
  "utm": { "utm_content": "WORKSPACE_ID", "utm_source": "PLAN_SLUG" }
}
```

---

## Estrutura de Campos — Diferença da Documentação Oficial vs Real

| Campo (doc oficial) | Campo real (confirmado em prod) |
|---------------------|--------------------------------|
| `sale.id` | `sale_id` (raiz do payload) |
| `subscription.next_billing_date` | `plan.next_charge_date` |
| `subscription.id` | Não enviado em `SALE_APPROVED` |

> **Atenção:** A documentação oficial do Kirvano mostra uma estrutura desatualizada. Sempre usar os campos reais confirmados acima.

---

## Autenticação do Webhook

Sem token de autenticação — o Kirvano não envia headers de auth. A variável `KIRVANO_WEBHOOK_TOKEN` deve estar **vazia ou ausente** no Vercel. Se preenchida, todas as requisições retornam 401.

---

## Status da Assinatura

| Status | Quando | Efeito na UI |
|--------|--------|--------------|
| `TRIAL` | Padrão em workspaces novos | Banner de trial na sidebar |
| `ACTIVE` | Após pagamento aprovado | Acesso normal |
| `EXPIRED` | Pagamento recusado / em atraso | Modal bloqueante — não consegue usar a plataforma |
| `CANCELED` | Cancelamento / chargeback / reembolso | Modal bloqueante — não consegue usar a plataforma |

Quando `EXPIRED` ou `CANCELED`, o layout renderiza `<SubscriptionBlockedModal>` com link direto para o checkout do plano atual.

---

## Histórico de Pagamentos

Cada `SALE_APPROVED` cria um novo registro na tabela `Subscription` → aparece na aba "Histórico" em Configurações → Billing.

Múltiplos registros com `status = ACTIVE` são normais (um por pagamento). O status real da assinatura é controlado pelo campo `Workspace.subscriptionStatus`, não pela tabela `Subscription`.

---

## Variáveis de Ambiente

```env
# Kirvano (sem KIRVANO_WEBHOOK_TOKEN — não usar)
NEXT_PUBLIC_KIRVANO_CHECKOUT_URL_SOLO=https://pay.kirvano.com/9ff16802-c829-46e8-a7b1-efc922ff5166
NEXT_PUBLIC_KIRVANO_CHECKOUT_URL_STARTER=https://pay.kirvano.com/4f4bf484-0113-4257-8199-52f7fa0f5925
NEXT_PUBLIC_KIRVANO_CHECKOUT_URL_GROWTH=https://pay.kirvano.com/feff51ac-cffb-42e6-81f5-baa96ceeef24
NEXT_PUBLIC_KIRVANO_CHECKOUT_URL_BUSINESS=https://pay.kirvano.com/7523a079-81e7-48f8-8176-1613dd7d27eb
```

---

## Arquivos do Sistema

| Arquivo | Função |
|---------|--------|
| `app/api/webhooks/kirvano/route.ts` | Handler de webhooks — processa eventos e atualiza DB |
| `lib/billing/subscriptionService.ts` | `activatePlan`, `cancelPlan`, `checkUserLimit` |
| `lib/billing/planService.ts` | Configs dos planos + URLs de checkout |
| `lib/billing/conversationGate.ts` | Gate de limite de conversas |
| `components/billing/SubscriptionBlockedModal.tsx` | Modal bloqueante para EXPIRED/CANCELED |
| `components/billing/PlansContent.tsx` | UI de billing — planos, histórico, uso |
| `components/UpgradeModal.tsx` | Modal de upgrade (limite de usuários atingido) |
| `app/[workspaceSlug]/layout.tsx` | Layout principal — renderiza modal bloqueante se necessário |
| `prisma/schema.prisma` | Modelos `Workspace`, `Subscription`, `Plan` |

---

## Como Testar a Integração

1. Configure o webhook no painel Kirvano com URL `https://www.closiocrm.com/api/webhooks/kirvano` (sem token)
2. Use a URL de checkout com UTM: `https://pay.kirvano.com/PLAN_ID?utm_content=SEU_WORKSPACE_ID&utm_source=PLAN_SLUG`
3. Faça uma compra de teste
4. Verifique nos logs do Vercel se o evento chegou com status 200
5. Confirme no banco: `subscriptionStatus = ACTIVE`, `currentPeriodEnd` correto
6. Para testar o modal bloqueante: defina manualmente `subscriptionStatus = EXPIRED` no banco e recarregue a página

---

## Como Trocar de Gateway

Para migrar para outro gateway (ex: Stripe, Hotmart):

1. Criar novo handler em `app/api/webhooks/NOVO_GATEWAY/route.ts`
2. Mapear os eventos para `SubscriptionStatus` (`ACTIVE`, `EXPIRED`, `CANCELED`)
3. Garantir que o `workspaceId` seja passado no checkout (via metadata, UTM, ou parâmetro)
4. Atualizar a UI em `components/billing/PlansContent.tsx` com os novos links
5. Adicionar novas env vars e atualizar este documento
