-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FLAT');

-- AlterTable: standing discount + target margin on products
ALTER TABLE "products" ADD COLUMN "discount_type" "DiscountType" NOT NULL DEFAULT 'PERCENTAGE';
ALTER TABLE "products" ADD COLUMN "discount_value" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "products" ADD COLUMN "target_margin_pct" DECIMAL(65,30);

-- AlterTable: discount actually applied + frozen cost-of-goods-sold per invoice line
ALTER TABLE "invoice_items" ADD COLUMN "discount_type" "DiscountType" NOT NULL DEFAULT 'PERCENTAGE';
ALTER TABLE "invoice_items" ADD COLUMN "discount_value" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "invoice_items" ADD COLUMN "discount_amount" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "invoice_items" ADD COLUMN "cogs_amount" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- CreateTable: FIFO cost lots. Every purchase creates a new lot at its own
-- cost instead of averaging into (or overwriting) the product's existing
-- cost — stock is immediately sellable in full, at one selling price, while
-- cost is tracked lot-by-lot underneath purely for accurate margin reporting.
CREATE TABLE "cost_lots" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "batch_id" TEXT,
    "warehouse_id" TEXT NOT NULL,
    "purchase_order_id" TEXT,
    "unit_cost" DECIMAL(65,30) NOT NULL,
    "quantity_received" DECIMAL(65,30) NOT NULL,
    "quantity_remaining" DECIMAL(65,30) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_lots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cost_lots_product_id_batch_id_created_at_idx" ON "cost_lots"("product_id", "batch_id", "created_at");

-- AddForeignKey
ALTER TABLE "cost_lots" ADD CONSTRAINT "cost_lots_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cost_lots" ADD CONSTRAINT "cost_lots_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cost_lots" ADD CONSTRAINT "cost_lots_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cost_lots" ADD CONSTRAINT "cost_lots_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: give every existing product an opening cost lot from its
-- current cost_price and current total stock, so FIFO sales have
-- something to consume immediately after this migration runs (otherwise
-- the very first sale after upgrading would have no lot to draw from).
INSERT INTO "cost_lots" ("id", "product_id", "batch_id", "warehouse_id", "unit_cost", "quantity_received", "quantity_remaining", "created_at")
SELECT
  gen_random_uuid()::text,
  sl."product_id",
  sl."batch_id",
  sl."warehouse_id",
  p."cost_price",
  sl."quantity",
  sl."quantity",
  CURRENT_TIMESTAMP
FROM "stock_levels" sl
JOIN "products" p ON p."id" = sl."product_id"
WHERE sl."quantity" > 0;
