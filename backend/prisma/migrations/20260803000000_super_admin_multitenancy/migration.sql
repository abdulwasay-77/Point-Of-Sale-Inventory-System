-- Super Admin / multi-tenancy, part 2 of 2 (run after
-- 20260802000000_remove_builtin_roles).
--
-- Adds Business/PlatformAdmin/PlatformAuditLog (platform-level, not
-- tenant-scoped) and business_id to every tenant-owned table, so one
-- shared database can hold many businesses' data with hard isolation
-- enforced at the query layer (see backend/src/config/db.js) and backed
-- here by real foreign keys and compound unique constraints.
--
-- Written for a full `prisma migrate reset` (already agreed for the
-- built-in-roles change this pairs with) — every ADD COLUMN below is
-- NOT NULL with no backfill step, which is only safe against an empty
-- database. Do not run this against a database with existing rows in
-- any of the tables below without adding a default value + backfill
-- step first.

-- CreateEnum
CREATE TYPE "BusinessStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED');

-- CreateTable: businesses — one row per client. See business.service.js.
CREATE TABLE "businesses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "BusinessStatus" NOT NULL DEFAULT 'TRIAL',
    "industry_type" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "enabled_modules" TEXT[],
    "max_admin_seats" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "businesses_slug_key" ON "businesses"("slug");

-- CreateTable: platform_admins — the platform owner's own login(s).
-- Deliberately separate from "users", not a role/flag inside it — see
-- schema.prisma comment above the PlatformAdmin model.
CREATE TABLE "platform_admins" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_admins_email_key" ON "platform_admins"("email");

-- CreateTable: platform_audit_logs — platform-level actions only,
-- separate from the per-business "audit_logs" table.
CREATE TABLE "platform_audit_logs" (
    "id" TEXT NOT NULL,
    "platform_admin_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_business_id" TEXT,
    "changes" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "platform_audit_logs" ADD CONSTRAINT "platform_audit_logs_platform_admin_id_fkey"
    FOREIGN KEY ("platform_admin_id") REFERENCES "platform_admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- business_id on every tenant-owned table
-- ============================================================

ALTER TABLE "users" ADD COLUMN "business_id" TEXT NOT NULL;
ALTER TABLE "roles" ADD COLUMN "business_id" TEXT NOT NULL;
ALTER TABLE "role_permissions" ADD COLUMN "business_id" TEXT NOT NULL;
ALTER TABLE "user_permissions" ADD COLUMN "business_id" TEXT NOT NULL;
ALTER TABLE "audit_logs" ADD COLUMN "business_id" TEXT NOT NULL;
ALTER TABLE "categories" ADD COLUMN "business_id" TEXT NOT NULL;
ALTER TABLE "products" ADD COLUMN "business_id" TEXT NOT NULL;
ALTER TABLE "product_variants" ADD COLUMN "business_id" TEXT NOT NULL;
ALTER TABLE "variations" ADD COLUMN "business_id" TEXT NOT NULL;
ALTER TABLE "variation_values" ADD COLUMN "business_id" TEXT NOT NULL;
ALTER TABLE "kits" ADD COLUMN "business_id" TEXT NOT NULL;
ALTER TABLE "kit_components" ADD COLUMN "business_id" TEXT NOT NULL;
ALTER TABLE "warehouses" ADD COLUMN "business_id" TEXT NOT NULL;
ALTER TABLE "batches" ADD COLUMN "business_id" TEXT NOT NULL;
ALTER TABLE "cost_lots" ADD COLUMN "business_id" TEXT NOT NULL;
ALTER TABLE "stock_levels" ADD COLUMN "business_id" TEXT NOT NULL;
ALTER TABLE "stock_movements" ADD COLUMN "business_id" TEXT NOT NULL;
ALTER TABLE "stock_transfers" ADD COLUMN "business_id" TEXT NOT NULL;
ALTER TABLE "customers" ADD COLUMN "business_id" TEXT NOT NULL;
ALTER TABLE "customer_ledger_entries" ADD COLUMN "business_id" TEXT NOT NULL;
ALTER TABLE "invoices" ADD COLUMN "business_id" TEXT NOT NULL;
ALTER TABLE "invoice_items" ADD COLUMN "business_id" TEXT NOT NULL;
ALTER TABLE "payments" ADD COLUMN "business_id" TEXT NOT NULL;
ALTER TABLE "installment_plans" ADD COLUMN "business_id" TEXT NOT NULL;
ALTER TABLE "installment_payments" ADD COLUMN "business_id" TEXT NOT NULL;
ALTER TABLE "suppliers" ADD COLUMN "business_id" TEXT NOT NULL;
ALTER TABLE "supplier_ledger_entries" ADD COLUMN "business_id" TEXT NOT NULL;
ALTER TABLE "purchase_orders" ADD COLUMN "business_id" TEXT NOT NULL;
ALTER TABLE "purchase_order_items" ADD COLUMN "business_id" TEXT NOT NULL;
ALTER TABLE "employees" ADD COLUMN "business_id" TEXT NOT NULL;
ALTER TABLE "payroll_records" ADD COLUMN "business_id" TEXT NOT NULL;
ALTER TABLE "commission_records" ADD COLUMN "business_id" TEXT NOT NULL;
ALTER TABLE "expense_budget_adjustments" ADD COLUMN "business_id" TEXT NOT NULL;
ALTER TABLE "staff_expense_limits" ADD COLUMN "business_id" TEXT NOT NULL;
ALTER TABLE "staff_expenses" ADD COLUMN "business_id" TEXT NOT NULL;

ALTER TABLE "users" ADD CONSTRAINT "users_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "roles" ADD CONSTRAINT "roles_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "categories" ADD CONSTRAINT "categories_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "variations" ADD CONSTRAINT "variations_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "variation_values" ADD CONSTRAINT "variation_values_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "kits" ADD CONSTRAINT "kits_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "kit_components" ADD CONSTRAINT "kit_components_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "batches" ADD CONSTRAINT "batches_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cost_lots" ADD CONSTRAINT "cost_lots_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customers" ADD CONSTRAINT "customers_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_ledger_entries" ADD CONSTRAINT "customer_ledger_entries_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "installment_payments" ADD CONSTRAINT "installment_payments_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_ledger_entries" ADD CONSTRAINT "supplier_ledger_entries_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employees" ADD CONSTRAINT "employees_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_records" ADD CONSTRAINT "payroll_records_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "commission_records" ADD CONSTRAINT "commission_records_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expense_budget_adjustments" ADD CONSTRAINT "expense_budget_adjustments_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_expense_limits" ADD CONSTRAINT "staff_expense_limits_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_expenses" ADD CONSTRAINT "staff_expenses_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "users_business_id_idx" ON "users"("business_id");
CREATE INDEX "roles_business_id_idx" ON "roles"("business_id");
CREATE INDEX "role_permissions_business_id_idx" ON "role_permissions"("business_id");
CREATE INDEX "user_permissions_business_id_idx" ON "user_permissions"("business_id");
CREATE INDEX "audit_logs_business_id_idx" ON "audit_logs"("business_id");
CREATE INDEX "categories_business_id_idx" ON "categories"("business_id");
CREATE INDEX "products_business_id_idx" ON "products"("business_id");
CREATE INDEX "product_variants_business_id_idx" ON "product_variants"("business_id");
CREATE INDEX "variations_business_id_idx" ON "variations"("business_id");
CREATE INDEX "variation_values_business_id_idx" ON "variation_values"("business_id");
CREATE INDEX "kits_business_id_idx" ON "kits"("business_id");
CREATE INDEX "kit_components_business_id_idx" ON "kit_components"("business_id");
CREATE INDEX "warehouses_business_id_idx" ON "warehouses"("business_id");
CREATE INDEX "batches_business_id_idx" ON "batches"("business_id");
CREATE INDEX "cost_lots_business_id_idx" ON "cost_lots"("business_id");
CREATE INDEX "stock_levels_business_id_idx" ON "stock_levels"("business_id");
CREATE INDEX "stock_movements_business_id_idx" ON "stock_movements"("business_id");
CREATE INDEX "stock_transfers_business_id_idx" ON "stock_transfers"("business_id");
CREATE INDEX "customers_business_id_idx" ON "customers"("business_id");
CREATE INDEX "customer_ledger_entries_business_id_idx" ON "customer_ledger_entries"("business_id");
CREATE INDEX "invoices_business_id_idx" ON "invoices"("business_id");
CREATE INDEX "invoice_items_business_id_idx" ON "invoice_items"("business_id");
CREATE INDEX "payments_business_id_idx" ON "payments"("business_id");
CREATE INDEX "installment_plans_business_id_idx" ON "installment_plans"("business_id");
CREATE INDEX "installment_payments_business_id_idx" ON "installment_payments"("business_id");
CREATE INDEX "suppliers_business_id_idx" ON "suppliers"("business_id");
CREATE INDEX "supplier_ledger_entries_business_id_idx" ON "supplier_ledger_entries"("business_id");
CREATE INDEX "purchase_orders_business_id_idx" ON "purchase_orders"("business_id");
CREATE INDEX "purchase_order_items_business_id_idx" ON "purchase_order_items"("business_id");
CREATE INDEX "employees_business_id_idx" ON "employees"("business_id");
CREATE INDEX "payroll_records_business_id_idx" ON "payroll_records"("business_id");
CREATE INDEX "commission_records_business_id_idx" ON "commission_records"("business_id");
CREATE INDEX "expense_budget_adjustments_business_id_idx" ON "expense_budget_adjustments"("business_id");
CREATE INDEX "staff_expense_limits_business_id_idx" ON "staff_expense_limits"("business_id");
CREATE INDEX "staff_expenses_business_id_idx" ON "staff_expenses"("business_id");

-- ============================================================
-- users.role -> roles.name: drop the OLD fkey first
-- ============================================================
-- Must happen before the "roles" compound-unique conversion below —
-- Postgres won't let "roles_name_key" be dropped while
-- "users_role_fkey" still depends on it as its FK target.
ALTER TABLE "users" DROP CONSTRAINT "users_role_fkey";

-- ============================================================
-- Per-business compound uniques (was global @unique, now unique only
-- within a business — e.g. two businesses can each have their own role
-- called "Cashier", or their own product SKU "SKU-001")
-- ============================================================

DROP INDEX "roles_name_key";
CREATE UNIQUE INDEX "roles_business_id_name_key" ON "roles"("business_id", "name");

DROP INDEX "categories_name_key";
CREATE UNIQUE INDEX "categories_business_id_name_key" ON "categories"("business_id", "name");

DROP INDEX "products_sku_key";
CREATE UNIQUE INDEX "products_business_id_sku_key" ON "products"("business_id", "sku");

DROP INDEX "products_barcode_key";
CREATE UNIQUE INDEX "products_business_id_barcode_key" ON "products"("business_id", "barcode");

DROP INDEX "product_variants_sku_key";
CREATE UNIQUE INDEX "product_variants_business_id_sku_key" ON "product_variants"("business_id", "sku");

DROP INDEX "variations_name_key";
CREATE UNIQUE INDEX "variations_business_id_name_key" ON "variations"("business_id", "name");

DROP INDEX "kits_sku_key";
CREATE UNIQUE INDEX "kits_business_id_sku_key" ON "kits"("business_id", "sku");

DROP INDEX "invoices_invoice_number_key";
CREATE UNIQUE INDEX "invoices_business_id_invoice_number_key" ON "invoices"("business_id", "invoice_number");

DROP INDEX "purchase_orders_po_number_key";
CREATE UNIQUE INDEX "purchase_orders_business_id_po_number_key" ON "purchase_orders"("business_id", "po_number");

-- ============================================================
-- users.role -> roles.name: recreate as a compound FK
-- ============================================================
-- Needs "roles_business_id_name_key" (just created above) to exist
-- first — a role's name alone isn't a valid FK target anymore now
-- that two businesses can each have their own role with the same name.
ALTER TABLE "users" ADD CONSTRAINT "users_business_id_role_fkey"
    FOREIGN KEY ("business_id", "role") REFERENCES "roles"("business_id", "name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- business_settings / expense_budgets: singleton -> one-per-business
-- ============================================================

-- "business_settings".id stops being a fixed literal default ('business_settings' /
-- 'expense_budget') and goes back to being a plain uuid, generated
-- client-side same as every other model's id (Prisma never represents
-- @default(uuid()) as a real Postgres DEFAULT — compare to every other
-- "id" column in this project's migration history).
ALTER TABLE "business_settings" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "business_settings" ADD COLUMN "business_id" TEXT NOT NULL;
ALTER TABLE "business_settings" ADD CONSTRAINT "business_settings_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "business_settings_business_id_key" ON "business_settings"("business_id");

-- "expense_budgets".id stops being a fixed literal default ('business_settings' /
-- 'expense_budget') and goes back to being a plain uuid, generated
-- client-side same as every other model's id (Prisma never represents
-- @default(uuid()) as a real Postgres DEFAULT — compare to every other
-- "id" column in this project's migration history).
ALTER TABLE "expense_budgets" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "expense_budgets" ADD COLUMN "business_id" TEXT NOT NULL;
ALTER TABLE "expense_budgets" ADD CONSTRAINT "expense_budgets_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "expense_budgets_business_id_key" ON "expense_budgets"("business_id");
