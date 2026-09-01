-- FIFO traceability foundation: canonical origins, movement semantics, and
-- exact Transformation detail-to-movement allocation. This migration is
-- additive/backward-aware and preserves all existing FIFO quantities/costs.

-- Canonicalize Inventory Movement document headers and event names.
UPDATE "inventory_movement" AS movement
SET
  "origin_type" = 'PURCHASE_INVOICE',
  "origin_id" = detail."purchase_invoice_id",
  "movement_type" = 'PURCHASE_RECEIPT'
FROM "purchase_invoice_detail" AS detail
WHERE movement."origin_type" = 'PURCHASE_INVOICE_DETAIL'
  AND movement."origin_id" = detail."purchase_invoice_detail_id";

UPDATE "inventory_movement" AS movement
SET
  "origin_type" = 'PURCHASE_RETURN',
  "origin_id" = detail."purchase_return_id",
  "movement_type" = CASE
    WHEN movement."movement_type" = 'PURCHASE_RETURN_REPLACEMENT' THEN 'PURCHASE_REPLACEMENT_IN'
    WHEN movement."movement_type" = 'PURCHASE_RETURN_CANCEL' THEN 'PURCHASE_RETURN_CANCEL_IN'
    ELSE 'PURCHASE_RETURN_OUT'
  END
FROM "purchase_return_detail" AS detail
WHERE movement."origin_type" = 'PURCHASE_RETURN_DETAIL'
  AND movement."origin_id" = detail."purchase_return_detail_id";

UPDATE "inventory_movement"
SET
  "origin_type" = 'INVENTORY_TRANSFORMATION',
  "movement_type" = CASE
    WHEN "direction" = 'IN' THEN 'TRANSFORMATION_RESULT_IN'
    ELSE 'TRANSFORMATION_SOURCE_OUT'
  END
WHERE "origin_type" = 'TRANSFORMATION';

UPDATE "inventory_movement"
SET "movement_type" = CASE
  WHEN "direction" = 'IN' THEN 'ADJUSTMENT_IN'
  ELSE 'ADJUSTMENT_OUT'
END
WHERE "origin_type" = 'INVENTORY_ADJUSTMENT'
  AND "movement_type" = 'INVENTORY_ADJUSTMENT';

-- Rebuild the layer-origin enum with canonical document names.
ALTER TABLE "fifo_layer"
  ALTER COLUMN "origin_type" TYPE TEXT USING "origin_type"::TEXT;

UPDATE "fifo_layer" AS layer
SET "origin_id" = detail."purchase_invoice_id"
FROM "purchase_invoice_detail" AS detail
WHERE layer."origin_type" = 'PURCHASE'
  AND layer."origin_id" = detail."purchase_invoice_detail_id";

UPDATE "fifo_layer" AS layer
SET "origin_id" = detail."purchase_return_id"
FROM "purchase_return_detail" AS detail
WHERE layer."origin_type" = 'PURCHASE_RETURN_REPLACEMENT'
  AND layer."origin_id" = detail."purchase_return_detail_id";

UPDATE "fifo_layer"
SET "origin_type" = CASE "origin_type"
  WHEN 'PURCHASE' THEN 'PURCHASE_INVOICE'
  WHEN 'PURCHASE_RETURN_REPLACEMENT' THEN 'PURCHASE_RETURN'
  WHEN 'TRANSFORMATION' THEN 'INVENTORY_TRANSFORMATION'
  WHEN 'INVENTORY_FOUND' THEN 'INVENTORY_ADJUSTMENT'
  ELSE "origin_type"
END;

DROP TYPE "FifoLayerOriginType";
CREATE TYPE "FifoLayerOriginType" AS ENUM (
  'PURCHASE_INVOICE',
  'PURCHASE_RETURN',
  'SALES_RETURN',
  'OPENING_BALANCE',
  'INVENTORY_TRANSFORMATION',
  'INVENTORY_ADJUSTMENT',
  'INVENTORY_LOAN_RETURN'
);

ALTER TABLE "fifo_layer"
  ALTER COLUMN "origin_type" TYPE "FifoLayerOriginType"
  USING "origin_type"::"FifoLayerOriginType";

-- Exact allocation between an aggregated Transformation movement and each
-- source/result detail that contributes quantity and cost to it.
CREATE TYPE "TransformationMovementRole" AS ENUM ('SOURCE', 'RESULT');

CREATE TABLE "inventory_transformation_movement_detail" (
  "transformation_movement_detail_id" BIGSERIAL NOT NULL,
  "transformation_detail_id" BIGINT NOT NULL,
  "inventory_movement_id" BIGINT NOT NULL,
  "movement_role" "TransformationMovementRole" NOT NULL,
  "allocated_quantity" DECIMAL(18,3) NOT NULL,
  "allocated_cost" DECIMAL(18,2) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_transformation_movement_detail_pkey"
    PRIMARY KEY ("transformation_movement_detail_id"),
  CONSTRAINT "inventory_transformation_movement_detail_quantity_check"
    CHECK ("allocated_quantity" > 0),
  CONSTRAINT "inventory_transformation_movement_detail_cost_check"
    CHECK ("allocated_cost" >= 0),
  CONSTRAINT "inventory_transformation_movement_detail_detail_fkey"
    FOREIGN KEY ("transformation_detail_id")
    REFERENCES "inventory_transformation_detail"("transformation_detail_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_transformation_movement_detail_movement_fkey"
    FOREIGN KEY ("inventory_movement_id")
    REFERENCES "inventory_movement"("inventory_movement_id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "inventory_transformation_movement_detail_unique"
  ON "inventory_transformation_movement_detail"
  ("transformation_detail_id", "inventory_movement_id", "movement_role");
CREATE INDEX "inventory_transformation_movement_detail_movement_role_idx"
  ON "inventory_transformation_movement_detail"
  ("inventory_movement_id", "movement_role");
CREATE INDEX "inventory_transformation_movement_detail_detail_idx"
  ON "inventory_transformation_movement_detail"("transformation_detail_id");

INSERT INTO "inventory_transformation_movement_detail" (
  "transformation_detail_id",
  "inventory_movement_id",
  "movement_role",
  "allocated_quantity",
  "allocated_cost"
)
SELECT
  detail."transformation_detail_id",
  movement."inventory_movement_id",
  'SOURCE'::"TransformationMovementRole",
  detail."source_quantity",
  detail."source_cost_total"
FROM "inventory_transformation_detail" AS detail
JOIN "inventory_movement" AS movement
  ON movement."transformation_id" = detail."transformation_id"
 AND movement."product_unit_id" = detail."source_product_unit_id"
 AND movement."direction" = 'OUT'
ON CONFLICT DO NOTHING;

INSERT INTO "inventory_transformation_movement_detail" (
  "transformation_detail_id",
  "inventory_movement_id",
  "movement_role",
  "allocated_quantity",
  "allocated_cost"
)
SELECT
  detail."transformation_detail_id",
  movement."inventory_movement_id",
  'RESULT'::"TransformationMovementRole",
  detail."result_quantity",
  detail."result_cost_total"
FROM "inventory_transformation_detail" AS detail
JOIN "inventory_movement" AS movement
  ON movement."transformation_id" = detail."transformation_id"
 AND movement."product_unit_id" = detail."result_product_unit_id"
 AND movement."direction" = 'IN'
ON CONFLICT DO NOTHING;

CREATE INDEX "fifo_layer_product_remaining_created_idx"
  ON "fifo_layer"("product_unit_id", "remaining_qty", "created_at", "fifo_layer_id");
CREATE INDEX "fifo_layer_origin_idx"
  ON "fifo_layer"("origin_type", "origin_id");
CREATE INDEX "fifo_layer_transaction_layer_created_idx"
  ON "fifo_layer_transaction"("fifo_layer_id", "created_at", "fifo_layer_transaction_id");
CREATE INDEX "inventory_movement_date_id_idx"
  ON "inventory_movement"("movement_date", "inventory_movement_id");
