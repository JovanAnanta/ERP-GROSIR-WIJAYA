-- Add the explicit ProductUnit hierarchy without changing existing unit IDs.
ALTER TABLE "product_unit"
ADD COLUMN "parent_product_unit_id" BIGINT;

-- Fail before backfill if existing products do not have exactly one parent.
DO $$
BEGIN
  IF EXISTS (
    SELECT product_id
    FROM product_unit
    GROUP BY product_id
    HAVING COUNT(*) FILTER (WHERE is_parent) <> 1
  ) THEN
    RAISE EXCEPTION 'Each product must have exactly one parent ProductUnit';
  END IF;
END $$;

UPDATE "product_unit" child
SET "parent_product_unit_id" = parent."product_unit_id"
FROM "product_unit" parent
WHERE child."product_id" = parent."product_id"
  AND parent."is_parent" = TRUE
  AND child."is_parent" = FALSE;

ALTER TABLE "product_unit"
ADD CONSTRAINT "product_unit_parent_product_unit_id_fkey"
FOREIGN KEY ("parent_product_unit_id")
REFERENCES "product_unit"("product_unit_id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "product_unit"
ADD CONSTRAINT "product_unit_parent_reference_check"
CHECK (
  ("is_parent" = TRUE AND "parent_product_unit_id" IS NULL AND "conversion_factor" = 1)
  OR
  ("is_parent" = FALSE AND "parent_product_unit_id" IS NOT NULL)
);

CREATE UNIQUE INDEX "product_unit_one_parent_per_product"
ON "product_unit"("product_id")
WHERE "is_parent" = TRUE;

CREATE INDEX "product_unit_parent_product_unit_id_idx"
ON "product_unit"("parent_product_unit_id");

CREATE OR REPLACE FUNCTION validate_product_unit_parent()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."is_parent" = FALSE AND NOT EXISTS (
    SELECT 1
    FROM "product_unit" parent
    WHERE parent."product_unit_id" = NEW."parent_product_unit_id"
      AND parent."product_id" = NEW."product_id"
      AND parent."is_parent" = TRUE
  ) THEN
    RAISE EXCEPTION 'parent_product_unit_id must reference the parent unit of the same product';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."is_parent" = TRUE AND NEW."is_parent" = FALSE AND EXISTS (
    SELECT 1 FROM "product_unit" child
    WHERE child."parent_product_unit_id" = OLD."product_unit_id"
  ) THEN
    RAISE EXCEPTION 'A parent ProductUnit with child units cannot become a non-parent';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "product_unit_parent_validation"
BEFORE INSERT OR UPDATE OF "product_id", "is_parent", "parent_product_unit_id", "conversion_factor"
ON "product_unit"
FOR EACH ROW EXECUTE FUNCTION validate_product_unit_parent();

CREATE OR REPLACE FUNCTION validate_fifo_layer_parent_unit()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "product_unit" pu
    WHERE pu."product_unit_id" = NEW."product_unit_id"
      AND pu."is_parent" = TRUE
  ) THEN
    RAISE EXCEPTION 'FIFO Layer product_unit_id must reference a parent ProductUnit';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "fifo_layer_parent_unit_validation"
BEFORE INSERT OR UPDATE OF "product_unit_id"
ON "fifo_layer"
FOR EACH ROW EXECUTE FUNCTION validate_fifo_layer_parent_unit();
