-- Additive finance foundation. Existing balances and transactions are preserved.
CREATE TABLE "chart_of_account" (
    "chart_account_id" BIGSERIAL NOT NULL,
    "account_code" VARCHAR(20) NOT NULL,
    "account_name" VARCHAR(120) NOT NULL,
    "account_type" VARCHAR(20) NOT NULL,
    "normal_balance" VARCHAR(10) NOT NULL,
    "cash_flow_category" VARCHAR(20),
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chart_of_account_pkey" PRIMARY KEY ("chart_account_id")
);

CREATE UNIQUE INDEX "chart_of_account_account_code_key" ON "chart_of_account"("account_code");
CREATE INDEX "chart_of_account_account_type_is_active_idx" ON "chart_of_account"("account_type", "is_active");

INSERT INTO "chart_of_account" ("account_code", "account_name", "account_type", "normal_balance", "cash_flow_category") VALUES
('1101', 'Kas di Tangan', 'ASSET', 'DEBIT', 'OPERATING'),
('1102', 'Bank', 'ASSET', 'DEBIT', 'OPERATING'),
('1201', 'Piutang Usaha', 'ASSET', 'DEBIT', 'OPERATING'),
('1301', 'Persediaan Barang', 'ASSET', 'DEBIT', 'OPERATING'),
('1391', 'Piutang Refund Supplier', 'ASSET', 'DEBIT', 'OPERATING'),
('2101', 'Utang Usaha', 'LIABILITY', 'CREDIT', 'OPERATING'),
('2201', 'Uang Muka Customer', 'LIABILITY', 'CREDIT', 'OPERATING'),
('3101', 'Modal Pemilik', 'EQUITY', 'CREDIT', 'FINANCING'),
('4101', 'Penjualan', 'REVENUE', 'CREDIT', 'OPERATING'),
('4191', 'Retur Penjualan', 'REVENUE', 'DEBIT', 'OPERATING'),
('4201', 'Pendapatan Lain-lain', 'REVENUE', 'CREDIT', 'OPERATING'),
('5101', 'Harga Pokok Penjualan', 'COGS', 'DEBIT', 'OPERATING'),
('6101', 'Beban Gaji', 'EXPENSE', 'DEBIT', 'OPERATING'),
('6102', 'Beban Listrik', 'EXPENSE', 'DEBIT', 'OPERATING'),
('6103', 'Beban Air', 'EXPENSE', 'DEBIT', 'OPERATING'),
('6104', 'Beban Internet', 'EXPENSE', 'DEBIT', 'OPERATING'),
('6105', 'Beban Transportasi', 'EXPENSE', 'DEBIT', 'OPERATING'),
('6106', 'Beban Pajak', 'EXPENSE', 'DEBIT', 'OPERATING'),
('6199', 'Beban Operasional Lainnya', 'EXPENSE', 'DEBIT', 'OPERATING'),
('6901', 'Selisih Kas', 'EXPENSE', 'DEBIT', 'OPERATING');

ALTER TABLE "financial_account" ADD COLUMN "chart_account_id" BIGINT;
UPDATE "financial_account" SET "chart_account_id" = CASE
  WHEN UPPER("account_type") = 'CASH' THEN (SELECT "chart_account_id" FROM "chart_of_account" WHERE "account_code" = '1101')
  ELSE (SELECT "chart_account_id" FROM "chart_of_account" WHERE "account_code" = '1102')
END;
CREATE INDEX "financial_account_chart_account_id_idx" ON "financial_account"("chart_account_id");
ALTER TABLE "financial_account" ADD CONSTRAINT "financial_account_chart_account_id_fkey" FOREIGN KEY ("chart_account_id") REFERENCES "chart_of_account"("chart_account_id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "financial_account_transaction"
  ADD COLUMN "description" VARCHAR(255),
  ADD COLUMN "source_module" VARCHAR(50) NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN "reference_number" VARCHAR(50),
  ADD COLUMN "balance_before" DECIMAL(18,2),
  ADD COLUMN "balance_after" DECIMAL(18,2),
  ADD COLUMN "status" VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
  ADD COLUMN "transaction_group_id" VARCHAR(36),
  ADD COLUMN "counter_chart_account_id" BIGINT,
  ADD COLUMN "reversal_of_id" BIGINT,
  ADD COLUMN "voided_at" TIMESTAMP(3),
  ADD COLUMN "voided_by" BIGINT,
  ADD COLUMN "void_reason" VARCHAR(255);
ALTER TABLE "financial_account_transaction" ALTER COLUMN "reference_id" DROP NOT NULL;

CREATE UNIQUE INDEX "financial_account_transaction_reversal_of_id_key" ON "financial_account_transaction"("reversal_of_id");
CREATE INDEX "financial_account_transaction_financial_account_id_transaction_date_financial_account_transaction_id_idx" ON "financial_account_transaction"("financial_account_id", "transaction_date", "financial_account_transaction_id");
CREATE INDEX "financial_account_transaction_source_module_reference_number_idx" ON "financial_account_transaction"("source_module", "reference_number");
CREATE INDEX "financial_account_transaction_status_idx" ON "financial_account_transaction"("status");
CREATE INDEX "financial_account_transaction_transaction_group_id_idx" ON "financial_account_transaction"("transaction_group_id");
CREATE INDEX "financial_account_transaction_counter_chart_account_id_idx" ON "financial_account_transaction"("counter_chart_account_id");
ALTER TABLE "financial_account_transaction" ADD CONSTRAINT "financial_account_transaction_counter_chart_account_id_fkey" FOREIGN KEY ("counter_chart_account_id") REFERENCES "chart_of_account"("chart_account_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "financial_account_transaction" ADD CONSTRAINT "financial_account_transaction_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "financial_account_transaction"("financial_account_transaction_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_invoice_payment" ADD COLUMN "financial_account_transaction_id" BIGINT;
CREATE UNIQUE INDEX "purchase_invoice_payment_financial_account_transaction_id_key" ON "purchase_invoice_payment"("financial_account_transaction_id");
ALTER TABLE "purchase_invoice_payment" ADD CONSTRAINT "purchase_invoice_payment_financial_account_transaction_id_fkey" FOREIGN KEY ("financial_account_transaction_id") REFERENCES "financial_account_transaction"("financial_account_transaction_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_return" ADD COLUMN "financial_account_transaction_id" BIGINT;
CREATE UNIQUE INDEX "purchase_return_financial_account_transaction_id_key" ON "purchase_return"("financial_account_transaction_id");
ALTER TABLE "purchase_return" ADD CONSTRAINT "purchase_return_financial_account_transaction_id_fkey" FOREIGN KEY ("financial_account_transaction_id") REFERENCES "financial_account_transaction"("financial_account_transaction_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "journal_entry" (
    "journal_entry_id" BIGSERIAL NOT NULL,
    "journal_number" VARCHAR(30) NOT NULL,
    "posting_key" VARCHAR(150) NOT NULL,
    "transaction_date" TIMESTAMP(3) NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "source_type" VARCHAR(50) NOT NULL,
    "source_id" BIGINT,
    "source_number" VARCHAR(50),
    "financial_account_transaction_id" BIGINT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'POSTED',
    "reversed_at" TIMESTAMP(3),
    "reversed_by" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT NOT NULL,
    CONSTRAINT "journal_entry_pkey" PRIMARY KEY ("journal_entry_id")
);
CREATE UNIQUE INDEX "journal_entry_journal_number_key" ON "journal_entry"("journal_number");
CREATE UNIQUE INDEX "journal_entry_posting_key_key" ON "journal_entry"("posting_key");
CREATE UNIQUE INDEX "journal_entry_financial_account_transaction_id_key" ON "journal_entry"("financial_account_transaction_id");
CREATE INDEX "journal_entry_transaction_date_idx" ON "journal_entry"("transaction_date");
CREATE INDEX "journal_entry_source_type_source_id_idx" ON "journal_entry"("source_type", "source_id");
CREATE INDEX "journal_entry_status_idx" ON "journal_entry"("status");
ALTER TABLE "journal_entry" ADD CONSTRAINT "journal_entry_financial_account_transaction_id_fkey" FOREIGN KEY ("financial_account_transaction_id") REFERENCES "financial_account_transaction"("financial_account_transaction_id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "journal_entry_line" (
    "journal_entry_line_id" BIGSERIAL NOT NULL,
    "journal_entry_id" BIGINT NOT NULL,
    "chart_account_id" BIGINT NOT NULL,
    "debit_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "credit_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "description" VARCHAR(255),
    CONSTRAINT "journal_entry_line_pkey" PRIMARY KEY ("journal_entry_line_id"),
    CONSTRAINT "journal_entry_line_non_negative" CHECK ("debit_amount" >= 0 AND "credit_amount" >= 0),
    CONSTRAINT "journal_entry_line_one_side" CHECK (("debit_amount" > 0 AND "credit_amount" = 0) OR ("credit_amount" > 0 AND "debit_amount" = 0))
);
CREATE INDEX "journal_entry_line_journal_entry_id_idx" ON "journal_entry_line"("journal_entry_id");
CREATE INDEX "journal_entry_line_chart_account_id_idx" ON "journal_entry_line"("chart_account_id");
ALTER TABLE "journal_entry_line" ADD CONSTRAINT "journal_entry_line_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entry"("journal_entry_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "journal_entry_line" ADD CONSTRAINT "journal_entry_line_chart_account_id_fkey" FOREIGN KEY ("chart_account_id") REFERENCES "chart_of_account"("chart_account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "financial_daily_summary" (
    "financial_daily_summary_id" BIGSERIAL NOT NULL,
    "financial_account_id" BIGINT NOT NULL,
    "summary_date" DATE NOT NULL,
    "total_in" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_out" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "transaction_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "financial_daily_summary_pkey" PRIMARY KEY ("financial_daily_summary_id")
);
CREATE UNIQUE INDEX "financial_daily_summary_financial_account_id_summary_date_key" ON "financial_daily_summary"("financial_account_id", "summary_date");
CREATE INDEX "financial_daily_summary_summary_date_idx" ON "financial_daily_summary"("summary_date");
ALTER TABLE "financial_daily_summary" ADD CONSTRAINT "financial_daily_summary_financial_account_id_fkey" FOREIGN KEY ("financial_account_id") REFERENCES "financial_account"("financial_account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "financial_daily_summary" ("financial_account_id", "summary_date", "total_in", "total_out", "transaction_count", "updated_at")
SELECT "financial_account_id", "transaction_date"::date,
       COALESCE(SUM(CASE WHEN "direction" = 'IN' THEN "amount" ELSE 0 END), 0),
       COALESCE(SUM(CASE WHEN "direction" = 'OUT' THEN "amount" ELSE 0 END), 0),
       COUNT(*)::integer, CURRENT_TIMESTAMP
FROM "financial_account_transaction"
GROUP BY "financial_account_id", "transaction_date"::date;
