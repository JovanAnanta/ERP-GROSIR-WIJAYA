-- FR-INV-003/004: additive transformation allocation details and packed stock aggregate.
ALTER TABLE "inventory_stock"
  ADD COLUMN "packed_qty" DECIMAL(18,3) NOT NULL DEFAULT 0;

ALTER TABLE "inventory_stock"
  ADD CONSTRAINT "inventory_stock_packed_qty_check"
  CHECK ("packed_qty" >= 0 AND "packed_qty" <= "actual_qty");

CREATE TABLE "inventory_transformation_detail" (
  "transformation_detail_id" BIGSERIAL NOT NULL,
  "transformation_id" BIGINT NOT NULL,
  "line_number" INTEGER NOT NULL,
  "source_product_unit_id" BIGINT NOT NULL,
  "source_quantity" DECIMAL(18,3) NOT NULL,
  "result_product_unit_id" BIGINT NOT NULL,
  "result_quantity" DECIMAL(18,3) NOT NULL,
  "source_cost_total" DECIMAL(18,2) NOT NULL,
  "suggested_unit_cost" DECIMAL(18,2) NOT NULL,
  "applied_unit_cost" DECIMAL(18,2) NOT NULL,
  "result_cost_total" DECIMAL(18,2) NOT NULL,
  "valuation_variance" DECIMAL(18,2) NOT NULL,
  "note" VARCHAR(255),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" BIGINT NOT NULL,
  CONSTRAINT "inventory_transformation_detail_pkey" PRIMARY KEY ("transformation_detail_id"),
  CONSTRAINT "inventory_transformation_detail_quantity_check" CHECK ("source_quantity" > 0 AND "result_quantity" > 0),
  CONSTRAINT "inventory_transformation_detail_cost_check" CHECK ("source_cost_total" >= 0 AND "suggested_unit_cost" >= 0 AND "applied_unit_cost" >= 0 AND "result_cost_total" >= 0)
);

CREATE UNIQUE INDEX "inventory_transformation_detail_transformation_id_line_number_key"
  ON "inventory_transformation_detail"("transformation_id", "line_number");
CREATE INDEX "inventory_transformation_detail_source_product_unit_id_idx"
  ON "inventory_transformation_detail"("source_product_unit_id");
CREATE INDEX "inventory_transformation_detail_result_product_unit_id_idx"
  ON "inventory_transformation_detail"("result_product_unit_id");
CREATE INDEX "inventory_transformation_detail_created_by_idx"
  ON "inventory_transformation_detail"("created_by");

ALTER TABLE "inventory_transformation_detail"
  ADD CONSTRAINT "inventory_transformation_detail_transformation_id_fkey"
    FOREIGN KEY ("transformation_id") REFERENCES "inventory_transformation"("transformation_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "inventory_transformation_detail_source_product_unit_id_fkey"
    FOREIGN KEY ("source_product_unit_id") REFERENCES "product_unit"("product_unit_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "inventory_transformation_detail_result_product_unit_id_fkey"
    FOREIGN KEY ("result_product_unit_id") REFERENCES "product_unit"("product_unit_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "inventory_transformation_detail_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
