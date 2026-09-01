-- FR-INV-001/002: additive inventory document metadata and efficient origin lookup.
ALTER TABLE "inventory_movement" ADD COLUMN "origin_number" VARCHAR(30);
UPDATE "inventory_movement" SET "origin_number" = "movement_number" WHERE "origin_number" IS NULL;
ALTER TABLE "inventory_movement" ALTER COLUMN "origin_number" SET NOT NULL;
CREATE INDEX "inventory_movement_origin_type_origin_id_idx" ON "inventory_movement"("origin_type", "origin_id");
CREATE INDEX "inventory_movement_origin_type_origin_number_idx" ON "inventory_movement"("origin_type", "origin_number");

ALTER TABLE "inventory_adjustment"
  ADD COLUMN "source_type" VARCHAR(30) NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "stock_opname_id" BIGINT,
  ADD COLUMN "updated_at" TIMESTAMP(3),
  ADD COLUMN "updated_by" BIGINT,
  ADD COLUMN "cancelled_at" TIMESTAMP(3),
  ADD COLUMN "cancelled_by" BIGINT;

ALTER TABLE "inventory_adjustment_detail"
  ADD COLUMN "quantity_before" DECIMAL(18,3),
  ADD COLUMN "quantity_after" DECIMAL(18,3),
  ADD COLUMN "unit_cost" DECIMAL(18,2),
  ADD COLUMN "total_cost" DECIMAL(18,2);

UPDATE "stock_opname" SET "status" = 'DRAFT' WHERE "status" IN ('COUNTING', 'REVIEW');
UPDATE "stock_opname" SET "status" = 'APPROVED' WHERE "status" = 'COMPLETED';
ALTER TABLE "stock_opname"
  ADD COLUMN "updated_at" TIMESTAMP(3),
  ADD COLUMN "updated_by" BIGINT,
  ADD COLUMN "cancelled_at" TIMESTAMP(3),
  ADD COLUMN "cancelled_by" BIGINT;
ALTER TABLE "stock_opname_detail"
  ADD COLUMN "packed_qty" DECIMAL(18,3) NOT NULL DEFAULT 0,
  ADD COLUMN "unit_cost" DECIMAL(18,2);

ALTER TABLE "inventory_adjustment"
  ADD CONSTRAINT "inventory_adjustment_stock_opname_id_fkey" FOREIGN KEY ("stock_opname_id") REFERENCES "stock_opname"("stock_opname_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "inventory_adjustment_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("user_id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "inventory_adjustment_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "user"("user_id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "inventory_adjustment_status_check" CHECK ("status" IN ('DRAFT', 'APPROVED', 'CANCELLED')),
  ADD CONSTRAINT "inventory_adjustment_approval_check" CHECK ("status" <> 'APPROVED' OR ("approved_at" IS NOT NULL AND "approved_by" IS NOT NULL));
CREATE UNIQUE INDEX "inventory_adjustment_stock_opname_id_key" ON "inventory_adjustment"("stock_opname_id");
CREATE INDEX "inventory_adjustment_updated_by_idx" ON "inventory_adjustment"("updated_by");
CREATE INDEX "inventory_adjustment_cancelled_by_idx" ON "inventory_adjustment"("cancelled_by");

ALTER TABLE "stock_opname"
  ADD CONSTRAINT "stock_opname_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("user_id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "stock_opname_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "user"("user_id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "stock_opname_status_check" CHECK ("status" IN ('DRAFT', 'APPROVED', 'CANCELLED')),
  ADD CONSTRAINT "stock_opname_approval_check" CHECK ("status" <> 'APPROVED' OR ("approved_at" IS NOT NULL AND "approved_by" IS NOT NULL));
CREATE INDEX "stock_opname_updated_by_idx" ON "stock_opname"("updated_by");
CREATE INDEX "stock_opname_cancelled_by_idx" ON "stock_opname"("cancelled_by");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "inventory_stock" GROUP BY "product_unit_id" HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate inventory_stock product_unit_id must be resolved before applying inventory constraints';
  END IF;
END $$;
CREATE UNIQUE INDEX "inventory_stock_product_unit_id_key" ON "inventory_stock"("product_unit_id");
