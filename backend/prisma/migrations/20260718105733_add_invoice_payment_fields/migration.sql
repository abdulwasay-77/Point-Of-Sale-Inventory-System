
-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "change_due" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "payment_method" "PaymentMethod" NOT NULL DEFAULT 'CASH';
