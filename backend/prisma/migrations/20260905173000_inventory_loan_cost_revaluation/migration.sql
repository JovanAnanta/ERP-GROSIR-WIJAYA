ALTER TABLE "inventory_loan_resolution_detail"
  ADD COLUMN "inventory_revaluation_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "consumed_cost_adjustment_amount" DECIMAL(18,2) NOT NULL DEFAULT 0;
