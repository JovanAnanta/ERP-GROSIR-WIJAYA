INSERT INTO "permission" ("permission_code", "permission_name", "module", "action", "is_active", "created_at") VALUES
('FINANCIAL_CREATE', 'Catat Kas Masuk & Keluar', 'FINANCIAL', 'CREATE', true, CURRENT_TIMESTAMP),
('FINANCIAL_TRANSFER', 'Transfer Antar Akun', 'FINANCIAL', 'CREATE', true, CURRENT_TIMESTAMP)
ON CONFLICT ("permission_code") DO UPDATE SET
  "permission_name" = EXCLUDED."permission_name",
  "module" = EXCLUDED."module",
  "action" = EXCLUDED."action",
  "is_active" = true;
