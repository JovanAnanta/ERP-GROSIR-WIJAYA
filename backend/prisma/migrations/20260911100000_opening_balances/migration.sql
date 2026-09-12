-- Additive opening-balance support. Existing documents remain STANDARD.
CREATE TYPE "InvoiceDocumentType" AS ENUM ('STANDARD', 'OPENING_BALANCE');
CREATE TYPE "InventoryOpeningBalanceStatus" AS ENUM ('DRAFT', 'COMPLETED', 'CANCELLED');

ALTER TABLE "sales_invoice"
  ADD COLUMN "document_type" "InvoiceDocumentType" NOT NULL DEFAULT 'STANDARD';
ALTER TABLE "purchase_invoice"
  ADD COLUMN "document_type" "InvoiceDocumentType" NOT NULL DEFAULT 'STANDARD';

CREATE INDEX "sales_invoice_document_type_status_invoice_date_idx"
  ON "sales_invoice"("document_type", "status", "invoice_date");
CREATE INDEX "purchase_invoice_document_type_status_invoice_date_idx"
  ON "purchase_invoice"("document_type", "status", "invoice_date");

CREATE TABLE "inventory_opening_balance" (
  "inventory_opening_balance_id" BIGSERIAL PRIMARY KEY,
  "opening_balance_number" VARCHAR(30) NOT NULL UNIQUE,
  "opening_balance_date" DATE NOT NULL,
  "status" "InventoryOpeningBalanceStatus" NOT NULL DEFAULT 'DRAFT',
  "note" VARCHAR(500),
  "completed_at" TIMESTAMP(3),
  "completed_by" BIGINT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" BIGINT NOT NULL,
  "updated_at" TIMESTAMP(3),
  "updated_by" BIGINT,
  CONSTRAINT "inventory_opening_balance_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_opening_balance_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("user_id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "inventory_opening_balance_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "user"("user_id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "inventory_opening_balance_status_opening_balance_date_idx"
  ON "inventory_opening_balance"("status", "opening_balance_date");
CREATE INDEX "inventory_opening_balance_created_by_idx"
  ON "inventory_opening_balance"("created_by");

CREATE TABLE "inventory_opening_balance_detail" (
  "inventory_opening_balance_detail_id" BIGSERIAL PRIMARY KEY,
  "inventory_opening_balance_id" BIGINT NOT NULL,
  "line_number" INTEGER NOT NULL,
  "product_id" BIGINT NOT NULL,
  "selected_product_unit_id" BIGINT NOT NULL,
  "input_quantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "parent_product_unit_id" BIGINT NOT NULL,
  "parent_quantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "input_unit_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "parent_unit_cost" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "total_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "guest_suggested_price" DECIMAL(18,2),
  "inventory_movement_id" BIGINT UNIQUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_opening_balance_detail_balance_fkey" FOREIGN KEY ("inventory_opening_balance_id") REFERENCES "inventory_opening_balance"("inventory_opening_balance_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "inventory_opening_balance_detail_product_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_opening_balance_detail_selected_unit_fkey" FOREIGN KEY ("selected_product_unit_id") REFERENCES "product_unit"("product_unit_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_opening_balance_detail_parent_unit_fkey" FOREIGN KEY ("parent_product_unit_id") REFERENCES "product_unit"("product_unit_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_opening_balance_detail_movement_fkey" FOREIGN KEY ("inventory_movement_id") REFERENCES "inventory_movement"("inventory_movement_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_opening_balance_detail_balance_product_key" UNIQUE ("inventory_opening_balance_id", "product_id"),
  CONSTRAINT "inventory_opening_balance_detail_balance_line_key" UNIQUE ("inventory_opening_balance_id", "line_number")
);

CREATE INDEX "inventory_opening_balance_detail_product_id_idx"
  ON "inventory_opening_balance_detail"("product_id");
CREATE INDEX "inventory_opening_balance_detail_parent_product_unit_id_idx"
  ON "inventory_opening_balance_detail"("parent_product_unit_id");

INSERT INTO "permission" ("permission_code", "permission_name", "module", "action", "is_active", "created_at") VALUES
  ('SALES_OPENING_BALANCE_CREATE', 'Input Saldo Awal Piutang Customer', 'SALES', 'CREATE', true, CURRENT_TIMESTAMP),
  ('PURCHASE_OPENING_BALANCE_CREATE', 'Input Saldo Awal Hutang Supplier', 'PURCHASE', 'CREATE', true, CURRENT_TIMESTAMP),
  ('FIFO_OPENING_BALANCE_VIEW', 'Lihat Saldo Awal Persediaan', 'FIFO', 'VIEW', true, CURRENT_TIMESTAMP),
  ('FIFO_OPENING_BALANCE_CREATE', 'Simpan Draft Saldo Awal Persediaan', 'FIFO', 'CREATE', true, CURRENT_TIMESTAMP),
  ('FIFO_OPENING_BALANCE_POST', 'Tetapkan Saldo Awal Persediaan', 'FIFO', 'APPROVE', true, CURRENT_TIMESTAMP)
ON CONFLICT ("permission_code") DO UPDATE SET
  "permission_name" = EXCLUDED."permission_name",
  "module" = EXCLUDED."module",
  "action" = EXCLUDED."action",
  "is_active" = true;

UPDATE "permission"
SET "module" = 'INVENTORY_LOAN'
WHERE "permission_code" LIKE 'INVENTORY_LOAN_%';
