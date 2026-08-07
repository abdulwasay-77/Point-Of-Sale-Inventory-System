-- General-purpose readiness: dynamic units of measure, multi-axis
-- product variations, generic tax terminology.
--
-- Written for a full `prisma migrate reset` (already agreed) — no
-- backfill logic, since there's no existing data by the time this runs.
-- Every real column/constraint name below was confirmed by actually
-- replaying this project's full migration history against a live
-- Postgres instance and introspecting the resulting tables (\d products,
-- \d product_variants, etc.) rather than guessed from reading old SQL —
-- same verification approach as the super-admin migration.

-- ============================================================
-- 1. Drop what's being replaced, in dependency order (FKs and the
--    unique index that depends on one of them, before the columns
--    they're attached to)
-- ============================================================

ALTER TABLE "products" DROP CONSTRAINT "products_variation_id_fkey";
ALTER TABLE "product_variants" DROP CONSTRAINT "product_variants_variation_value_id_fkey";
DROP INDEX "product_variants_product_id_variation_value_id_key";

-- ============================================================
-- 2. Units of measure — replaces the fixed UomType enum
-- ============================================================

CREATE TABLE "units_of_measure" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "business_id" TEXT NOT NULL,

    CONSTRAINT "units_of_measure_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "units_of_measure" ADD CONSTRAINT "units_of_measure_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "units_of_measure_business_id_name_key" ON "units_of_measure"("business_id", "name");
CREATE INDEX "units_of_measure_business_id_idx" ON "units_of_measure"("business_id");

-- ============================================================
-- 3. Multi-axis variations — a product can now use MULTIPLE Variations
--    at once (e.g. both Color and Size), and a variant is the SET of
--    values across those axes, not a single value.
-- ============================================================

CREATE TABLE "product_variation_axes" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "variation_id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,

    CONSTRAINT "product_variation_axes_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "product_variation_axes" ADD CONSTRAINT "product_variation_axes_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_variation_axes" ADD CONSTRAINT "product_variation_axes_variation_id_fkey"
    FOREIGN KEY ("variation_id") REFERENCES "variations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_variation_axes" ADD CONSTRAINT "product_variation_axes_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "product_variation_axes_product_id_variation_id_key" ON "product_variation_axes"("product_id", "variation_id");
CREATE INDEX "product_variation_axes_business_id_idx" ON "product_variation_axes"("business_id");

CREATE TABLE "product_variant_values" (
    "id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "variation_value_id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,

    CONSTRAINT "product_variant_values_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "product_variant_values" ADD CONSTRAINT "product_variant_values_variant_id_fkey"
    FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_variant_values" ADD CONSTRAINT "product_variant_values_variation_value_id_fkey"
    FOREIGN KEY ("variation_value_id") REFERENCES "variation_values"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_variant_values" ADD CONSTRAINT "product_variant_values_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "product_variant_values_variant_id_variation_value_id_key" ON "product_variant_values"("variant_id", "variation_value_id");
CREATE INDEX "product_variant_values_business_id_idx" ON "product_variant_values"("business_id");

-- product_variants no longer has its own single value column — every
-- combination now comes from the join table above.
ALTER TABLE "product_variants" DROP COLUMN "variation_value_id";

-- products no longer has a single variation_id — replaced by
-- product_variation_axes above (zero, one, or many per product).
ALTER TABLE "products" DROP COLUMN "variation_id";

-- ============================================================
-- 4. products.base_uom: fixed enum -> FK to units_of_measure
-- ============================================================

ALTER TABLE "products" ADD COLUMN "base_uom_id" TEXT NOT NULL;
ALTER TABLE "products" ADD CONSTRAINT "products_base_uom_id_fkey"
    FOREIGN KEY ("base_uom_id") REFERENCES "units_of_measure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" DROP COLUMN "base_uom";

-- invoice_items.uom_used: fixed enum -> plain string SNAPSHOT (not an
-- FK — see schema.prisma comment: a unit renamed/deleted after a sale
-- must never rewrite a historical invoice line).
ALTER TABLE "invoice_items" ALTER COLUMN "uom_used" TYPE TEXT;

-- Now safe to drop the enum type itself — both columns that used it are
-- gone.
DROP TYPE "UomType";

-- ============================================================
-- 5. Generic tax terminology (was India/Pakistan-specific GST/HSN
--    naming — the underlying % mechanism is unchanged, only the name
--    and, for tax_code, its requiredness)
-- ============================================================

ALTER TABLE "products" RENAME COLUMN "gst_rate" TO "tax_rate";
ALTER TABLE "products" RENAME COLUMN "hsn_code" TO "tax_code";
ALTER TABLE "products" ALTER COLUMN "tax_code" DROP NOT NULL;

ALTER TABLE "business_settings" RENAME COLUMN "default_gst_rate" TO "default_tax_rate";
