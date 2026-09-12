-- Additive account-management support. Existing balances and transactions remain unchanged.
ALTER TABLE "financial_account"
  ADD COLUMN "is_default" BOOLEAN NOT NULL DEFAULT false;

-- Preserve the familiar KAS/BANK choices as defaults when they exist. Otherwise,
-- choose the oldest active account for each type.
WITH preferred AS (
  SELECT DISTINCT ON ("account_type")
    "financial_account_id"
  FROM "financial_account"
  WHERE "is_active" = true
  ORDER BY
    "account_type",
    CASE
      WHEN UPPER("account_name") = 'KAS' AND "account_type" = 'CASH' THEN 0
      WHEN UPPER("account_name") = 'BANK' AND "account_type" = 'BANK' THEN 0
      ELSE 1
    END,
    "financial_account_id"
)
UPDATE "financial_account" account
SET "is_default" = true
FROM preferred
WHERE account."financial_account_id" = preferred."financial_account_id";

CREATE UNIQUE INDEX "financial_account_one_active_default_per_type"
  ON "financial_account"("account_type")
  WHERE "is_default" = true AND "is_active" = true;
CREATE INDEX "financial_account_account_type_is_active_is_default_idx"
  ON "financial_account"("account_type", "is_active", "is_default");

INSERT INTO "chart_of_account"
  ("account_code", "account_name", "account_type", "normal_balance", "cash_flow_category")
VALUES
  ('3901', 'Saldo Awal', 'EQUITY', 'CREDIT', 'FINANCING')
ON CONFLICT ("account_code") DO NOTHING;

INSERT INTO "permission"
  ("permission_code", "permission_name", "module", "action", "is_active", "created_at")
VALUES
  ('FINANCIAL_ACCOUNT_MANAGE', 'Kelola Akun Kas & Bank', 'FINANCIAL', 'UPDATE', true, CURRENT_TIMESTAMP)
ON CONFLICT ("permission_code") DO UPDATE SET
  "permission_name" = EXCLUDED."permission_name",
  "module" = EXCLUDED."module",
  "action" = EXCLUDED."action",
  "is_active" = true;
