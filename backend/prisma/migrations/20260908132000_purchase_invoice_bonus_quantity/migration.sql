-- Bonus goods increase physical FIFO quantity without reducing the supplier invoice.
-- Existing details are preserved with zero bonus.
ALTER TABLE "purchase_invoice_detail"
  ADD COLUMN "bonus_quantity" DECIMAL(18,3) NOT NULL DEFAULT 0;

ALTER TABLE "purchase_invoice_detail"
  ADD CONSTRAINT "purchase_invoice_detail_bonus_quantity_non_negative"
  CHECK ("bonus_quantity" >= 0);
