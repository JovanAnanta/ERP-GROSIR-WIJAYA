-- Dashboard analytics cache. Source documents and journals remain authoritative.
CREATE TABLE "dashboard_daily_summary" (
    "dashboard_daily_summary_id" BIGSERIAL NOT NULL,
    "summary_date" DATE NOT NULL,
    "invoice_count" INTEGER NOT NULL DEFAULT 0,
    "gross_sales" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discount_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sales_return_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "net_sales" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cost_of_goods_sold" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "gross_profit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dashboard_daily_summary_pkey" PRIMARY KEY ("dashboard_daily_summary_id")
);
CREATE UNIQUE INDEX "dashboard_daily_summary_summary_date_key" ON "dashboard_daily_summary"("summary_date");
CREATE INDEX "dashboard_daily_summary_summary_date_idx" ON "dashboard_daily_summary"("summary_date");

CREATE TABLE "dashboard_product_daily_summary" (
    "dashboard_product_daily_summary_id" BIGSERIAL NOT NULL,
    "summary_date" DATE NOT NULL,
    "product_id" BIGINT NOT NULL,
    "sold_quantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "bonus_quantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "returned_quantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "net_sales" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cost_of_goods_sold" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "gross_profit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dashboard_product_daily_summary_pkey" PRIMARY KEY ("dashboard_product_daily_summary_id")
);
CREATE UNIQUE INDEX "dashboard_product_daily_summary_summary_date_product_id_key" ON "dashboard_product_daily_summary"("summary_date", "product_id");
CREATE INDEX "dashboard_product_daily_summary_product_id_summary_date_idx" ON "dashboard_product_daily_summary"("product_id", "summary_date");
CREATE INDEX "dashboard_product_daily_summary_summary_date_net_sales_idx" ON "dashboard_product_daily_summary"("summary_date", "net_sales");
ALTER TABLE "dashboard_product_daily_summary" ADD CONSTRAINT "dashboard_product_daily_summary_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "dashboard_dirty_date" (
    "summary_date" DATE NOT NULL,
    "touched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dashboard_dirty_date_pkey" PRIMARY KEY ("summary_date")
);
CREATE INDEX "dashboard_dirty_date_touched_at_idx" ON "dashboard_dirty_date"("touched_at");

CREATE OR REPLACE FUNCTION dashboard_touch_date(p_date DATE) RETURNS VOID AS $$
BEGIN
  IF p_date IS NOT NULL THEN
    INSERT INTO "dashboard_dirty_date" ("summary_date", "touched_at")
    VALUES (p_date, CURRENT_TIMESTAMP)
    ON CONFLICT ("summary_date") DO UPDATE SET "touched_at" = EXCLUDED."touched_at";
  END IF;
END;
$$ LANGUAGE plpgsql;

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
    WHERE "status" = 'COMPLETED' AND "invoice_date" = p_date
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
    WHERE si."status" = 'COMPLETED' AND si."invoice_date" = p_date
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
    WHERE si."status" = 'COMPLETED' AND si."invoice_date" = p_date
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

CREATE OR REPLACE FUNCTION dashboard_touch_sales_invoice() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN PERFORM dashboard_touch_date(OLD."invoice_date"); END IF;
  IF TG_OP <> 'DELETE' THEN PERFORM dashboard_touch_date(NEW."invoice_date"); END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION dashboard_touch_sales_invoice_detail() RETURNS TRIGGER AS $$
DECLARE old_date DATE; new_date DATE;
BEGIN
  IF TG_OP <> 'INSERT' THEN SELECT "invoice_date" INTO old_date FROM "sales_invoice" WHERE "sales_invoice_id" = OLD."sales_invoice_id"; PERFORM dashboard_touch_date(old_date); END IF;
  IF TG_OP <> 'DELETE' THEN SELECT "invoice_date" INTO new_date FROM "sales_invoice" WHERE "sales_invoice_id" = NEW."sales_invoice_id"; PERFORM dashboard_touch_date(new_date); END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION dashboard_touch_sales_return() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN PERFORM dashboard_touch_date(OLD."return_date"); END IF;
  IF TG_OP <> 'DELETE' THEN PERFORM dashboard_touch_date(NEW."return_date"); END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION dashboard_touch_sales_return_detail() RETURNS TRIGGER AS $$
DECLARE old_date DATE; new_date DATE;
BEGIN
  IF TG_OP <> 'INSERT' THEN SELECT "return_date" INTO old_date FROM "sales_return" WHERE "sales_return_id" = OLD."sales_return_id"; PERFORM dashboard_touch_date(old_date); END IF;
  IF TG_OP <> 'DELETE' THEN SELECT "return_date" INTO new_date FROM "sales_return" WHERE "sales_return_id" = NEW."sales_return_id"; PERFORM dashboard_touch_date(new_date); END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION dashboard_touch_journal_summary() RETURNS TRIGGER AS $$
DECLARE account_code VARCHAR(20);
BEGIN
  SELECT "account_code" INTO account_code FROM "chart_of_account" WHERE "chart_account_id" = COALESCE(NEW."chart_account_id", OLD."chart_account_id");
  IF account_code = '5101' THEN
    IF TG_OP <> 'INSERT' THEN PERFORM dashboard_touch_date(OLD."summary_date"); END IF;
    IF TG_OP <> 'DELETE' THEN PERFORM dashboard_touch_date(NEW."summary_date"); END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER dashboard_sales_invoice_dirty AFTER INSERT OR UPDATE OR DELETE ON "sales_invoice" FOR EACH ROW EXECUTE FUNCTION dashboard_touch_sales_invoice();
CREATE TRIGGER dashboard_sales_invoice_detail_dirty AFTER INSERT OR UPDATE OR DELETE ON "sales_invoice_detail" FOR EACH ROW EXECUTE FUNCTION dashboard_touch_sales_invoice_detail();
CREATE TRIGGER dashboard_sales_return_dirty AFTER INSERT OR UPDATE OR DELETE ON "sales_return" FOR EACH ROW EXECUTE FUNCTION dashboard_touch_sales_return();
CREATE TRIGGER dashboard_sales_return_detail_dirty AFTER INSERT OR UPDATE OR DELETE ON "sales_return_detail" FOR EACH ROW EXECUTE FUNCTION dashboard_touch_sales_return_detail();
CREATE TRIGGER dashboard_journal_summary_dirty AFTER INSERT OR UPDATE OR DELETE ON "journal_account_daily_summary" FOR EACH ROW EXECUTE FUNCTION dashboard_touch_journal_summary();

INSERT INTO "dashboard_dirty_date" ("summary_date")
SELECT DISTINCT summary_date FROM (
  SELECT "invoice_date" AS summary_date FROM "sales_invoice"
  UNION SELECT "return_date" FROM "sales_return"
  UNION SELECT "summary_date" FROM "journal_account_daily_summary"
) dates
WHERE summary_date IS NOT NULL
ON CONFLICT ("summary_date") DO NOTHING;
