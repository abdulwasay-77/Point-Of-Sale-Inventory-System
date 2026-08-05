-- ⚠️ Run this only after deleting any test products/colors created under
-- the old per-product color feature (e.g. "Test Product"). This migration
-- assumes "product_variants" is empty going in — it adds
-- "variation_value_id" as NOT NULL, and there is no meaningful value to
-- backfill old free-typed color names with, since they were never linked
-- to a global Variation to begin with. If you have real data you can't
-- delete, stop and ask before running this.

-- CreateEnum
CREATE TYPE "VariationValueType" AS ENUM ('TEXT', 'MEASUREMENT');

-- CreateTable: variations — reusable variation TYPES (e.g. "Color",
-- "Diameter"), defined once, independent of any product. Same role as
-- "categories" already plays for Product.category_id.
CREATE TABLE "variations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value_type" "VariationValueType" NOT NULL DEFAULT 'TEXT',
    "unit" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "variations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "variations_name_key" ON "variations"("name");

-- CreateTable: variation_values — the reusable values under a variation
-- (e.g. "Red", "6" under "Diameter" with unit "inch"), each with its own
-- default price add-on.
CREATE TABLE "variation_values" (
    "id" TEXT NOT NULL,
    "variation_id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "price_adjustment" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "variation_values_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "variation_values_variation_id_value_key" ON "variation_values"("variation_id", "value");
ALTER TABLE "variation_values" ADD CONSTRAINT "variation_values_variation_id_fkey" FOREIGN KEY ("variation_id") REFERENCES "variations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: products — replace the old is_variant_tracked boolean with
-- a nullable pointer at a global Variation (same shape as category_id).
ALTER TABLE "products" DROP COLUMN "is_variant_tracked";
ALTER TABLE "products" ADD COLUMN "variation_id" TEXT;
ALTER TABLE "products" ADD CONSTRAINT "products_variation_id_fkey" FOREIGN KEY ("variation_id") REFERENCES "variations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: product_variants — a variant is now a link to a specific
-- global VariationValue, not a free-typed name. price_adjustment moves
-- to variation_values (see above); price_override replaces it here as an
-- optional per-combination exception.
ALTER TABLE "product_variants" DROP CONSTRAINT IF EXISTS "product_variants_product_id_variant_name_key";
ALTER TABLE "product_variants" DROP COLUMN "variant_name";
ALTER TABLE "product_variants" DROP COLUMN "price_adjustment";
ALTER TABLE "product_variants" ADD COLUMN "variation_value_id" TEXT NOT NULL;
ALTER TABLE "product_variants" ADD COLUMN "price_override" DECIMAL(65,30);
ALTER TABLE "product_variants" ADD COLUMN "image_url" TEXT;
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_variation_value_id_fkey" FOREIGN KEY ("variation_value_id") REFERENCES "variation_values"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "product_variants_product_id_variation_value_id_key" ON "product_variants"("product_id", "variation_value_id");
