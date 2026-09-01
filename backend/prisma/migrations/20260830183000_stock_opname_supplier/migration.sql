-- Optional supplier context for supplier-based stock opname catalog and traceability.
ALTER TABLE "stock_opname" ADD COLUMN "supplier_id" BIGINT;
ALTER TABLE "stock_opname"
  ADD CONSTRAINT "stock_opname_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("supplier_id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "stock_opname_supplier_id_idx" ON "stock_opname"("supplier_id");
