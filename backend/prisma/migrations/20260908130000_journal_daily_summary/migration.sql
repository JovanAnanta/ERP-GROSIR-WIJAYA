-- Additive journal rollup for long-range reports. Existing journals remain intact.
CREATE TABLE "journal_account_daily_summary" (
    "journal_account_daily_summary_id" BIGSERIAL NOT NULL,
    "chart_account_id" BIGINT NOT NULL,
    "summary_date" DATE NOT NULL,
    "total_debit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_credit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "entry_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "journal_account_daily_summary_pkey" PRIMARY KEY ("journal_account_daily_summary_id")
);

CREATE UNIQUE INDEX "journal_account_daily_summary_chart_account_id_summary_date_key"
  ON "journal_account_daily_summary"("chart_account_id", "summary_date");
CREATE INDEX "journal_account_daily_summary_summary_date_chart_account_id_idx"
  ON "journal_account_daily_summary"("summary_date", "chart_account_id");
ALTER TABLE "journal_account_daily_summary"
  ADD CONSTRAINT "journal_account_daily_summary_chart_account_id_fkey"
  FOREIGN KEY ("chart_account_id") REFERENCES "chart_of_account"("chart_account_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill once from existing immutable, posted journals. Future rows are maintained
-- transactionally by the application whenever a journal is posted.
INSERT INTO "journal_account_daily_summary"
  ("chart_account_id", "summary_date", "total_debit", "total_credit", "entry_count", "updated_at")
SELECT
  line."chart_account_id",
  entry."transaction_date"::date,
  SUM(line."debit_amount"),
  SUM(line."credit_amount"),
  COUNT(DISTINCT entry."journal_entry_id")::integer,
  CURRENT_TIMESTAMP
FROM "journal_entry" entry
JOIN "journal_entry_line" line
  ON line."journal_entry_id" = entry."journal_entry_id"
WHERE entry."status" = 'POSTED'
GROUP BY line."chart_account_id", entry."transaction_date"::date;

-- Support stable journal pagination and direct document tracing at scale.
CREATE INDEX "journal_entry_status_transaction_date_journal_entry_id_idx"
  ON "journal_entry"("status", "transaction_date", "journal_entry_id");
CREATE INDEX "journal_entry_source_type_source_number_idx"
  ON "journal_entry"("source_type", "source_number");
CREATE INDEX "journal_entry_line_chart_account_id_journal_entry_id_idx"
  ON "journal_entry_line"("chart_account_id", "journal_entry_id");
