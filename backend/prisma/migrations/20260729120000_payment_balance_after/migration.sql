-- AlterTable: payments — snapshot of the invoice's remaining balance
-- immediately after this payment (mirrors customer_ledger_entries.balance_after).
-- Needed for the CustomerCredit "In Progress" tab, which lists every
-- partial payment against a still-outstanding invoice along with the
-- remaining balance at that point in time.
ALTER TABLE "payments" ADD COLUMN "balance_after" DECIMAL(65,30);

-- Backfill existing rows: for every payment tied to an invoice, compute
-- the running total paid on that invoice up to and including this payment
-- (ordered by payment_date, then id as a tiebreaker for same-timestamp
-- rows), and subtract that from the invoice's total_amount. This
-- reconstructs the historical remaining-balance-after-payment for data
-- that was recorded before this column existed.
WITH ordered_payments AS (
  SELECT
    p.id,
    i.total_amount,
    SUM(p.amount) OVER (
      PARTITION BY p.invoice_id
      ORDER BY p.payment_date, p.id
    ) AS cumulative_paid
  FROM "payments" p
  JOIN "invoices" i ON i.id = p.invoice_id
  WHERE p.invoice_id IS NOT NULL
)
UPDATE "payments" p
SET "balance_after" = op.total_amount - op.cumulative_paid
FROM ordered_payments op
WHERE p.id = op.id;