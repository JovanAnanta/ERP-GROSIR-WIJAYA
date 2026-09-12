-- Keep overdue and expected-arrival dashboard alerts index-backed on large tables.
CREATE INDEX IF NOT EXISTS "sales_invoice_status_due_outstanding_idx"
  ON "sales_invoice"("status", "due_date")
  WHERE "outstanding_amount" > 0;

CREATE INDEX IF NOT EXISTS "purchase_invoice_status_due_outstanding_idx"
  ON "purchase_invoice"("status", "due_date")
  WHERE "outstanding_amount" > 0;

CREATE INDEX IF NOT EXISTS "purchase_order_status_expected_date_idx"
  ON "purchase_order"("status", "expected_date");
