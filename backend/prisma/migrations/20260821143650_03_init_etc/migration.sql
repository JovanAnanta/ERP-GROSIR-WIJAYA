-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'READY', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseInvoicePaymentStatus" AS ENUM ('PAID', 'PARTIAL', 'UNPAID');

-- CreateEnum
CREATE TYPE "PurchaseInvoiceStatus" AS ENUM ('DRAFT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchasePaymentMethod" AS ENUM ('CASH', 'TRANSFER');

-- CreateEnum
CREATE TYPE "FifoLayerOriginType" AS ENUM ('PURCHASE', 'OPENING_BALANCE', 'TRANSFORMATION', 'INVENTORY_FOUND');

-- CreateEnum
CREATE TYPE "TransactionDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "SalesOrderStatus" AS ENUM ('DRAFT', 'READY', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SalesPaymentStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID');

-- CreateEnum
CREATE TYPE "SalesInvoiceStatus" AS ENUM ('DRAFT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SalesReturnStatus" AS ENUM ('DRAFT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SalesPaymentMethod" AS ENUM ('CASH', 'TRANSFER');

-- CreateTable
CREATE TABLE "purchase_order" (
    "purchase_order_id" BIGSERIAL NOT NULL,
    "purchase_order_number" VARCHAR(30) NOT NULL,
    "supplier_id" BIGINT NOT NULL,
    "order_date" DATE NOT NULL,
    "expected_date" DATE,
    "status" "PurchaseOrderStatus" NOT NULL,
    "note" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT NOT NULL,
    "updated_at" TIMESTAMP(3),
    "updated_by" BIGINT,

    CONSTRAINT "purchase_order_pkey" PRIMARY KEY ("purchase_order_id")
);

-- CreateTable
CREATE TABLE "purchase_order_detail" (
    "purchase_order_detail_id" BIGSERIAL NOT NULL,
    "purchase_order_id" BIGINT NOT NULL,
    "product_unit_id" BIGINT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "note" VARCHAR(255),

    CONSTRAINT "purchase_order_detail_pkey" PRIMARY KEY ("purchase_order_detail_id")
);

-- CreateTable
CREATE TABLE "purchase_invoice" (
    "purchase_invoice_id" BIGSERIAL NOT NULL,
    "purchase_invoice_number" VARCHAR(30) NOT NULL,
    "purchase_order_id" BIGINT,
    "supplier_id" BIGINT NOT NULL,
    "invoice_date" DATE NOT NULL,
    "due_date" DATE,
    "invoice_total" DECIMAL(18,2) NOT NULL,
    "discount_amount" DECIMAL(18,2) NOT NULL,
    "status_payment" "PurchaseInvoicePaymentStatus" NOT NULL,
    "paid_amount" DECIMAL(18,2) NOT NULL,
    "outstanding_amount" DECIMAL(18,2) NOT NULL,
    "status" "PurchaseInvoiceStatus" NOT NULL,
    "note" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT NOT NULL,
    "updated_at" TIMESTAMP(3),
    "updated_by" BIGINT,

    CONSTRAINT "purchase_invoice_pkey" PRIMARY KEY ("purchase_invoice_id")
);

-- CreateTable
CREATE TABLE "purchase_invoice_detail" (
    "purchase_invoice_detail_id" BIGSERIAL NOT NULL,
    "purchase_invoice_id" BIGINT NOT NULL,
    "product_unit_id" BIGINT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unit_cost" DECIMAL(18,2) NOT NULL,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "note" VARCHAR(255),

    CONSTRAINT "purchase_invoice_detail_pkey" PRIMARY KEY ("purchase_invoice_detail_id")
);

-- CreateTable
CREATE TABLE "purchase_return" (
    "purchase_return_id" BIGSERIAL NOT NULL,
    "purchase_return_number" VARCHAR(30) NOT NULL,
    "purchase_invoice_id" BIGINT NOT NULL,
    "supplier_id" BIGINT NOT NULL,
    "return_date" DATE NOT NULL,
    "return_total" DECIMAL(18,2) NOT NULL,
    "note" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT NOT NULL,

    CONSTRAINT "purchase_return_pkey" PRIMARY KEY ("purchase_return_id")
);

-- CreateTable
CREATE TABLE "purchase_return_detail" (
    "purchase_return_detail_id" BIGSERIAL NOT NULL,
    "purchase_return_id" BIGINT NOT NULL,
    "purchase_invoice_detail_id" BIGINT NOT NULL,
    "product_unit_id" BIGINT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unit_cost" DECIMAL(18,2) NOT NULL,
    "subtotal" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "purchase_return_detail_pkey" PRIMARY KEY ("purchase_return_detail_id")
);

-- CreateTable
CREATE TABLE "purchase_invoice_payment" (
    "purchase_payment_id" BIGSERIAL NOT NULL,
    "purchase_invoice_id" BIGINT NOT NULL,
    "payment_date" TIMESTAMP(3) NOT NULL,
    "payment_amount" DECIMAL(18,2) NOT NULL,
    "payment_method" "PurchasePaymentMethod" NOT NULL,
    "financial_account_id" BIGINT NOT NULL,
    "reference_number" VARCHAR(100),
    "note" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT NOT NULL,

    CONSTRAINT "purchase_invoice_payment_pkey" PRIMARY KEY ("purchase_payment_id")
);

-- CreateTable
CREATE TABLE "customer_financial_summary" (
    "customer_financial_id" BIGSERIAL NOT NULL,
    "customer_id" BIGINT NOT NULL,
    "outstanding_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "credit_limit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "current_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "overdue_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "last_payment_date" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_financial_summary_pkey" PRIMARY KEY ("customer_financial_id")
);

-- CreateTable
CREATE TABLE "supplier_financial_summary" (
    "supplier_financial_id" BIGSERIAL NOT NULL,
    "supplier_id" BIGINT NOT NULL,
    "outstanding_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "current_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "overdue_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "last_payment_date" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_financial_summary_pkey" PRIMARY KEY ("supplier_financial_id")
);

-- CreateTable
CREATE TABLE "customer_account_transaction" (
    "customer_account_transaction_id" BIGSERIAL NOT NULL,
    "transaction_number" VARCHAR(30) NOT NULL,
    "customer_id" BIGINT NOT NULL,
    "transaction_type" VARCHAR(50) NOT NULL,
    "direction" VARCHAR(10) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reference_type" VARCHAR(50) NOT NULL,
    "reference_id" BIGINT NOT NULL,
    "transaction_date" TIMESTAMP(3) NOT NULL,
    "due_date" TIMESTAMP(3),
    "note" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT NOT NULL,

    CONSTRAINT "customer_account_transaction_pkey" PRIMARY KEY ("customer_account_transaction_id")
);

-- CreateTable
CREATE TABLE "supplier_account_transaction" (
    "supplier_account_transaction_id" BIGSERIAL NOT NULL,
    "transaction_number" VARCHAR(30) NOT NULL,
    "supplier_id" BIGINT NOT NULL,
    "transaction_type" VARCHAR(50) NOT NULL,
    "direction" VARCHAR(10) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reference_type" VARCHAR(50) NOT NULL,
    "reference_id" BIGINT NOT NULL,
    "transaction_date" TIMESTAMP(3) NOT NULL,
    "due_date" TIMESTAMP(3),
    "note" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT NOT NULL,

    CONSTRAINT "supplier_account_transaction_pkey" PRIMARY KEY ("supplier_account_transaction_id")
);

-- CreateTable
CREATE TABLE "financial_account" (
    "financial_account_id" BIGSERIAL NOT NULL,
    "account_name" VARCHAR(100) NOT NULL,
    "account_type" VARCHAR(20) NOT NULL,
    "account_number" VARCHAR(100),
    "bank_name" VARCHAR(100),
    "opening_balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "current_balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT NOT NULL,
    "updated_at" TIMESTAMP(3),
    "updated_by" BIGINT,

    CONSTRAINT "financial_account_pkey" PRIMARY KEY ("financial_account_id")
);

-- CreateTable
CREATE TABLE "financial_account_transaction" (
    "financial_account_transaction_id" BIGSERIAL NOT NULL,
    "transaction_number" VARCHAR(30) NOT NULL,
    "financial_account_id" BIGINT NOT NULL,
    "transaction_type" VARCHAR(50) NOT NULL,
    "direction" VARCHAR(10) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reference_type" VARCHAR(50) NOT NULL,
    "reference_id" BIGINT NOT NULL,
    "transaction_date" TIMESTAMP(3) NOT NULL,
    "note" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT NOT NULL,

    CONSTRAINT "financial_account_transaction_pkey" PRIMARY KEY ("financial_account_transaction_id")
);

-- CreateTable
CREATE TABLE "fifo_layer" (
    "fifo_layer_id" BIGSERIAL NOT NULL,
    "fifo_layer_number" VARCHAR(30) NOT NULL,
    "product_unit_id" BIGINT NOT NULL,
    "origin_type" "FifoLayerOriginType" NOT NULL,
    "origin_inventory_movement_id" BIGINT NOT NULL,
    "origin_id" BIGINT NOT NULL,
    "original_qty" DECIMAL(18,3) NOT NULL,
    "remaining_qty" DECIMAL(18,3) NOT NULL,
    "unit_cost" DECIMAL(18,2) NOT NULL,
    "original_cost" DECIMAL(18,2) NOT NULL,
    "remaining_cost" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT NOT NULL,

    CONSTRAINT "fifo_layer_pkey" PRIMARY KEY ("fifo_layer_id")
);

-- CreateTable
CREATE TABLE "fifo_layer_transaction" (
    "fifo_layer_transaction_id" BIGSERIAL NOT NULL,
    "fifo_layer_id" BIGINT NOT NULL,
    "inventory_movement_id" BIGINT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "direction" "TransactionDirection" NOT NULL,
    "unit_cost" DECIMAL(18,2) NOT NULL,
    "total_cost" DECIMAL(18,2) NOT NULL,
    "quantity_before" DECIMAL(18,3) NOT NULL,
    "quantity_after" DECIMAL(18,3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT NOT NULL,

    CONSTRAINT "fifo_layer_transaction_pkey" PRIMARY KEY ("fifo_layer_transaction_id")
);

-- CreateTable
CREATE TABLE "inventory_transformation" (
    "transformation_id" BIGSERIAL NOT NULL,
    "transformation_number" VARCHAR(30) NOT NULL,
    "transformation_date" TIMESTAMP(3) NOT NULL,
    "note" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT NOT NULL,

    CONSTRAINT "inventory_transformation_pkey" PRIMARY KEY ("transformation_id")
);

-- CreateTable
CREATE TABLE "inventory_movement" (
    "inventory_movement_id" BIGSERIAL NOT NULL,
    "movement_number" VARCHAR(30) NOT NULL,
    "product_unit_id" BIGINT NOT NULL,
    "direction" "TransactionDirection" NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "movement_type" VARCHAR(50) NOT NULL,
    "origin_type" VARCHAR(50) NOT NULL,
    "origin_id" BIGINT NOT NULL,
    "transformation_id" BIGINT,
    "movement_date" TIMESTAMP(3) NOT NULL,
    "note" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT NOT NULL,

    CONSTRAINT "inventory_movement_pkey" PRIMARY KEY ("inventory_movement_id")
);

-- CreateTable
CREATE TABLE "inventory_adjustment" (
    "adjustment_id" BIGSERIAL NOT NULL,
    "adjustment_number" VARCHAR(30) NOT NULL,
    "adjustment_date" TIMESTAMP(3) NOT NULL,
    "reason" VARCHAR(255) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "note" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT NOT NULL,
    "approved_at" TIMESTAMP(3),
    "approved_by" BIGINT,

    CONSTRAINT "inventory_adjustment_pkey" PRIMARY KEY ("adjustment_id")
);

-- CreateTable
CREATE TABLE "inventory_adjustment_detail" (
    "adjustment_detail_id" BIGSERIAL NOT NULL,
    "adjustment_id" BIGINT NOT NULL,
    "product_unit_id" BIGINT NOT NULL,
    "direction" VARCHAR(10) NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "note" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT NOT NULL,

    CONSTRAINT "inventory_adjustment_detail_pkey" PRIMARY KEY ("adjustment_detail_id")
);

-- CreateTable
CREATE TABLE "stock_opname" (
    "stock_opname_id" BIGSERIAL NOT NULL,
    "stock_opname_number" VARCHAR(30) NOT NULL,
    "opname_date" TIMESTAMP(3) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "note" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT NOT NULL,
    "approved_at" TIMESTAMP(3),
    "approved_by" BIGINT,

    CONSTRAINT "stock_opname_pkey" PRIMARY KEY ("stock_opname_id")
);

-- CreateTable
CREATE TABLE "stock_opname_detail" (
    "stock_opname_detail_id" BIGSERIAL NOT NULL,
    "stock_opname_id" BIGINT NOT NULL,
    "product_unit_id" BIGINT NOT NULL,
    "system_qty" DECIMAL(18,3) NOT NULL,
    "counted_qty" DECIMAL(18,3) NOT NULL,
    "variance_qty" DECIMAL(18,3) NOT NULL,
    "note" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT NOT NULL,

    CONSTRAINT "stock_opname_detail_pkey" PRIMARY KEY ("stock_opname_detail_id")
);

-- CreateTable
CREATE TABLE "inventory_stock" (
    "inventory_stock_id" BIGSERIAL NOT NULL,
    "product_id" BIGINT NOT NULL,
    "product_unit_id" BIGINT NOT NULL,
    "actual_qty" DECIMAL(18,3) NOT NULL,
    "available_qty" DECIMAL(18,3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_stock_pkey" PRIMARY KEY ("inventory_stock_id")
);

-- CreateTable
CREATE TABLE "sales_order" (
    "sales_order_id" BIGSERIAL NOT NULL,
    "sales_order_number" VARCHAR(30) NOT NULL,
    "customer_id" BIGINT,
    "order_date" TIMESTAMP(3) NOT NULL,
    "status" "SalesOrderStatus" NOT NULL,
    "sales_channel" VARCHAR(50) NOT NULL,
    "source_type" VARCHAR(50) NOT NULL,
    "payment_status" "SalesPaymentStatus" NOT NULL,
    "payment_due_date" DATE,
    "note" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT NOT NULL,
    "updated_at" TIMESTAMP(3),
    "updated_by" BIGINT,

    CONSTRAINT "sales_order_pkey" PRIMARY KEY ("sales_order_id")
);

-- CreateTable
CREATE TABLE "sales_order_detail" (
    "sales_order_detail_id" BIGSERIAL NOT NULL,
    "sales_order_id" BIGINT NOT NULL,
    "product_unit_id" BIGINT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "note" VARCHAR(255),

    CONSTRAINT "sales_order_detail_pkey" PRIMARY KEY ("sales_order_detail_id")
);

-- CreateTable
CREATE TABLE "sales_invoice" (
    "sales_invoice_id" BIGSERIAL NOT NULL,
    "sales_invoice_number" VARCHAR(30) NOT NULL,
    "sales_order_id" BIGINT,
    "customer_id" BIGINT,
    "customer_name" VARCHAR(50),
    "invoice_date" TIMESTAMP(3) NOT NULL,
    "due_date" DATE,
    "invoice_total" DECIMAL(18,2) NOT NULL,
    "discount_amount" DECIMAL(18,2) NOT NULL,
    "status_payment" "SalesPaymentStatus" NOT NULL,
    "paid_amount" DECIMAL(18,2) NOT NULL,
    "outstanding_amount" DECIMAL(18,2) NOT NULL,
    "status" "SalesInvoiceStatus" NOT NULL,
    "note" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT NOT NULL,
    "approved_at" TIMESTAMP(3),
    "approved_by" BIGINT,

    CONSTRAINT "sales_invoice_pkey" PRIMARY KEY ("sales_invoice_id")
);

-- CreateTable
CREATE TABLE "sales_invoice_detail" (
    "sales_invoice_detail_id" BIGSERIAL NOT NULL,
    "sales_invoice_id" BIGINT NOT NULL,
    "sales_order_detail_id" BIGINT,
    "product_unit_id" BIGINT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unit_price" DECIMAL(18,2) NOT NULL,
    "discount_amount" DECIMAL(18,2) NOT NULL,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "note" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT NOT NULL,

    CONSTRAINT "sales_invoice_detail_pkey" PRIMARY KEY ("sales_invoice_detail_id")
);

-- CreateTable
CREATE TABLE "sales_invoice_payment" (
    "sales_payment_id" BIGSERIAL NOT NULL,
    "payment_number" VARCHAR(30) NOT NULL,
    "sales_invoice_id" BIGINT NOT NULL,
    "payment_date" TIMESTAMP(3) NOT NULL,
    "payment_method" "SalesPaymentMethod" NOT NULL,
    "financial_account_id" BIGINT NOT NULL,
    "payment_amount" DECIMAL(18,2) NOT NULL,
    "reference_number" VARCHAR(100),
    "note" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT NOT NULL,

    CONSTRAINT "sales_invoice_payment_pkey" PRIMARY KEY ("sales_payment_id")
);

-- CreateTable
CREATE TABLE "sales_return" (
    "sales_return_id" BIGSERIAL NOT NULL,
    "sales_return_number" VARCHAR(30) NOT NULL,
    "sales_invoice_id" BIGINT NOT NULL,
    "customer_id" BIGINT,
    "return_date" TIMESTAMP(3) NOT NULL,
    "return_total" DECIMAL(18,2) NOT NULL,
    "status" "SalesReturnStatus" NOT NULL,
    "note" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT NOT NULL,
    "approved_at" TIMESTAMP(3),
    "approved_by" BIGINT,

    CONSTRAINT "sales_return_pkey" PRIMARY KEY ("sales_return_id")
);

-- CreateTable
CREATE TABLE "sales_return_detail" (
    "sales_return_detail_id" BIGSERIAL NOT NULL,
    "sales_return_id" BIGINT NOT NULL,
    "sales_invoice_detail_id" BIGINT NOT NULL,
    "product_unit_id" BIGINT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unit_price" DECIMAL(18,2) NOT NULL,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "note" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT NOT NULL,

    CONSTRAINT "sales_return_detail_pkey" PRIMARY KEY ("sales_return_detail_id")
);

-- CreateTable
CREATE TABLE "guest_suggested_price" (
    "guest_price_id" BIGSERIAL NOT NULL,
    "product_unit_id" BIGINT NOT NULL,
    "suggested_price" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT NOT NULL,
    "updated_at" TIMESTAMP(3),
    "updated_by" BIGINT,

    CONSTRAINT "guest_suggested_price_pkey" PRIMARY KEY ("guest_price_id")
);

-- CreateTable
CREATE TABLE "customer_suggested_price" (
    "customer_price_id" BIGSERIAL NOT NULL,
    "customer_id" BIGINT NOT NULL,
    "product_unit_id" BIGINT NOT NULL,
    "suggested_price" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT NOT NULL,
    "updated_at" TIMESTAMP(3),
    "updated_by" BIGINT,

    CONSTRAINT "customer_suggested_price_pkey" PRIMARY KEY ("customer_price_id")
);

-- CreateTable
CREATE TABLE "supplier_suggested_cost" (
    "supplier_cost_id" BIGSERIAL NOT NULL,
    "supplier_id" BIGINT NOT NULL,
    "product_unit_id" BIGINT NOT NULL,
    "suggested_cost" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT NOT NULL,
    "updated_at" TIMESTAMP(3),
    "updated_by" BIGINT,

    CONSTRAINT "supplier_suggested_cost_pkey" PRIMARY KEY ("supplier_cost_id")
);

-- CreateTable
CREATE TABLE "product_alias" (
    "product_alias_id" BIGSERIAL NOT NULL,
    "product_id" BIGINT NOT NULL,
    "alias_name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT NOT NULL,

    CONSTRAINT "product_alias_pkey" PRIMARY KEY ("product_alias_id")
);

-- CreateTable
CREATE TABLE "unit_alias" (
    "unit_alias_id" BIGSERIAL NOT NULL,
    "unit_id" BIGINT NOT NULL,
    "alias_name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT NOT NULL,

    CONSTRAINT "unit_alias_pkey" PRIMARY KEY ("unit_alias_id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "audit_log_id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" BIGINT NOT NULL,
    "entity_number" VARCHAR(50),
    "changed_fields" JSONB,
    "reason" VARCHAR(255),
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("audit_log_id")
);

-- CreateTable
CREATE TABLE "activity_log" (
    "activity_log_id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "activity_type" VARCHAR(50) NOT NULL,
    "entity_type" VARCHAR(50),
    "entity_id" BIGINT,
    "entity_number" VARCHAR(50),
    "description" VARCHAR(500) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_log_pkey" PRIMARY KEY ("activity_log_id")
);

-- CreateTable
CREATE TABLE "security_log" (
    "security_log_id" BIGSERIAL NOT NULL,
    "user_id" BIGINT,
    "event_type" VARCHAR(50) NOT NULL,
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(500),
    "success" BOOLEAN NOT NULL,
    "failure_reason" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_log_pkey" PRIMARY KEY ("security_log_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_purchase_order_number_key" ON "purchase_order"("purchase_order_number");

-- CreateIndex
CREATE INDEX "purchase_order_supplier_id_idx" ON "purchase_order"("supplier_id");

-- CreateIndex
CREATE INDEX "purchase_order_created_by_idx" ON "purchase_order"("created_by");

-- CreateIndex
CREATE INDEX "purchase_order_updated_by_idx" ON "purchase_order"("updated_by");

-- CreateIndex
CREATE INDEX "purchase_order_status_idx" ON "purchase_order"("status");

-- CreateIndex
CREATE INDEX "purchase_order_detail_purchase_order_id_idx" ON "purchase_order_detail"("purchase_order_id");

-- CreateIndex
CREATE INDEX "purchase_order_detail_product_unit_id_idx" ON "purchase_order_detail"("product_unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_invoice_purchase_invoice_number_key" ON "purchase_invoice"("purchase_invoice_number");

-- CreateIndex
CREATE INDEX "purchase_invoice_purchase_order_id_idx" ON "purchase_invoice"("purchase_order_id");

-- CreateIndex
CREATE INDEX "purchase_invoice_supplier_id_idx" ON "purchase_invoice"("supplier_id");

-- CreateIndex
CREATE INDEX "purchase_invoice_created_by_idx" ON "purchase_invoice"("created_by");

-- CreateIndex
CREATE INDEX "purchase_invoice_updated_by_idx" ON "purchase_invoice"("updated_by");

-- CreateIndex
CREATE INDEX "purchase_invoice_status_payment_idx" ON "purchase_invoice"("status_payment");

-- CreateIndex
CREATE INDEX "purchase_invoice_status_idx" ON "purchase_invoice"("status");

-- CreateIndex
CREATE INDEX "purchase_invoice_detail_purchase_invoice_id_idx" ON "purchase_invoice_detail"("purchase_invoice_id");

-- CreateIndex
CREATE INDEX "purchase_invoice_detail_product_unit_id_idx" ON "purchase_invoice_detail"("product_unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_return_purchase_return_number_key" ON "purchase_return"("purchase_return_number");

-- CreateIndex
CREATE INDEX "purchase_return_purchase_invoice_id_idx" ON "purchase_return"("purchase_invoice_id");

-- CreateIndex
CREATE INDEX "purchase_return_supplier_id_idx" ON "purchase_return"("supplier_id");

-- CreateIndex
CREATE INDEX "purchase_return_created_by_idx" ON "purchase_return"("created_by");

-- CreateIndex
CREATE INDEX "purchase_return_detail_purchase_return_id_idx" ON "purchase_return_detail"("purchase_return_id");

-- CreateIndex
CREATE INDEX "purchase_return_detail_purchase_invoice_detail_id_idx" ON "purchase_return_detail"("purchase_invoice_detail_id");

-- CreateIndex
CREATE INDEX "purchase_return_detail_product_unit_id_idx" ON "purchase_return_detail"("product_unit_id");

-- CreateIndex
CREATE INDEX "purchase_invoice_payment_purchase_invoice_id_idx" ON "purchase_invoice_payment"("purchase_invoice_id");

-- CreateIndex
CREATE INDEX "purchase_invoice_payment_financial_account_id_idx" ON "purchase_invoice_payment"("financial_account_id");

-- CreateIndex
CREATE INDEX "purchase_invoice_payment_created_by_idx" ON "purchase_invoice_payment"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "customer_financial_summary_customer_id_key" ON "customer_financial_summary"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_financial_summary_supplier_id_key" ON "supplier_financial_summary"("supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_account_transaction_transaction_number_key" ON "customer_account_transaction"("transaction_number");

-- CreateIndex
CREATE INDEX "customer_account_transaction_customer_id_idx" ON "customer_account_transaction"("customer_id");

-- CreateIndex
CREATE INDEX "customer_account_transaction_transaction_date_idx" ON "customer_account_transaction"("transaction_date");

-- CreateIndex
CREATE INDEX "customer_account_transaction_reference_type_reference_id_idx" ON "customer_account_transaction"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "customer_account_transaction_created_by_idx" ON "customer_account_transaction"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_account_transaction_transaction_number_key" ON "supplier_account_transaction"("transaction_number");

-- CreateIndex
CREATE INDEX "supplier_account_transaction_supplier_id_idx" ON "supplier_account_transaction"("supplier_id");

-- CreateIndex
CREATE INDEX "supplier_account_transaction_transaction_date_idx" ON "supplier_account_transaction"("transaction_date");

-- CreateIndex
CREATE INDEX "supplier_account_transaction_reference_type_reference_id_idx" ON "supplier_account_transaction"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "supplier_account_transaction_created_by_idx" ON "supplier_account_transaction"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "financial_account_account_name_key" ON "financial_account"("account_name");

-- CreateIndex
CREATE INDEX "financial_account_created_by_idx" ON "financial_account"("created_by");

-- CreateIndex
CREATE INDEX "financial_account_updated_by_idx" ON "financial_account"("updated_by");

-- CreateIndex
CREATE UNIQUE INDEX "financial_account_transaction_transaction_number_key" ON "financial_account_transaction"("transaction_number");

-- CreateIndex
CREATE INDEX "financial_account_transaction_financial_account_id_idx" ON "financial_account_transaction"("financial_account_id");

-- CreateIndex
CREATE INDEX "financial_account_transaction_transaction_date_idx" ON "financial_account_transaction"("transaction_date");

-- CreateIndex
CREATE INDEX "financial_account_transaction_reference_type_reference_id_idx" ON "financial_account_transaction"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "financial_account_transaction_created_by_idx" ON "financial_account_transaction"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "fifo_layer_fifo_layer_number_key" ON "fifo_layer"("fifo_layer_number");

-- CreateIndex
CREATE INDEX "fifo_layer_product_unit_id_idx" ON "fifo_layer"("product_unit_id");

-- CreateIndex
CREATE INDEX "fifo_layer_origin_inventory_movement_id_idx" ON "fifo_layer"("origin_inventory_movement_id");

-- CreateIndex
CREATE INDEX "fifo_layer_created_by_idx" ON "fifo_layer"("created_by");

-- CreateIndex
CREATE INDEX "fifo_layer_transaction_fifo_layer_id_idx" ON "fifo_layer_transaction"("fifo_layer_id");

-- CreateIndex
CREATE INDEX "fifo_layer_transaction_inventory_movement_id_idx" ON "fifo_layer_transaction"("inventory_movement_id");

-- CreateIndex
CREATE INDEX "fifo_layer_transaction_created_by_idx" ON "fifo_layer_transaction"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_transformation_transformation_number_key" ON "inventory_transformation"("transformation_number");

-- CreateIndex
CREATE INDEX "inventory_transformation_created_by_idx" ON "inventory_transformation"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_movement_movement_number_key" ON "inventory_movement"("movement_number");

-- CreateIndex
CREATE INDEX "inventory_movement_product_unit_id_idx" ON "inventory_movement"("product_unit_id");

-- CreateIndex
CREATE INDEX "inventory_movement_transformation_id_idx" ON "inventory_movement"("transformation_id");

-- CreateIndex
CREATE INDEX "inventory_movement_created_by_idx" ON "inventory_movement"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_adjustment_adjustment_number_key" ON "inventory_adjustment"("adjustment_number");

-- CreateIndex
CREATE INDEX "inventory_adjustment_created_by_idx" ON "inventory_adjustment"("created_by");

-- CreateIndex
CREATE INDEX "inventory_adjustment_approved_by_idx" ON "inventory_adjustment"("approved_by");

-- CreateIndex
CREATE INDEX "inventory_adjustment_detail_adjustment_id_idx" ON "inventory_adjustment_detail"("adjustment_id");

-- CreateIndex
CREATE INDEX "inventory_adjustment_detail_product_unit_id_idx" ON "inventory_adjustment_detail"("product_unit_id");

-- CreateIndex
CREATE INDEX "inventory_adjustment_detail_created_by_idx" ON "inventory_adjustment_detail"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "stock_opname_stock_opname_number_key" ON "stock_opname"("stock_opname_number");

-- CreateIndex
CREATE INDEX "stock_opname_created_by_idx" ON "stock_opname"("created_by");

-- CreateIndex
CREATE INDEX "stock_opname_approved_by_idx" ON "stock_opname"("approved_by");

-- CreateIndex
CREATE INDEX "stock_opname_detail_stock_opname_id_idx" ON "stock_opname_detail"("stock_opname_id");

-- CreateIndex
CREATE INDEX "stock_opname_detail_product_unit_id_idx" ON "stock_opname_detail"("product_unit_id");

-- CreateIndex
CREATE INDEX "stock_opname_detail_created_by_idx" ON "stock_opname_detail"("created_by");

-- CreateIndex
CREATE INDEX "inventory_stock_product_id_idx" ON "inventory_stock"("product_id");

-- CreateIndex
CREATE INDEX "inventory_stock_product_unit_id_idx" ON "inventory_stock"("product_unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_order_sales_order_number_key" ON "sales_order"("sales_order_number");

-- CreateIndex
CREATE INDEX "sales_order_customer_id_idx" ON "sales_order"("customer_id");

-- CreateIndex
CREATE INDEX "sales_order_created_by_idx" ON "sales_order"("created_by");

-- CreateIndex
CREATE INDEX "sales_order_updated_by_idx" ON "sales_order"("updated_by");

-- CreateIndex
CREATE INDEX "sales_order_detail_sales_order_id_idx" ON "sales_order_detail"("sales_order_id");

-- CreateIndex
CREATE INDEX "sales_order_detail_product_unit_id_idx" ON "sales_order_detail"("product_unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoice_sales_invoice_number_key" ON "sales_invoice"("sales_invoice_number");

-- CreateIndex
CREATE INDEX "sales_invoice_sales_order_id_idx" ON "sales_invoice"("sales_order_id");

-- CreateIndex
CREATE INDEX "sales_invoice_customer_id_idx" ON "sales_invoice"("customer_id");

-- CreateIndex
CREATE INDEX "sales_invoice_created_by_idx" ON "sales_invoice"("created_by");

-- CreateIndex
CREATE INDEX "sales_invoice_approved_by_idx" ON "sales_invoice"("approved_by");

-- CreateIndex
CREATE INDEX "sales_invoice_detail_sales_invoice_id_idx" ON "sales_invoice_detail"("sales_invoice_id");

-- CreateIndex
CREATE INDEX "sales_invoice_detail_sales_order_detail_id_idx" ON "sales_invoice_detail"("sales_order_detail_id");

-- CreateIndex
CREATE INDEX "sales_invoice_detail_product_unit_id_idx" ON "sales_invoice_detail"("product_unit_id");

-- CreateIndex
CREATE INDEX "sales_invoice_detail_created_by_idx" ON "sales_invoice_detail"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoice_payment_payment_number_key" ON "sales_invoice_payment"("payment_number");

-- CreateIndex
CREATE INDEX "sales_invoice_payment_sales_invoice_id_idx" ON "sales_invoice_payment"("sales_invoice_id");

-- CreateIndex
CREATE INDEX "sales_invoice_payment_financial_account_id_idx" ON "sales_invoice_payment"("financial_account_id");

-- CreateIndex
CREATE INDEX "sales_invoice_payment_created_by_idx" ON "sales_invoice_payment"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "sales_return_sales_return_number_key" ON "sales_return"("sales_return_number");

-- CreateIndex
CREATE INDEX "sales_return_sales_invoice_id_idx" ON "sales_return"("sales_invoice_id");

-- CreateIndex
CREATE INDEX "sales_return_customer_id_idx" ON "sales_return"("customer_id");

-- CreateIndex
CREATE INDEX "sales_return_created_by_idx" ON "sales_return"("created_by");

-- CreateIndex
CREATE INDEX "sales_return_approved_by_idx" ON "sales_return"("approved_by");

-- CreateIndex
CREATE INDEX "sales_return_detail_sales_return_id_idx" ON "sales_return_detail"("sales_return_id");

-- CreateIndex
CREATE INDEX "sales_return_detail_sales_invoice_detail_id_idx" ON "sales_return_detail"("sales_invoice_detail_id");

-- CreateIndex
CREATE INDEX "sales_return_detail_product_unit_id_idx" ON "sales_return_detail"("product_unit_id");

-- CreateIndex
CREATE INDEX "sales_return_detail_created_by_idx" ON "sales_return_detail"("created_by");

-- CreateIndex
CREATE INDEX "guest_suggested_price_product_unit_id_idx" ON "guest_suggested_price"("product_unit_id");

-- CreateIndex
CREATE INDEX "guest_suggested_price_created_by_idx" ON "guest_suggested_price"("created_by");

-- CreateIndex
CREATE INDEX "guest_suggested_price_updated_by_idx" ON "guest_suggested_price"("updated_by");

-- CreateIndex
CREATE INDEX "customer_suggested_price_created_by_idx" ON "customer_suggested_price"("created_by");

-- CreateIndex
CREATE INDEX "customer_suggested_price_updated_by_idx" ON "customer_suggested_price"("updated_by");

-- CreateIndex
CREATE UNIQUE INDEX "customer_suggested_price_customer_id_product_unit_id_key" ON "customer_suggested_price"("customer_id", "product_unit_id");

-- CreateIndex
CREATE INDEX "supplier_suggested_cost_created_by_idx" ON "supplier_suggested_cost"("created_by");

-- CreateIndex
CREATE INDEX "supplier_suggested_cost_updated_by_idx" ON "supplier_suggested_cost"("updated_by");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_suggested_cost_supplier_id_product_unit_id_key" ON "supplier_suggested_cost"("supplier_id", "product_unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_alias_alias_name_key" ON "product_alias"("alias_name");

-- CreateIndex
CREATE INDEX "product_alias_product_id_idx" ON "product_alias"("product_id");

-- CreateIndex
CREATE INDEX "product_alias_created_by_idx" ON "product_alias"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "unit_alias_alias_name_key" ON "unit_alias"("alias_name");

-- CreateIndex
CREATE INDEX "unit_alias_unit_id_idx" ON "unit_alias"("unit_id");

-- CreateIndex
CREATE INDEX "unit_alias_created_by_idx" ON "unit_alias"("created_by");

-- CreateIndex
CREATE INDEX "audit_log_user_id_idx" ON "audit_log"("user_id");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "activity_log_user_id_idx" ON "activity_log"("user_id");

-- CreateIndex
CREATE INDEX "activity_log_entity_type_entity_id_idx" ON "activity_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "security_log_user_id_idx" ON "security_log"("user_id");

-- AddForeignKey
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("supplier_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_detail" ADD CONSTRAINT "purchase_order_detail_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_order"("purchase_order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_detail" ADD CONSTRAINT "purchase_order_detail_product_unit_id_fkey" FOREIGN KEY ("product_unit_id") REFERENCES "product_unit"("product_unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice" ADD CONSTRAINT "purchase_invoice_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_order"("purchase_order_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice" ADD CONSTRAINT "purchase_invoice_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("supplier_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice" ADD CONSTRAINT "purchase_invoice_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice" ADD CONSTRAINT "purchase_invoice_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_detail" ADD CONSTRAINT "purchase_invoice_detail_purchase_invoice_id_fkey" FOREIGN KEY ("purchase_invoice_id") REFERENCES "purchase_invoice"("purchase_invoice_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_detail" ADD CONSTRAINT "purchase_invoice_detail_product_unit_id_fkey" FOREIGN KEY ("product_unit_id") REFERENCES "product_unit"("product_unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return" ADD CONSTRAINT "purchase_return_purchase_invoice_id_fkey" FOREIGN KEY ("purchase_invoice_id") REFERENCES "purchase_invoice"("purchase_invoice_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return" ADD CONSTRAINT "purchase_return_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("supplier_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return" ADD CONSTRAINT "purchase_return_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_detail" ADD CONSTRAINT "purchase_return_detail_purchase_return_id_fkey" FOREIGN KEY ("purchase_return_id") REFERENCES "purchase_return"("purchase_return_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_detail" ADD CONSTRAINT "purchase_return_detail_purchase_invoice_detail_id_fkey" FOREIGN KEY ("purchase_invoice_detail_id") REFERENCES "purchase_invoice_detail"("purchase_invoice_detail_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_detail" ADD CONSTRAINT "purchase_return_detail_product_unit_id_fkey" FOREIGN KEY ("product_unit_id") REFERENCES "product_unit"("product_unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_payment" ADD CONSTRAINT "purchase_invoice_payment_purchase_invoice_id_fkey" FOREIGN KEY ("purchase_invoice_id") REFERENCES "purchase_invoice"("purchase_invoice_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_payment" ADD CONSTRAINT "purchase_invoice_payment_financial_account_id_fkey" FOREIGN KEY ("financial_account_id") REFERENCES "financial_account"("financial_account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_payment" ADD CONSTRAINT "purchase_invoice_payment_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_financial_summary" ADD CONSTRAINT "customer_financial_summary_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_financial_summary" ADD CONSTRAINT "supplier_financial_summary_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("supplier_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_account_transaction" ADD CONSTRAINT "customer_account_transaction_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_account_transaction" ADD CONSTRAINT "customer_account_transaction_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_account_transaction" ADD CONSTRAINT "supplier_account_transaction_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("supplier_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_account_transaction" ADD CONSTRAINT "supplier_account_transaction_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_account" ADD CONSTRAINT "financial_account_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_account" ADD CONSTRAINT "financial_account_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_account_transaction" ADD CONSTRAINT "financial_account_transaction_financial_account_id_fkey" FOREIGN KEY ("financial_account_id") REFERENCES "financial_account"("financial_account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_account_transaction" ADD CONSTRAINT "financial_account_transaction_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fifo_layer" ADD CONSTRAINT "fifo_layer_product_unit_id_fkey" FOREIGN KEY ("product_unit_id") REFERENCES "product_unit"("product_unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fifo_layer" ADD CONSTRAINT "fifo_layer_origin_inventory_movement_id_fkey" FOREIGN KEY ("origin_inventory_movement_id") REFERENCES "inventory_movement"("inventory_movement_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fifo_layer" ADD CONSTRAINT "fifo_layer_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fifo_layer_transaction" ADD CONSTRAINT "fifo_layer_transaction_fifo_layer_id_fkey" FOREIGN KEY ("fifo_layer_id") REFERENCES "fifo_layer"("fifo_layer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fifo_layer_transaction" ADD CONSTRAINT "fifo_layer_transaction_inventory_movement_id_fkey" FOREIGN KEY ("inventory_movement_id") REFERENCES "inventory_movement"("inventory_movement_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fifo_layer_transaction" ADD CONSTRAINT "fifo_layer_transaction_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transformation" ADD CONSTRAINT "inventory_transformation_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_product_unit_id_fkey" FOREIGN KEY ("product_unit_id") REFERENCES "product_unit"("product_unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_transformation_id_fkey" FOREIGN KEY ("transformation_id") REFERENCES "inventory_transformation"("transformation_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustment" ADD CONSTRAINT "inventory_adjustment_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustment" ADD CONSTRAINT "inventory_adjustment_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "user"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustment_detail" ADD CONSTRAINT "inventory_adjustment_detail_adjustment_id_fkey" FOREIGN KEY ("adjustment_id") REFERENCES "inventory_adjustment"("adjustment_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustment_detail" ADD CONSTRAINT "inventory_adjustment_detail_product_unit_id_fkey" FOREIGN KEY ("product_unit_id") REFERENCES "product_unit"("product_unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustment_detail" ADD CONSTRAINT "inventory_adjustment_detail_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_opname" ADD CONSTRAINT "stock_opname_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_opname" ADD CONSTRAINT "stock_opname_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "user"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_opname_detail" ADD CONSTRAINT "stock_opname_detail_stock_opname_id_fkey" FOREIGN KEY ("stock_opname_id") REFERENCES "stock_opname"("stock_opname_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_opname_detail" ADD CONSTRAINT "stock_opname_detail_product_unit_id_fkey" FOREIGN KEY ("product_unit_id") REFERENCES "product_unit"("product_unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_opname_detail" ADD CONSTRAINT "stock_opname_detail_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_stock" ADD CONSTRAINT "inventory_stock_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_stock" ADD CONSTRAINT "inventory_stock_product_unit_id_fkey" FOREIGN KEY ("product_unit_id") REFERENCES "product_unit"("product_unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order" ADD CONSTRAINT "sales_order_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("customer_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order" ADD CONSTRAINT "sales_order_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order" ADD CONSTRAINT "sales_order_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_detail" ADD CONSTRAINT "sales_order_detail_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_order"("sales_order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_detail" ADD CONSTRAINT "sales_order_detail_product_unit_id_fkey" FOREIGN KEY ("product_unit_id") REFERENCES "product_unit"("product_unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice" ADD CONSTRAINT "sales_invoice_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_order"("sales_order_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice" ADD CONSTRAINT "sales_invoice_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("customer_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice" ADD CONSTRAINT "sales_invoice_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice" ADD CONSTRAINT "sales_invoice_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "user"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_detail" ADD CONSTRAINT "sales_invoice_detail_sales_invoice_id_fkey" FOREIGN KEY ("sales_invoice_id") REFERENCES "sales_invoice"("sales_invoice_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_detail" ADD CONSTRAINT "sales_invoice_detail_sales_order_detail_id_fkey" FOREIGN KEY ("sales_order_detail_id") REFERENCES "sales_order_detail"("sales_order_detail_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_detail" ADD CONSTRAINT "sales_invoice_detail_product_unit_id_fkey" FOREIGN KEY ("product_unit_id") REFERENCES "product_unit"("product_unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_detail" ADD CONSTRAINT "sales_invoice_detail_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_payment" ADD CONSTRAINT "sales_invoice_payment_sales_invoice_id_fkey" FOREIGN KEY ("sales_invoice_id") REFERENCES "sales_invoice"("sales_invoice_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_payment" ADD CONSTRAINT "sales_invoice_payment_financial_account_id_fkey" FOREIGN KEY ("financial_account_id") REFERENCES "financial_account"("financial_account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_payment" ADD CONSTRAINT "sales_invoice_payment_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return" ADD CONSTRAINT "sales_return_sales_invoice_id_fkey" FOREIGN KEY ("sales_invoice_id") REFERENCES "sales_invoice"("sales_invoice_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return" ADD CONSTRAINT "sales_return_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("customer_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return" ADD CONSTRAINT "sales_return_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return" ADD CONSTRAINT "sales_return_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "user"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_detail" ADD CONSTRAINT "sales_return_detail_sales_return_id_fkey" FOREIGN KEY ("sales_return_id") REFERENCES "sales_return"("sales_return_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_detail" ADD CONSTRAINT "sales_return_detail_sales_invoice_detail_id_fkey" FOREIGN KEY ("sales_invoice_detail_id") REFERENCES "sales_invoice_detail"("sales_invoice_detail_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_detail" ADD CONSTRAINT "sales_return_detail_product_unit_id_fkey" FOREIGN KEY ("product_unit_id") REFERENCES "product_unit"("product_unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_detail" ADD CONSTRAINT "sales_return_detail_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_suggested_price" ADD CONSTRAINT "guest_suggested_price_product_unit_id_fkey" FOREIGN KEY ("product_unit_id") REFERENCES "product_unit"("product_unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_suggested_price" ADD CONSTRAINT "guest_suggested_price_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_suggested_price" ADD CONSTRAINT "guest_suggested_price_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_suggested_price" ADD CONSTRAINT "customer_suggested_price_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_suggested_price" ADD CONSTRAINT "customer_suggested_price_product_unit_id_fkey" FOREIGN KEY ("product_unit_id") REFERENCES "product_unit"("product_unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_suggested_price" ADD CONSTRAINT "customer_suggested_price_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_suggested_price" ADD CONSTRAINT "customer_suggested_price_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_suggested_cost" ADD CONSTRAINT "supplier_suggested_cost_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("supplier_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_suggested_cost" ADD CONSTRAINT "supplier_suggested_cost_product_unit_id_fkey" FOREIGN KEY ("product_unit_id") REFERENCES "product_unit"("product_unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_suggested_cost" ADD CONSTRAINT "supplier_suggested_cost_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_suggested_cost" ADD CONSTRAINT "supplier_suggested_cost_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_alias" ADD CONSTRAINT "product_alias_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_alias" ADD CONSTRAINT "product_alias_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_alias" ADD CONSTRAINT "unit_alias_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "unit"("unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_alias" ADD CONSTRAINT "unit_alias_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_log" ADD CONSTRAINT "security_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
