/**
 * One-time script to fix trial workspaces that were created with wrong default limits.
 * Sets maxUsers=2 and maxConversationsPerMonth=10 for all TRIAL workspaces with wrong values.
 *
 * Usage:
 *   bun run scripts/fix-trial-limits.ts
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
require('dotenv').config({ path: '.env.local' })

import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 1 })
const db = new PrismaClient({ adapter })

async function main() {
  const result = await db.workspace.updateMany({
    where: {
      subscriptionStatus: 'TRIAL',
      OR: [
        { maxUsers: { not: 2 } },
        { maxConversationsPerMonth: { not: 10 } },
      ],
    },
    data: {
      maxUsers: 2,
      maxConversationsPerMonth: 10,
    },
  })

  if (result.count === 0) {
    console.log('✓ All TRIAL workspaces already have correct limits. Nothing to update.')
  } else {
    console.log(`✓ Updated ${result.count} TRIAL workspace(s) → maxUsers=2, maxConversationsPerMonth=10`)
  }
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
