/**
 * Script to set a workspace as the demo account (Growth plan, active subscription).
 *
 * Usage:
 *   DEMO_SLUG=your-workspace-slug bun run scripts/setup-demo.ts
 *
 * Or edit DEMO_WORKSPACE_SLUG below and run:
 *   bun run scripts/setup-demo.ts
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
require('dotenv').config({ path: '.env.local' })

import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 1 })
const db = new PrismaClient({ adapter })

const DEMO_WORKSPACE_SLUG = process.env.DEMO_SLUG ?? 'demo'

async function main() {
  const workspace = await db.workspace.findUnique({ where: { slug: DEMO_WORKSPACE_SLUG } })
  if (!workspace) {
    console.error(`Workspace with slug "${DEMO_WORKSPACE_SLUG}" not found.`)
    process.exit(1)
  }

  const currentPeriodEnd = new Date('2100-01-01T00:00:00.000Z')

  await db.workspace.update({
    where: { slug: DEMO_WORKSPACE_SLUG },
    data: {
      plan: 'growth',
      maxUsers: 7,
      maxConversationsPerMonth: 999999,
      subscriptionStatus: 'ACTIVE',
      currentPeriodEnd,
      trialEndsAt: null,
    },
  })

  // Clear existing subscriptions and create a clean demo record
  await db.subscription.deleteMany({ where: { workspaceId: workspace.id } })
  await db.subscription.create({
    data: {
      workspaceId: workspace.id,
      provider: 'kirvano',
      providerSubscriptionId: 'demo-growth-sub-001',
      plan: 'growth',
      status: 'ACTIVE',
      currentPeriodEnd,
    },
  })

  console.log(`✓ Workspace "${workspace.name}" (${DEMO_WORKSPACE_SLUG}) set to Growth plan.`)
  console.log(`  Period: agora → ${currentPeriodEnd.toLocaleDateString('pt-BR')}`)
  console.log(`  maxUsers: 7 | conversas: ilimitadas`)
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
