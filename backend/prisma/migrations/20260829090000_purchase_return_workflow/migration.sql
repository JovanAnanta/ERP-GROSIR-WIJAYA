-- Bring SystemConfiguration into migration history without overwriting an existing table.
CREATE TABLE IF NOT EXISTS "system_configuration" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "company_name" VARCHAR(150) NOT NULL,
    "address" TEXT NOT NULL,
    "phone" VARCHAR(50) NOT NULL,
    "logo_base64" TEXT,
    "receipt_header_1" VARCHAR(255),
    "receipt_header_2" VARCHAR(255),
    "receipt_header_3" VARCHAR(255),
    "receipt_footer_1" TEXT,
    "receipt_footer_2" TEXT,
    "receipt_footer_3" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" BIGINT,
    CONSTRAINT "system_configuration_pkey" PRIMARY KEY ("id")
);

CREATE TYPE "PurchaseReturnStatus" AS ENUM ('DRAFT', 'READY', 'COMPLETED', 'CANCELLED');
CREATE TYPE "PurchaseReturnResolutionType" AS ENUM ('REPLACEMENT', 'CURRENT_INVOICE_DEDUCTION', 'NEXT_INVOICE_DEDUCTION', 'CASHBACK');

ALTER TABLE "purchase_return"
ADD COLUMN "applied_purchase_invoice_id" BIGINT,
ADD COLUMN "expected_resolution_date" DATE,
ADD COLUMN "financial_account_id" BIGINT,
ADD COLUMN "inventory_cost_total" DECIMAL(18,2) NOT NULL,
ADD COLUMN "reason" VARCHAR(255) NOT NULL,
ADD COLUMN "resolution_type" "PurchaseReturnResolutionType" NOT NULL,
ADD COLUMN "status" "PurchaseReturnStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN "updated_at" TIMESTAMP(3),
ADD COLUMN "updated_by" BIGINT;

ALTER TABLE "purchase_return_detail"
ADD COLUMN "base_quantity" DECIMAL(18,3) NOT NULL,
ADD COLUMN "fifo_layer_id" BIGINT NOT NULL,
ADD COLUMN "fifo_unit_cost" DECIMAL(18,6) NOT NULL,
ADD COLUMN "inventory_cost_subtotal" DECIMAL(18,2) NOT NULL;

CREATE INDEX "purchase_return_status_idx" ON "purchase_return"("status");
CREATE INDEX "purchase_return_resolution_type_idx" ON "purchase_return"("resolution_type");
CREATE INDEX "purchase_return_financial_account_id_idx" ON "purchase_return"("financial_account_id");
CREATE INDEX "purchase_return_applied_purchase_invoice_id_idx" ON "purchase_return"("applied_purchase_invoice_id");
CREATE INDEX "purchase_return_detail_fifo_layer_id_idx" ON "purchase_return_detail"("fifo_layer_id");

ALTER TABLE "purchase_return" ADD CONSTRAINT "purchase_return_applied_purchase_invoice_id_fkey" FOREIGN KEY ("applied_purchase_invoice_id") REFERENCES "purchase_invoice"("purchase_invoice_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_return" ADD CONSTRAINT "purchase_return_financial_account_id_fkey" FOREIGN KEY ("financial_account_id") REFERENCES "financial_account"("financial_account_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_return" ADD CONSTRAINT "purchase_return_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_return_detail" ADD CONSTRAINT "purchase_return_detail_fifo_layer_id_fkey" FOREIGN KEY ("fifo_layer_id") REFERENCES "fifo_layer"("fifo_layer_id") ON DELETE RESTRICT ON UPDATE CASCADE;
