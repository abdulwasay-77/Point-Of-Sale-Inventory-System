-- AlterTable: product-level variant toggle + optional dimensions
ALTER TABLE "products" ADD COLUMN "is_variant_tracked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "products" ADD COLUMN "length" DECIMAL(65,30);
ALTER TABLE "products" ADD COLUMN "width" DECIMAL(65,30);
ALTER TABLE "products" ADD COLUMN "dimension_unit" TEXT;

-- AlterTable: product_variants — finish out the previously-unused table
-- (price_adjustment was nullable with no default; now NOT NULL default 0,
-- and it gains an is_active flag).
ALTER TABLE "product_variants" ALTER COLUMN "price_adjustment" SET DEFAULT 0;
UPDATE "product_variants" SET "price_adjustment" = 0 WHERE "price_adjustment" IS NULL;
ALTER TABLE "product_variants" ALTER COLUMN "price_adjustment" SET NOT NULL;
ALTER TABLE "product_variants" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable: batches — scope a batch to a specific color when a product
-- is both variant- and batch-tracked
ALTER TABLE "batches" ADD COLUMN "variant_id" TEXT;
ALTER TABLE "batches" ADD CONSTRAINT "batches_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: cost_lots
ALTER TABLE "cost_lots" ADD COLUMN "variant_id" TEXT;
ALTER TABLE "cost_lots" ADD CONSTRAINT "cost_lots_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX IF EXISTS "cost_lots_product_id_batch_id_created_at_idx";
CREATE INDEX "cost_lots_product_id_variant_id_batch_id_created_at_idx" ON "cost_lots"("product_id", "variant_id", "batch_id", "created_at");

-- AlterTable: stock_levels — replace the old unique index with one that
-- also accounts for variant_id
ALTER TABLE "stock_levels" ADD COLUMN "variant_id" TEXT;
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX IF EXISTS "stock_levels_product_id_batch_id_warehouse_id_key";
CREATE UNIQUE INDEX "stock_levels_product_id_variant_id_batch_id_warehouse_id_key" ON "stock_levels"("product_id", "variant_id", "batch_id", "warehouse_id");

-- AlterTable: stock_movements
ALTER TABLE "stock_movements" ADD COLUMN "variant_id" TEXT;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: stock_transfers
ALTER TABLE "stock_transfers" ADD COLUMN "variant_id" TEXT;
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: invoice_items — record exactly which color was sold
ALTER TABLE "invoice_items" ADD COLUMN "variant_id" TEXT;
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
