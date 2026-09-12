-- Accounts required by the manual finance categories. Additive and idempotent.
INSERT INTO "chart_of_account"
  ("account_code", "account_name", "account_type", "normal_balance", "cash_flow_category")
VALUES
  ('1401', 'Perlengkapan dan Aset Operasional', 'ASSET', 'DEBIT', 'INVESTING'),
  ('2102', 'Utang Pinjaman', 'LIABILITY', 'CREDIT', 'FINANCING'),
  ('4202', 'Selisih Kas Lebih', 'REVENUE', 'CREDIT', 'OPERATING')
ON CONFLICT ("account_code") DO NOTHING;
