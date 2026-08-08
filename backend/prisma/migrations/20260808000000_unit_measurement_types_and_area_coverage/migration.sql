-- Adds a measurement type to units of measure, and replaces the old
-- tile/flooring-specific coverage_per_box / conversion_factor pair on
-- products with a generic, unit-driven area-coverage rule.
--
-- Review before applying against a database with real data. No rows had
-- coverage_per_box/conversion_factor relied on elsewhere in the app (the
-- old Area-to-Box calculator was the only consumer, and it is being
-- replaced in this same change), so this migration drops them outright
-- rather than keeping them around unused. If you need to preserve old
-- coverage_per_box values for reference, export them before running this.

CREATE TYPE "MeasurementType" AS ENUM ('COUNT', 'AREA', 'LENGTH', 'WEIGHT', 'VOLUME', 'OTHER');

ALTER TABLE "units_of_measure"
  ADD COLUMN "measurement_type" "MeasurementType" NOT NULL DEFAULT 'COUNT';

ALTER TABLE "products"
  ADD COLUMN "coverage_quantity" DECIMAL(65,30),
  ADD COLUMN "coverage_uom_id" TEXT;

ALTER TABLE "products"
  ADD CONSTRAINT "products_coverage_uom_id_fkey"
  FOREIGN KEY ("coverage_uom_id") REFERENCES "units_of_measure"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "products_coverage_uom_id_idx" ON "products"("coverage_uom_id");

ALTER TABLE "products" DROP COLUMN "coverage_per_box";
ALTER TABLE "products" DROP COLUMN "conversion_factor";