-- Additive Sales Order / Sales Invoice workflow alignment.
-- Existing rows are preserved and receive backward-compatible defaults.

ALTER TYPE "SalesInvoiceStatus" ADD VALUE IF NOT EXISTS 'READY';

DO $$ BEGIN
  CREATE TYPE "SalesPartyType" AS ENUM ('CUSTOMER', 'GUEST');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SalesPaymentType" AS ENUM ('CASH', 'CREDIT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SalesPaymentHoldingStatus" AS ENUM ('HELD', 'APPLIED', 'REFUNDED', 'TRANSFERRED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "sales_order"
  ALTER COLUMN "source_type" SET DEFAULT 'MANUAL',
  ALTER COLUMN "payment_status" SET DEFAULT 'UNPAID',
  ADD COLUMN IF NOT EXISTS "customer_name" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "item_discount_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "discount_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "order_total" DECIMAL(18,2) NOT NULL DEFAULT 0;

ALTER TABLE "sales_order_detail"
  ADD COLUMN IF NOT EXISTS "unit_price" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "discount_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "bonus_quantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0;

ALTER TABLE "sales_invoice"
  ADD COLUMN IF NOT EXISTS "party_type" "SalesPartyType" NOT NULL DEFAULT 'CUSTOMER',
  ADD COLUMN IF NOT EXISTS "sales_channel" VARCHAR(50) NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS "payment_type" "SalesPaymentType" NOT NULL DEFAULT 'CASH',
  ADD COLUMN IF NOT EXISTS "item_discount_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "updated_by" BIGINT,
  ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelled_by" BIGINT;

ALTER TABLE "sales_invoice" ALTER COLUMN "customer_name" TYPE VARCHAR(255);

ALTER TABLE "sales_invoice_detail"
  ADD COLUMN IF NOT EXISTS "bonus_quantity" DECIMAL(18,3) NOT NULL DEFAULT 0;

-- Payment methods are intentionally extensible (Cash, Transfer, QRIS, cards, etc.).
ALTER TABLE "sales_invoice_payment"
  ALTER COLUMN "payment_method" TYPE VARCHAR(50) USING "payment_method"::text,
  ADD COLUMN IF NOT EXISTS "financial_account_transaction_id" BIGINT;

ALTER TABLE "financial_account_transaction"
  ALTER COLUMN "payment_method" TYPE VARCHAR(50) USING "payment_method"::text;

CREATE TABLE IF NOT EXISTS "sales_payment_holding" (
  "sales_payment_holding_id" BIGSERIAL PRIMARY KEY,
  "sales_invoice_id" BIGINT NOT NULL,
  "sales_payment_id" BIGINT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "remaining_amount" DECIMAL(18,2) NOT NULL,
  "status" "SalesPaymentHoldingStatus" NOT NULL DEFAULT 'HELD',
  "resolved_at" TIMESTAMP(3),
  "resolved_by" BIGINT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sales_payment_holding_sales_invoice_id_fkey" FOREIGN KEY ("sales_invoice_id") REFERENCES "sales_invoice"("sales_invoice_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sales_payment_holding_sales_payment_id_fkey" FOREIGN KEY ("sales_payment_id") REFERENCES "sales_invoice_payment"("sales_payment_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sales_payment_holding_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "user"("user_id") ON DELETE SET NULL ON UPDATE CASCADE
);

ALTER TABLE "inventory_movement"
  ADD COLUMN IF NOT EXISTS "sales_invoice_detail_id" BIGINT;

DO $$ BEGIN
  ALTER TABLE "sales_invoice" ADD CONSTRAINT "sales_invoice_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "sales_invoice" ADD CONSTRAINT "sales_invoice_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "user"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "sales_invoice_payment" ADD CONSTRAINT "sales_invoice_payment_financial_account_transaction_id_fkey" FOREIGN KEY ("financial_account_transaction_id") REFERENCES "financial_account_transaction"("financial_account_transaction_id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_sales_invoice_detail_id_fkey" FOREIGN KEY ("sales_invoice_detail_id") REFERENCES "sales_invoice_detail"("sales_invoice_detail_id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "sales_invoice_payment_financial_account_transaction_id_key" ON "sales_invoice_payment"("financial_account_transaction_id");
CREATE UNIQUE INDEX IF NOT EXISTS "sales_payment_holding_sales_payment_id_key" ON "sales_payment_holding"("sales_payment_id");
CREATE INDEX IF NOT EXISTS "sales_payment_holding_sales_invoice_id_status_idx" ON "sales_payment_holding"("sales_invoice_id", "status");
CREATE INDEX IF NOT EXISTS "sales_payment_holding_resolved_by_idx" ON "sales_payment_holding"("resolved_by");
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_movement_sales_invoice_detail_id_key" ON "inventory_movement"("sales_invoice_detail_id");
CREATE INDEX IF NOT EXISTS "sales_invoice_status_invoice_date_idx" ON "sales_invoice"("status", "invoice_date");
CREATE INDEX IF NOT EXISTS "sales_invoice_updated_by_idx" ON "sales_invoice"("updated_by");
CREATE INDEX IF NOT EXISTS "sales_invoice_cancelled_by_idx" ON "sales_invoice"("cancelled_by");

INSERT INTO "permission" ("permission_code", "permission_name", "module", "action", "is_active")
VALUES ('SALES_RECEIVE_PAYMENT', 'Terima Pembayaran Sales', 'SALES', 'RECEIVE_PAYMENT', TRUE)
ON CONFLICT ("permission_code") DO UPDATE SET
  "permission_name" = EXCLUDED."permission_name",
  "module" = EXCLUDED."module",
  "action" = EXCLUDED."action",
  "is_active" = TRUE;

-- Owner and Super Owner are enforced by their role hierarchy. Existing Admin roles
-- receive the new capability only if SALES_UPDATE was already explicitly granted.
INSERT INTO "role_permission" ("role_id", "permission_id", "created_by")
SELECT existing."role_id", receive_permission."permission_id", existing."created_by"
FROM "role_permission" existing
JOIN "permission" update_permission ON update_permission."permission_id" = existing."permission_id"
JOIN "permission" receive_permission ON receive_permission."permission_code" = 'SALES_RECEIVE_PAYMENT'
WHERE update_permission."permission_code" = 'SALES_UPDATE'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
