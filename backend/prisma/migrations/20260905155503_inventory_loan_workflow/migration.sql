-- CreateEnum
CREATE TYPE "InventoryLoanDirection" AS ENUM ('OUTGOING', 'INCOMING');

-- CreateEnum
CREATE TYPE "InventoryLoanStatus" AS ENUM ('DRAFT', 'OUTSTANDING', 'CLOSED', 'WRITTEN_OFF', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InventoryLoanResolutionStatus" AS ENUM ('DRAFT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InventoryLoanResolutionType" AS ENUM ('SAME_PRODUCT_RETURN', 'REPLACEMENT_PRODUCT', 'INVOICE_CONVERSION', 'WRITE_OFF');

-- CreateEnum
CREATE TYPE "InventoryLoanAllocationRole" AS ENUM ('LOAN_OBLIGATION', 'REPLACEMENT_IN', 'REPLACEMENT_OUT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FifoLayerOriginType" ADD VALUE 'INVENTORY_LOAN';
ALTER TYPE "FifoLayerOriginType" ADD VALUE 'INVENTORY_LOAN_RECOVERY';

-- CreateTable
CREATE TABLE "inventory_loan" (
    "inventory_loan_id" BIGSERIAL NOT NULL,
    "loan_number" VARCHAR(30) NOT NULL,
    "direction" "InventoryLoanDirection" NOT NULL,
    "customer_id" BIGINT,
    "supplier_id" BIGINT,
    "loan_date" DATE NOT NULL,
    "due_date" DATE,
    "status" "InventoryLoanStatus" NOT NULL DEFAULT 'DRAFT',
    "note" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT NOT NULL,
    "updated_at" TIMESTAMP(3),
    "updated_by" BIGINT,
    "activated_at" TIMESTAMP(3),
    "activated_by" BIGINT,
    "closed_at" TIMESTAMP(3),
    "closed_by" BIGINT,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by" BIGINT,

    CONSTRAINT "inventory_loan_pkey" PRIMARY KEY ("inventory_loan_id")
);

-- CreateTable
CREATE TABLE "inventory_loan_detail" (
    "inventory_loan_detail_id" BIGSERIAL NOT NULL,
    "inventory_loan_id" BIGINT NOT NULL,
    "product_unit_id" BIGINT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "provisional_unit_cost" DECIMAL(18,2) NOT NULL,
    "provisional_total_cost" DECIMAL(18,2) NOT NULL,
    "returned_quantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "converted_quantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "written_off_quantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "recovered_quantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "note" VARCHAR(255),

    CONSTRAINT "inventory_loan_detail_pkey" PRIMARY KEY ("inventory_loan_detail_id")
);

-- CreateTable
CREATE TABLE "inventory_loan_fifo_allocation" (
    "inventory_loan_fifo_allocation_id" BIGSERIAL NOT NULL,
    "inventory_loan_detail_id" BIGINT NOT NULL,
    "fifo_layer_id" BIGINT NOT NULL,
    "allocated_quantity" DECIMAL(18,3) NOT NULL,
    "unit_cost" DECIMAL(18,2) NOT NULL,
    "total_cost" DECIMAL(18,2) NOT NULL,
    "remaining_allocation_quantity" DECIMAL(18,3) NOT NULL,

    CONSTRAINT "inventory_loan_fifo_allocation_pkey" PRIMARY KEY ("inventory_loan_fifo_allocation_id")
);

-- CreateTable
CREATE TABLE "inventory_loan_resolution" (
    "inventory_loan_resolution_id" BIGSERIAL NOT NULL,
    "resolution_number" VARCHAR(30) NOT NULL,
    "inventory_loan_id" BIGINT NOT NULL,
    "resolution_date" DATE NOT NULL,
    "status" "InventoryLoanResolutionStatus" NOT NULL DEFAULT 'DRAFT',
    "sales_invoice_id" BIGINT,
    "purchase_invoice_id" BIGINT,
    "note" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT NOT NULL,
    "completed_at" TIMESTAMP(3),
    "completed_by" BIGINT,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by" BIGINT,

    CONSTRAINT "inventory_loan_resolution_pkey" PRIMARY KEY ("inventory_loan_resolution_id")
);

-- CreateTable
CREATE TABLE "inventory_loan_resolution_detail" (
    "inventory_loan_resolution_detail_id" BIGSERIAL NOT NULL,
    "inventory_loan_resolution_id" BIGINT NOT NULL,
    "inventory_loan_detail_id" BIGINT NOT NULL,
    "recovered_write_off_detail_id" BIGINT,
    "resolution_type" "InventoryLoanResolutionType" NOT NULL,
    "source_quantity" DECIMAL(18,3) NOT NULL,
    "obligation_unit_cost" DECIMAL(18,2) NOT NULL,
    "obligation_total_cost" DECIMAL(18,2) NOT NULL,
    "replacement_product_unit_id" BIGINT,
    "replacement_quantity" DECIMAL(18,3),
    "replacement_unit_cost" DECIMAL(18,2),
    "replacement_total_cost" DECIMAL(18,2),
    "actual_fifo_cost" DECIMAL(18,2),
    "valuation_variance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "inventory_movement_id" BIGINT,
    "note" VARCHAR(255),

    CONSTRAINT "inventory_loan_resolution_detail_pkey" PRIMARY KEY ("inventory_loan_resolution_detail_id")
);

-- CreateTable
CREATE TABLE "inventory_loan_resolution_allocation" (
    "inventory_loan_resolution_allocation_id" BIGSERIAL NOT NULL,
    "inventory_loan_resolution_detail_id" BIGINT NOT NULL,
    "inventory_loan_fifo_allocation_id" BIGINT,
    "fifo_layer_id" BIGINT NOT NULL,
    "role" "InventoryLoanAllocationRole" NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unit_cost" DECIMAL(18,2) NOT NULL,
    "total_cost" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "inventory_loan_resolution_allocation_pkey" PRIMARY KEY ("inventory_loan_resolution_allocation_id")
);

-- Domain invariants are also checked by the service, but database constraints
-- prevent invalid states from scripts or future integrations.
ALTER TABLE "inventory_loan" ADD CONSTRAINT "inventory_loan_partner_check"
CHECK (("direction" = 'OUTGOING' AND "customer_id" IS NOT NULL AND "supplier_id" IS NULL)
    OR ("direction" = 'INCOMING' AND "supplier_id" IS NOT NULL AND "customer_id" IS NULL));
ALTER TABLE "inventory_loan_detail" ADD CONSTRAINT "inventory_loan_detail_qty_check"
CHECK ("quantity" > 0 AND "provisional_unit_cost" >= 0 AND "provisional_total_cost" >= 0
  AND "returned_quantity" >= 0 AND "converted_quantity" >= 0
  AND "written_off_quantity" >= 0 AND "recovered_quantity" >= 0
  AND "returned_quantity" + "converted_quantity" + "written_off_quantity" <= "quantity"
  AND "recovered_quantity" <= "written_off_quantity");
ALTER TABLE "inventory_loan_resolution_detail" ADD CONSTRAINT "inventory_loan_resolution_detail_qty_check"
CHECK ("source_quantity" > 0 AND "obligation_unit_cost" >= 0 AND "obligation_total_cost" >= 0
  AND ("replacement_quantity" IS NULL OR "replacement_quantity" > 0));

-- CreateIndex
CREATE UNIQUE INDEX "inventory_loan_loan_number_key" ON "inventory_loan"("loan_number");

-- CreateIndex
CREATE INDEX "inventory_loan_direction_status_loan_date_idx" ON "inventory_loan"("direction", "status", "loan_date");

-- CreateIndex
CREATE INDEX "inventory_loan_customer_id_status_idx" ON "inventory_loan"("customer_id", "status");

-- CreateIndex
CREATE INDEX "inventory_loan_supplier_id_status_idx" ON "inventory_loan"("supplier_id", "status");

-- CreateIndex
CREATE INDEX "inventory_loan_due_date_status_idx" ON "inventory_loan"("due_date", "status");

-- CreateIndex
CREATE INDEX "inventory_loan_created_by_idx" ON "inventory_loan"("created_by");

-- CreateIndex
CREATE INDEX "inventory_loan_detail_product_unit_id_idx" ON "inventory_loan_detail"("product_unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_loan_detail_inventory_loan_id_product_unit_id_key" ON "inventory_loan_detail"("inventory_loan_id", "product_unit_id");

-- CreateIndex
CREATE INDEX "inventory_loan_fifo_allocation_fifo_layer_id_idx" ON "inventory_loan_fifo_allocation"("fifo_layer_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_loan_fifo_allocation_inventory_loan_detail_id_fif_key" ON "inventory_loan_fifo_allocation"("inventory_loan_detail_id", "fifo_layer_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_loan_resolution_resolution_number_key" ON "inventory_loan_resolution"("resolution_number");

-- CreateIndex
CREATE INDEX "inventory_loan_resolution_inventory_loan_id_status_resoluti_idx" ON "inventory_loan_resolution"("inventory_loan_id", "status", "resolution_date");

-- CreateIndex
CREATE INDEX "inventory_loan_resolution_sales_invoice_id_idx" ON "inventory_loan_resolution"("sales_invoice_id");

-- CreateIndex
CREATE INDEX "inventory_loan_resolution_purchase_invoice_id_idx" ON "inventory_loan_resolution"("purchase_invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_loan_resolution_detail_inventory_movement_id_key" ON "inventory_loan_resolution_detail"("inventory_movement_id");

-- CreateIndex
CREATE INDEX "inventory_loan_resolution_detail_inventory_loan_resolution__idx" ON "inventory_loan_resolution_detail"("inventory_loan_resolution_id");

-- CreateIndex
CREATE INDEX "inventory_loan_resolution_detail_inventory_loan_detail_id_r_idx" ON "inventory_loan_resolution_detail"("inventory_loan_detail_id", "resolution_type");

-- CreateIndex
CREATE INDEX "inventory_loan_resolution_detail_recovered_write_off_detail_idx" ON "inventory_loan_resolution_detail"("recovered_write_off_detail_id");

-- CreateIndex
CREATE INDEX "inventory_loan_resolution_detail_replacement_product_unit_i_idx" ON "inventory_loan_resolution_detail"("replacement_product_unit_id");

-- CreateIndex
CREATE INDEX "inventory_loan_resolution_allocation_inventory_loan_resolut_idx" ON "inventory_loan_resolution_allocation"("inventory_loan_resolution_detail_id");

-- CreateIndex
CREATE INDEX "inventory_loan_resolution_allocation_inventory_loan_fifo_al_idx" ON "inventory_loan_resolution_allocation"("inventory_loan_fifo_allocation_id");

-- CreateIndex
CREATE INDEX "inventory_loan_resolution_allocation_fifo_layer_id_idx" ON "inventory_loan_resolution_allocation"("fifo_layer_id");

-- CreateIndex
CREATE INDEX "inventory_movement_sales_invoice_detail_id_idx" ON "inventory_movement"("sales_invoice_detail_id");

-- AddForeignKey
ALTER TABLE "inventory_loan" ADD CONSTRAINT "inventory_loan_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_loan" ADD CONSTRAINT "inventory_loan_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("supplier_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_loan" ADD CONSTRAINT "inventory_loan_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_loan" ADD CONSTRAINT "inventory_loan_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_loan" ADD CONSTRAINT "inventory_loan_activated_by_fkey" FOREIGN KEY ("activated_by") REFERENCES "user"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_loan" ADD CONSTRAINT "inventory_loan_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "user"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_loan" ADD CONSTRAINT "inventory_loan_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "user"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_loan_detail" ADD CONSTRAINT "inventory_loan_detail_inventory_loan_id_fkey" FOREIGN KEY ("inventory_loan_id") REFERENCES "inventory_loan"("inventory_loan_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_loan_detail" ADD CONSTRAINT "inventory_loan_detail_product_unit_id_fkey" FOREIGN KEY ("product_unit_id") REFERENCES "product_unit"("product_unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_loan_fifo_allocation" ADD CONSTRAINT "inventory_loan_fifo_allocation_inventory_loan_detail_id_fkey" FOREIGN KEY ("inventory_loan_detail_id") REFERENCES "inventory_loan_detail"("inventory_loan_detail_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_loan_fifo_allocation" ADD CONSTRAINT "inventory_loan_fifo_allocation_fifo_layer_id_fkey" FOREIGN KEY ("fifo_layer_id") REFERENCES "fifo_layer"("fifo_layer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_loan_resolution" ADD CONSTRAINT "inventory_loan_resolution_inventory_loan_id_fkey" FOREIGN KEY ("inventory_loan_id") REFERENCES "inventory_loan"("inventory_loan_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_loan_resolution" ADD CONSTRAINT "inventory_loan_resolution_sales_invoice_id_fkey" FOREIGN KEY ("sales_invoice_id") REFERENCES "sales_invoice"("sales_invoice_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_loan_resolution" ADD CONSTRAINT "inventory_loan_resolution_purchase_invoice_id_fkey" FOREIGN KEY ("purchase_invoice_id") REFERENCES "purchase_invoice"("purchase_invoice_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_loan_resolution" ADD CONSTRAINT "inventory_loan_resolution_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_loan_resolution" ADD CONSTRAINT "inventory_loan_resolution_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "user"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_loan_resolution" ADD CONSTRAINT "inventory_loan_resolution_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "user"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_loan_resolution_detail" ADD CONSTRAINT "inventory_loan_resolution_detail_inventory_loan_resolution_fkey" FOREIGN KEY ("inventory_loan_resolution_id") REFERENCES "inventory_loan_resolution"("inventory_loan_resolution_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_loan_resolution_detail" ADD CONSTRAINT "inventory_loan_resolution_detail_inventory_loan_detail_id_fkey" FOREIGN KEY ("inventory_loan_detail_id") REFERENCES "inventory_loan_detail"("inventory_loan_detail_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_loan_resolution_detail" ADD CONSTRAINT "inventory_loan_resolution_detail_recovered_write_off_detai_fkey" FOREIGN KEY ("recovered_write_off_detail_id") REFERENCES "inventory_loan_resolution_detail"("inventory_loan_resolution_detail_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_loan_resolution_detail" ADD CONSTRAINT "inventory_loan_resolution_detail_replacement_product_unit__fkey" FOREIGN KEY ("replacement_product_unit_id") REFERENCES "product_unit"("product_unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_loan_resolution_detail" ADD CONSTRAINT "inventory_loan_resolution_detail_inventory_movement_id_fkey" FOREIGN KEY ("inventory_movement_id") REFERENCES "inventory_movement"("inventory_movement_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_loan_resolution_allocation" ADD CONSTRAINT "inventory_loan_resolution_allocation_inventory_loan_resolu_fkey" FOREIGN KEY ("inventory_loan_resolution_detail_id") REFERENCES "inventory_loan_resolution_detail"("inventory_loan_resolution_detail_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_loan_resolution_allocation" ADD CONSTRAINT "inventory_loan_resolution_allocation_inventory_loan_fifo_a_fkey" FOREIGN KEY ("inventory_loan_fifo_allocation_id") REFERENCES "inventory_loan_fifo_allocation"("inventory_loan_fifo_allocation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_loan_resolution_allocation" ADD CONSTRAINT "inventory_loan_resolution_allocation_fifo_layer_id_fkey" FOREIGN KEY ("fifo_layer_id") REFERENCES "fifo_layer"("fifo_layer_id") ON DELETE RESTRICT ON UPDATE CASCADE;
