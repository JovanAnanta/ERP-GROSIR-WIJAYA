-- Repair dashboard trigger functions without changing source transaction data.
-- SalesInvoice.invoice_date is TIMESTAMP while dashboard summaries are DATE-based.
CREATE OR REPLACE FUNCTION dashboard_touch_date(p_date TIMESTAMP WITHOUT TIME ZONE)
RETURNS VOID AS $$
BEGIN
  PERFORM dashboard_touch_date(p_date::DATE);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION dashboard_touch_date(p_date TIMESTAMP WITH TIME ZONE)
RETURNS VOID AS $$
BEGIN
  PERFORM dashboard_touch_date(p_date::DATE);
END;
$$ LANGUAGE plpgsql;

-- Avoid ambiguity between the PL/pgSQL variable and chart_of_account.account_code.
CREATE OR REPLACE FUNCTION dashboard_touch_journal_summary() RETURNS TRIGGER AS $$
DECLARE v_account_code VARCHAR(20);
BEGIN
  SELECT coa."account_code"
    INTO v_account_code
    FROM "chart_of_account" coa
   WHERE coa."chart_account_id" = COALESCE(NEW."chart_account_id", OLD."chart_account_id");

  IF v_account_code = '5101' THEN
    IF TG_OP <> 'INSERT' THEN PERFORM dashboard_touch_date(OLD."summary_date"); END IF;
    IF TG_OP <> 'DELETE' THEN PERFORM dashboard_touch_date(NEW."summary_date"); END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Opening receivables are balance-sheet entries, not sales performance.
CREATE OR REPLACE FUNCTION dashboard_refresh_date(p_date DATE) RETURNS VOID AS $$
BEGIN
  INSERT INTO "dashboard_daily_summary" (
    "summary_date", "invoice_count", "gross_sales", "discount_total",
    "sales_return_total", "net_sales", "cost_of_goods_sold", "gross_profit", "updated_at"
  )
  WITH sales AS (
    SELECT COUNT(*)::integer AS invoice_count,
      COALESCE(SUM("invoice_total" + "discount_amount" + "item_discount_total"), 0) AS gross_sales,
      COALESCE(SUM("discount_amount" + "item_discount_total"), 0) AS discount_total,
      COALESCE(SUM("invoice_total"), 0) AS net_before_return
    FROM "sales_invoice"
    WHERE "status" = 'COMPLETED'
      AND "document_type" = 'STANDARD'
      AND "invoice_date"::DATE = p_date
  ), returns AS (
    SELECT COALESCE(SUM("return_total"), 0) AS return_total
    FROM "sales_return"
    WHERE "status" = 'COMPLETED' AND "return_date" = p_date
  ), cogs AS (
    SELECT COALESCE(SUM(jads."total_debit" - jads."total_credit"), 0) AS amount
    FROM "journal_account_daily_summary" jads
    JOIN "chart_of_account" coa ON coa."chart_account_id" = jads."chart_account_id"
    WHERE jads."summary_date" = p_date AND coa."account_code" = '5101'
  )
  SELECT p_date, sales.invoice_count, sales.gross_sales, sales.discount_total,
    returns.return_total,
    sales.net_before_return - returns.return_total,
    cogs.amount,
    (sales.net_before_return - returns.return_total) - cogs.amount,
    CURRENT_TIMESTAMP
  FROM sales, returns, cogs
  ON CONFLICT ("summary_date") DO UPDATE SET
    "invoice_count" = EXCLUDED."invoice_count",
    "gross_sales" = EXCLUDED."gross_sales",
    "discount_total" = EXCLUDED."discount_total",
    "sales_return_total" = EXCLUDED."sales_return_total",
    "net_sales" = EXCLUDED."net_sales",
    "cost_of_goods_sold" = EXCLUDED."cost_of_goods_sold",
    "gross_profit" = EXCLUDED."gross_profit",
    "updated_at" = CURRENT_TIMESTAMP;

  DELETE FROM "dashboard_product_daily_summary" WHERE "summary_date" = p_date;

  INSERT INTO "dashboard_product_daily_summary" (
    "summary_date", "product_id", "sold_quantity", "bonus_quantity",
    "returned_quantity", "net_sales", "cost_of_goods_sold", "gross_profit", "updated_at"
  )
  WITH invoice_totals AS (
    SELECT sid."sales_invoice_id", COALESCE(SUM(sid."subtotal"), 0) AS detail_total
    FROM "sales_invoice_detail" sid
    JOIN "sales_invoice" si ON si."sales_invoice_id" = sid."sales_invoice_id"
    WHERE si."status" = 'COMPLETED'
      AND si."document_type" = 'STANDARD'
      AND si."invoice_date"::DATE = p_date
    GROUP BY sid."sales_invoice_id"
  ), sold AS (
    SELECT pu."product_id",
      SUM(sid."quantity" * pu."conversion_factor" / COALESCE(parent."conversion_factor", pu."conversion_factor")) AS sold_qty,
      SUM(sid."bonus_quantity" * pu."conversion_factor" / COALESCE(parent."conversion_factor", pu."conversion_factor")) AS bonus_qty,
      SUM(CASE WHEN it.detail_total = 0 THEN 0 ELSE sid."subtotal" * si."invoice_total" / it.detail_total END) AS net_sales,
      SUM(COALESCE(cost.total_cost, 0)) AS cogs
    FROM "sales_invoice_detail" sid
    JOIN "sales_invoice" si ON si."sales_invoice_id" = sid."sales_invoice_id"
    JOIN "product_unit" pu ON pu."product_unit_id" = sid."product_unit_id"
    LEFT JOIN "product_unit" parent ON parent."product_unit_id" = pu."parent_product_unit_id"
    JOIN invoice_totals it ON it."sales_invoice_id" = si."sales_invoice_id"
    LEFT JOIN LATERAL (
      SELECT SUM(flt."total_cost") AS total_cost
      FROM "inventory_movement" im
      JOIN "fifo_layer_transaction" flt ON flt."inventory_movement_id" = im."inventory_movement_id" AND flt."direction" = 'OUT'
      WHERE im."sales_invoice_detail_id" = sid."sales_invoice_detail_id"
    ) cost ON TRUE
    WHERE si."status" = 'COMPLETED'
      AND si."document_type" = 'STANDARD'
      AND si."invoice_date"::DATE = p_date
    GROUP BY pu."product_id"
  ), returned AS (
    SELECT pu."product_id",
      SUM((srd."quantity" + srd."bonus_quantity") * pu."conversion_factor" / COALESCE(parent."conversion_factor", pu."conversion_factor")) AS returned_qty,
      SUM(srd."subtotal") AS return_sales,
      SUM(srd."return_cost_total") AS return_cost
    FROM "sales_return_detail" srd
    JOIN "sales_return" sr ON sr."sales_return_id" = srd."sales_return_id"
    JOIN "product_unit" pu ON pu."product_unit_id" = srd."product_unit_id"
    LEFT JOIN "product_unit" parent ON parent."product_unit_id" = pu."parent_product_unit_id"
    WHERE sr."status" = 'COMPLETED' AND sr."return_date" = p_date
    GROUP BY pu."product_id"
  ), combined AS (
    SELECT COALESCE(sold."product_id", returned."product_id") AS product_id,
      COALESCE(sold.sold_qty, 0) AS sold_qty,
      COALESCE(sold.bonus_qty, 0) AS bonus_qty,
      COALESCE(returned.returned_qty, 0) AS returned_qty,
      COALESCE(sold.net_sales, 0) - COALESCE(returned.return_sales, 0) AS net_sales,
      COALESCE(sold.cogs, 0) - COALESCE(returned.return_cost, 0) AS cogs
    FROM sold FULL OUTER JOIN returned ON returned."product_id" = sold."product_id"
  )
  SELECT p_date, product_id, sold_qty, bonus_qty, returned_qty, net_sales, cogs,
    net_sales - cogs, CURRENT_TIMESTAMP
  FROM combined;

  DELETE FROM "dashboard_dirty_date" WHERE "summary_date" = p_date;
END;
$$ LANGUAGE plpgsql;
