# Payment Gateway — Kirvano

Este documento descreve a integração com o Kirvano como gateway de pagamento do OmniCRM.

---

## Visão Geral

O Kirvano é um checkout hospedado (hosted checkout). O usuário é redirecionado para uma URL de pagamento do Kirvano, e o Kirvano envia webhooks para o servidor ao ocorrer eventos (compra aprovada, cancelamento, etc.).

**Diferente do Stripe**, não há criação de sessão de checkout via API — os links de pagamento são fixos por plano.

---

## Planos e Links de Checkout

| Plano | Preço/mês | 1º mês | Env Var | Link |
|-------|-----------|--------|---------|------|
| Starter | R$ 197 | R$ 37 | `NEXT_PUBLIC_KIRVANO_STARTER_URL` | `https://pay.kirvano.com/4f4bf484-0113-4257-8199-52f7fa0f5925` |
| Pro | R$ 397 | R$ 37 | `NEXT_PUBLIC_KIRVANO_PRO_URL` | `https://pay.kirvano.com/9ff16802-c829-46e8-a7b1-efc922ff5166` |
| Enterprise | R$ 697 | R$ 37 | `NEXT_PUBLIC_KIRVANO_ENTERPRISE_URL` | `https://pay.kirvano.com/28bdff0e-b8c0-4c72-ba34-ee8b9828fe0f` |

---

## Identificação do Workspace

Como os links de checkout são fixos (sem sessão dinâmica), o workspace é identificado via **UTM parameter**:

```
https://pay.kirvano.com/PLAN_ID?utm_content=WORKSPACE_ID
```

O Kirvano inclui os UTM params no payload do webhook. O handler extrai `utm_content` para encontrar o workspace no banco.

---

## Configuração do Webhook no Kirvano

1. Acesse **Integrações → Webhooks** no painel Kirvano
2. Clique em **Criar Webhook**
3. Preencha:
   - **Nome:** OmniCRM
   - **Webhook URL:** `https://SEU_DOMINIO/api/webhooks/kirvano`
   - **Token:** Gere um token aleatório e salve em `KIRVANO_WEBHOOK_TOKEN` no `.env.local`
   - **Produto:** Selecione os 3 planos
   - **Eventos:** Selecione todos os listados abaixo

---

## Eventos Webhook

### Obrigatórios (afetam status da assinatura)

| Evento Kirvano | Nome no Painel | Ação no sistema |
|----------------|---------------|-----------------|
| `SALE_APPROVED` | Compra aprovada | `subscriptionStatus = ACTIVE`, salva `kirvanoSubscriptionId`, `currentPeriodEnd` |
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

> Recomendação: selecionar todos para ter logs completos.

---

## Payload do Webhook (formato esperado)

```json
{
  "event": "SALE_APPROVED",
  "sale": {
    "id": "sale_xxx",
    "status": "approved"
  },
  "subscription": {
    "id": "sub_xxx",
    "next_billing_date": "2026-04-06T00:00:00Z"
  },
  "customer": {
    "email": "cliente@email.com",
    "name": "Nome do Cliente"
  },
  "utm": {
    "utm_content": "WORKSPACE_ID",
    "utm_source": "...",
    "utm_medium": "..."
  }
}
```

---

## Variáveis de Ambiente

```env
# Kirvano
KIRVANO_WEBHOOK_TOKEN=seu-token-secreto
NEXT_PUBLIC_KIRVANO_STARTER_URL=https://pay.kirvano.com/4f4bf484-0113-4257-8199-52f7fa0f5925
NEXT_PUBLIC_KIRVANO_PRO_URL=https://pay.kirvano.com/9ff16802-c829-46e8-a7b1-efc922ff5166
NEXT_PUBLIC_KIRVANO_ENTERPRISE_URL=https://pay.kirvano.com/28bdff0e-b8c0-4c72-ba34-ee8b9828fe0f
```

---

## Arquivos do Sistema

| Arquivo | Função |
|---------|--------|
| `app/api/webhooks/kirvano/route.ts` | Handler de webhooks — processa eventos e atualiza DB |
| `app/[workspaceSlug]/settings/page.tsx` | UI de billing — botões redirecionam para Kirvano |
| `prisma/schema.prisma` | Campo `kirvanoSubscriptionId` no model `Workspace` |

---

## Autenticação do Webhook

O token é verificado via header `Authorization: Bearer TOKEN` ou `x-kirvano-token`.

Configure o `KIRVANO_WEBHOOK_TOKEN` com o mesmo valor definido no painel do Kirvano.

---

## Como Trocar de Gateway

Para migrar para outro gateway (ex: Stripe, Hotmart, Eduzz):

1. Criar novo handler em `app/api/webhooks/NOVO_GATEWAY/route.ts`
2. Mapear os eventos do novo gateway para `SubscriptionStatus` (`ACTIVE`, `EXPIRED`, `CANCELED`)
3. Garantir que o `workspaceId` seja passado no checkout (via metadata, UTM, ou parâmetro)
4. Atualizar a UI em `app/[workspaceSlug]/settings/page.tsx` com os novos links/API calls
5. Adicionar novas env vars e atualizar este documento
6. Testar com evento de compra aprovada e verificar atualização do banco

---

## Testando a Integração

1. Configure o webhook no painel Kirvano apontando para `https://SEU_DOMINIO/api/webhooks/kirvano`
2. Faça uma compra de teste com o 1º mês (R$ 37)
3. Use a URL: `https://pay.kirvano.com/PLAN_ID?utm_content=SEU_WORKSPACE_ID`
4. Verifique nos logs do servidor se o evento chegou
5. Confirme no banco que `subscriptionStatus = ACTIVE` e `currentPeriodEnd` foram atualizados
