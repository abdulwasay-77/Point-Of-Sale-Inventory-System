-- Platform-managed billing catalog, one current subscription per business,
-- and the tenant payment-submission audit trail. Automated billing actions
-- use a seeded inactive System PlatformAdmin row, so the existing required
-- platform_audit_logs.platform_admin_id FK remains intact.

CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'YEARLY');
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'SUSPENDED');
CREATE TYPE "PaymentSubmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "billing_cycle" "BillingCycle" NOT NULL,
    "trial_period_days" INTEGER NOT NULL DEFAULT 0,
    "default_enabled_modules" TEXT[] NOT NULL,
    "default_max_admin_seats" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plans_name_key" ON "plans"("name");

CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "current_period_start" TIMESTAMP(3) NOT NULL,
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscriptions_business_id_key" ON "subscriptions"("business_id");
CREATE INDEX "subscriptions_plan_id_idx" ON "subscriptions"("plan_id");

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "payout_methods" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "account_title" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "instructions" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payout_methods_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payout_methods_label_key" ON "payout_methods"("label");

CREATE TABLE "payment_submissions" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "payout_method_id" TEXT NOT NULL,
    "submitted_by" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "reference_note" TEXT,
    "screenshot_url" TEXT NOT NULL,
    "status" "PaymentSubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "rejection_reason" TEXT,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_submissions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payment_submissions_business_id_idx" ON "payment_submissions"("business_id");
CREATE INDEX "payment_submissions_plan_id_idx" ON "payment_submissions"("plan_id");
CREATE INDEX "payment_submissions_payout_method_id_idx" ON "payment_submissions"("payout_method_id");
CREATE INDEX "payment_submissions_submitted_by_idx" ON "payment_submissions"("submitted_by");
CREATE INDEX "payment_submissions_reviewed_by_idx" ON "payment_submissions"("reviewed_by");

ALTER TABLE "payment_submissions" ADD CONSTRAINT "payment_submissions_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_submissions" ADD CONSTRAINT "payment_submissions_plan_id_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_submissions" ADD CONSTRAINT "payment_submissions_payout_method_id_fkey"
    FOREIGN KEY ("payout_method_id") REFERENCES "payout_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_submissions" ADD CONSTRAINT "payment_submissions_submitted_by_fkey"
    FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_submissions" ADD CONSTRAINT "payment_submissions_reviewed_by_fkey"
    FOREIGN KEY ("reviewed_by") REFERENCES "platform_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
