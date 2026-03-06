-- Remove Stripe-related columns and indexes that were removed from schema but never dropped from DB

-- Drop stripe index from workspaces
DROP INDEX IF EXISTS "workspaces_stripeCustomerId_idx";

-- Drop stripe columns from workspaces
ALTER TABLE "workspaces" DROP COLUMN IF EXISTS "stripeCustomerId";
ALTER TABLE "workspaces" DROP COLUMN IF EXISTS "stripeSubscriptionId";

-- Drop stripe columns from plans
ALTER TABLE "plans" DROP COLUMN IF EXISTS "stripePriceIdMonthly";
ALTER TABLE "plans" DROP COLUMN IF EXISTS "stripePriceIdAnnual";
