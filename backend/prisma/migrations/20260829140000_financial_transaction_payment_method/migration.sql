-- Additive ledger metadata. Existing financial transactions remain valid.
ALTER TABLE "financial_account_transaction"
ADD COLUMN "payment_method" "PurchasePaymentMethod";
