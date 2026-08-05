-- AlterTable: payments — how much of a credit payment was handed back as
-- change rather than applied to the invoice's balance (mirrors
-- invoices.change_due). See CreditService#recordPayment.
ALTER TABLE "payments" ADD COLUMN "change_due" DECIMAL(65,30) NOT NULL DEFAULT 0;