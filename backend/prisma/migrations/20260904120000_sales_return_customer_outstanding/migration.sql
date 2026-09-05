DO $$ BEGIN
  CREATE TYPE "SalesReturnResolutionType" AS ENUM ('REFUND', 'REPLACEMENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "sales_invoice"
  ADD COLUMN IF NOT EXISTS "return_credit_applied_amount" DECIMAL(18,2) NOT NULL DEFAULT 0;

ALTER TABLE "sales_return"
  ADD COLUMN IF NOT EXISTS "replacement_sales_invoice_id" BIGINT,
  ADD COLUMN IF NOT EXISTS "resolution_type" "SalesReturnResolutionType" NOT NULL DEFAULT 'REFUND',
  ADD COLUMN IF NOT EXISTS "receivable_offset_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "replacement_credit_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "refund_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "financial_account_id" BIGINT,
  ADD COLUMN IF NOT EXISTS "financial_account_transaction_id" BIGINT,
  ADD COLUMN IF NOT EXISTS "refund_payment_method" VARCHAR(50);

ALTER TABLE "sales_return_detail"
  ADD COLUMN IF NOT EXISTS "bonus_quantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "return_cost_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "reason" VARCHAR(100);

ALTER TABLE "inventory_movement"
  ADD COLUMN IF NOT EXISTS "sales_return_detail_id" BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS "sales_return_replacement_sales_invoice_id_key" ON "sales_return"("replacement_sales_invoice_id");
CREATE UNIQUE INDEX IF NOT EXISTS "sales_return_financial_account_transaction_id_key" ON "sales_return"("financial_account_transaction_id");
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_movement_sales_return_detail_id_key" ON "inventory_movement"("sales_return_detail_id");
CREATE INDEX IF NOT EXISTS "sales_return_status_return_date_idx" ON "sales_return"("status", "return_date");
CREATE INDEX IF NOT EXISTS "sales_return_financial_account_id_idx" ON "sales_return"("financial_account_id");
CREATE INDEX IF NOT EXISTS "inventory_movement_sales_return_detail_id_idx" ON "inventory_movement"("sales_return_detail_id");
CREATE INDEX IF NOT EXISTS "sales_invoice_customer_outstanding_idx" ON "sales_invoice"("customer_id", "status", "outstanding_amount", "due_date");

DO $$ BEGIN
  ALTER TABLE "sales_return" ADD CONSTRAINT "sales_return_replacement_sales_invoice_id_fkey" FOREIGN KEY ("replacement_sales_invoice_id") REFERENCES "sales_invoice"("sales_invoice_id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "sales_return" ADD CONSTRAINT "sales_return_financial_account_id_fkey" FOREIGN KEY ("financial_account_id") REFERENCES "financial_account"("financial_account_id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "sales_return" ADD CONSTRAINT "sales_return_financial_account_transaction_id_fkey" FOREIGN KEY ("financial_account_transaction_id") REFERENCES "financial_account_transaction"("financial_account_transaction_id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_sales_return_detail_id_fkey" FOREIGN KEY ("sales_return_detail_id") REFERENCES "sales_return_detail"("sales_return_detail_id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
