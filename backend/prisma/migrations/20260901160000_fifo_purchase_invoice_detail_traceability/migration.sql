-- Preserve an exact, indexed link from each purchase receipt FIFO layer to
-- the Purchase Invoice detail that created it. Document-level origin_id stays
-- canonical and remains suitable for opening the complete PI document.

ALTER TABLE "fifo_layer"
  ADD COLUMN "purchase_invoice_detail_id" BIGINT;

-- Existing purchase layers are matched through the canonical PI header and
-- product. Only unambiguous matches are backfilled; ambiguous legacy data is
-- deliberately left NULL instead of guessing a business relationship.
WITH matched_details AS (
  SELECT
    layer."fifo_layer_id",
    detail."purchase_invoice_detail_id",
    COUNT(*) OVER (PARTITION BY layer."fifo_layer_id") AS "candidate_count"
  FROM "fifo_layer" AS layer
  JOIN "product_unit" AS layer_unit
    ON layer_unit."product_unit_id" = layer."product_unit_id"
  JOIN "purchase_invoice_detail" AS detail
    ON detail."purchase_invoice_id" = layer."origin_id"
  JOIN "product_unit" AS detail_unit
    ON detail_unit."product_unit_id" = detail."product_unit_id"
   AND detail_unit."product_id" = layer_unit."product_id"
  WHERE layer."origin_type" = 'PURCHASE_INVOICE'
)
UPDATE "fifo_layer" AS layer
SET "purchase_invoice_detail_id" = matched."purchase_invoice_detail_id"
FROM matched_details AS matched
WHERE layer."fifo_layer_id" = matched."fifo_layer_id"
  AND matched."candidate_count" = 1;

ALTER TABLE "fifo_layer"
  ADD CONSTRAINT "fifo_layer_purchase_invoice_detail_id_fkey"
  FOREIGN KEY ("purchase_invoice_detail_id")
  REFERENCES "purchase_invoice_detail"("purchase_invoice_detail_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "fifo_layer_purchase_invoice_detail_id_idx"
  ON "fifo_layer"("purchase_invoice_detail_id");
