-- Batch tracking rework:
--  1. shade_code is removed entirely (redundant now that proper
--     Variations exist -- "shade" is just a variation value). Before
--     dropping the column on `batches`, fold any existing non-null
--     shade_code into that batch's own batch_number (e.g. batch "B1"
--     with shade "Red" becomes "B1-Red") so no historical data is
--     silently dropped -- there's no reliable way to auto-convert free
--     text into a real Variation value, so this is the safe fallback.
--  2. Batch-number uniqueness moves from a DB-level
--     @@unique([product_id, batch_number]) to being scoped by
--     product + variant and enforced in application code (see
--     products.service.js#assertBatchNumberAvailable) -- two different
--     variants of the same product are now allowed to share a batch
--     number.

-- Step 1: fold shade_code into batch_number on `batches` before the
-- column disappears.
UPDATE "batches"
SET "batch_number" = "batch_number" || '-' || "shade_code"
WHERE "shade_code" IS NOT NULL AND "shade_code" <> '';

-- Step 2: drop the old DB-level uniqueness constraint (product_id +
-- batch_number only -- didn't account for variant_id at all, which is
-- also what let two different variants collide, and what let the old
-- upsert in purchases.service.js misattribute a new variant's stock to
-- another variant's existing batch).
DROP INDEX IF EXISTS "batches_product_id_batch_number_key";

-- Step 3: replace it with a plain index for lookup performance --
-- uniqueness itself is now enforced in application code, scoped by
-- product + variant (see assertBatchNumberAvailable).
CREATE INDEX "batches_product_id_variant_id_idx" ON "batches"("product_id", "variant_id");

-- Step 4: drop shade_code from `batches`, now that its data has been
-- folded into batch_number above.
ALTER TABLE "batches" DROP COLUMN "shade_code";

-- Step 5: shade_code on `purchase_order_items` predates the Variations
-- module in the same way -- a purchase line's variant selection now
-- covers this. There is no batch_number-equivalent field on this table
-- to fold the value into (batch_number here is just a free-text note of
-- what was typed on that purchase line, not a link to a real Batch row),
-- so this one is dropped outright rather than concatenated -- the
-- historical purchase line still keeps its own batch_number as typed.
ALTER TABLE "purchase_order_items" DROP COLUMN "shade_code";
