-- Staff Expense Management module.
--
-- Independent from Payroll — this tracks discretionary staff spend
-- against a shared, admin-set budget pool (e.g. "buy lunch, Rs 400"),
-- not salary. Kept as its own history table (staff_expenses) rather
-- than writing into payroll_records, since this is spend *from* a
-- budget, not income *to* the employee.

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('RECORDED', 'VOIDED');

-- CreateTable: expense_budgets (single row — same get-or-create pattern
-- as business_settings; see expenses.service.js#getBudget). Holds both
-- the manually-set budget pool AND the manually-set default per-expense
-- limit, so an admin edits both from one settings-style form.
CREATE TABLE "expense_budgets" (
    "id" TEXT NOT NULL DEFAULT 'expense_budget',
    "total_amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "current_balance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "default_max_per_expense" DECIMAL(65,30) NOT NULL DEFAULT 1000,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT,

    CONSTRAINT "expense_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable: expense_budget_adjustments — full audit trail of every
-- manual change to the budget pool (top-ups, reductions), so "who
-- changed the budget and when" is always answerable.
CREATE TABLE "expense_budget_adjustments" (
    "id" TEXT NOT NULL,
    "budget_id" TEXT NOT NULL,
    "previous_total" DECIMAL(65,30) NOT NULL,
    "new_total" DECIMAL(65,30) NOT NULL,
    "difference" DECIMAL(65,30) NOT NULL,
    "reason" TEXT,
    "adjusted_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_budget_adjustments_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "expense_budget_adjustments" ADD CONSTRAINT "expense_budget_adjustments_budget_id_fkey"
    FOREIGN KEY ("budget_id") REFERENCES "expense_budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: staff_expense_limits — per-employee override of the
-- budget's default_max_per_expense. No row for an employee simply means
-- "use the current default" (see ExpensesService#getEffectiveLimit) —
-- so raising the org-wide default later doesn't require touching every
-- employee who never had a custom limit set.
CREATE TABLE "staff_expense_limits" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "max_amount" DECIMAL(65,30) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "staff_expense_limits_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "staff_expense_limits_employee_id_key" ON "staff_expense_limits"("employee_id");
ALTER TABLE "staff_expense_limits" ADD CONSTRAINT "staff_expense_limits_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: staff_expenses — the actual deduction history. status
-- uses the same VOID-not-delete pattern already used for invoices
-- (InvoiceStatus.VOID) and stock movements (MovementType.VOID_REVERSAL)
-- so a bad entry can be reversed (refunded back to the budget) without
-- ever losing the audit trail.
CREATE TABLE "staff_expenses" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "expense_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "balance_after" DECIMAL(65,30) NOT NULL,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'RECORDED',
    "voided_at" TIMESTAMP(3),
    "voided_by" TEXT,
    "void_reason" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_expenses_pkey" PRIMARY KEY ("id")
);
-- Composite index for the common "one staff member, filtered by date"
-- history query; a second single-column index covers "all staff,
-- filtered by date" (admin's full history view).
CREATE INDEX "staff_expenses_employee_id_expense_date_idx" ON "staff_expenses"("employee_id", "expense_date");
CREATE INDEX "staff_expenses_expense_date_idx" ON "staff_expenses"("expense_date");
ALTER TABLE "staff_expenses" ADD CONSTRAINT "staff_expenses_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Grant the two new permissions to existing roles, same pattern as the
-- dynamic_roles migration (see PERMISSIONS in config/permissions.js).
--
-- EXPENSES_MANAGE (set budget, set limits, void, full staff history) —
-- ADMIN and ACCOUNTANT, matching how PAYROLL_MANAGE is already scoped.
INSERT INTO "role_permissions" ("id", "role_id", "permission")
SELECT gen_random_uuid()::text, r.id, 'EXPENSES_MANAGE'
FROM "roles" r
WHERE r.name IN ('ADMIN', 'ACCOUNTANT');

-- EXPENSES_RECORD (log your own expense, view your own history) — every
-- role. This module is for all staff, not one department.
INSERT INTO "role_permissions" ("id", "role_id", "permission")
SELECT gen_random_uuid()::text, r.id, 'EXPENSES_RECORD'
FROM "roles" r
WHERE r.name IN ('ADMIN', 'ACCOUNTANT', 'SALES_STAFF', 'WAREHOUSE_STAFF');