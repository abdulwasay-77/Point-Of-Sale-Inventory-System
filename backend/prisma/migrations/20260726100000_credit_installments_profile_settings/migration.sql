-- CreateEnum
CREATE TYPE "ThemePreference" AS ENUM ('LIGHT', 'DARK');
CREATE TYPE "InvoiceType" AS ENUM ('SALE', 'LATE_FEE');
CREATE TYPE "InstallmentPlanStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'DEFAULTED');

-- AlterTable: users — Profile module fields
ALTER TABLE "users" ADD COLUMN "avatar_url" TEXT;
ALTER TABLE "users" ADD COLUMN "contact_phone" TEXT;
ALTER TABLE "users" ADD COLUMN "address" TEXT;
ALTER TABLE "users" ADD COLUMN "theme_preference" "ThemePreference" NOT NULL DEFAULT 'LIGHT';

-- AlterTable: employees — Profile module fields
ALTER TABLE "employees" ADD COLUMN "contact_phone" TEXT;
ALTER TABLE "employees" ADD COLUMN "address" TEXT;

-- AlterTable: invoices — CustomerCredit due date + late-fee linkage
ALTER TABLE "invoices" ADD COLUMN "due_date" TIMESTAMP(3);
ALTER TABLE "invoices" ADD COLUMN "invoice_type" "InvoiceType" NOT NULL DEFAULT 'SALE';
ALTER TABLE "invoices" ADD COLUMN "related_invoice_id" TEXT;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_related_invoice_id_fkey" FOREIGN KEY ("related_invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: payments — link to a specific scheduled installment
ALTER TABLE "payments" ADD COLUMN "installment_payment_id" TEXT;

-- CreateTable: installment_plans
CREATE TABLE "installment_plans" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "total_amount" DECIMAL(65,30) NOT NULL,
    "down_payment" DECIMAL(65,30) NOT NULL,
    "min_down_payment_pct" DECIMAL(65,30) NOT NULL,
    "installment_count" INTEGER NOT NULL,
    "installment_amount" DECIMAL(65,30) NOT NULL,
    "frequency_days" INTEGER NOT NULL DEFAULT 30,
    "status" "InstallmentPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "installment_plans_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "installment_plans_invoice_id_key" ON "installment_plans"("invoice_id");
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: installment_payments
CREATE TABLE "installment_payments" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "paid_date" TIMESTAMP(3),
    "status" "PaidStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "installment_payments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "installment_payments_plan_id_sequence_key" ON "installment_payments"("plan_id", "sequence");
ALTER TABLE "installment_payments" ADD CONSTRAINT "installment_payments_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "installment_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payments" ADD CONSTRAINT "payments_installment_payment_id_fkey" FOREIGN KEY ("installment_payment_id") REFERENCES "installment_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: business_settings (single row)
CREATE TABLE "business_settings" (
    "id" TEXT NOT NULL DEFAULT 'business_settings',
    "company_name" TEXT,
    "logo_url" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "tax_id" TEXT,
    "invoice_footer_note" TEXT,
    "currency_symbol" TEXT NOT NULL DEFAULT '₹',
    "default_gst_rate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "invoice_number_prefix" TEXT NOT NULL DEFAULT 'INV-',
    "min_down_payment_pct" DECIMAL(65,30) NOT NULL DEFAULT 20,
    "low_stock_alerts" BOOLEAN NOT NULL DEFAULT true,
    "overdue_credit_alerts" BOOLEAN NOT NULL DEFAULT true,
    "session_timeout_minutes" INTEGER NOT NULL DEFAULT 60,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "business_settings_pkey" PRIMARY KEY ("id")
);
