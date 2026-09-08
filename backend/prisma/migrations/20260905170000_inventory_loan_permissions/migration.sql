INSERT INTO "permission" ("permission_code", "permission_name", "module", "action", "is_active", "created_at")
VALUES
  ('INVENTORY_LOAN_VIEW', 'Lihat Inventory Loan', 'INVENTORY', 'VIEW', true, CURRENT_TIMESTAMP),
  ('INVENTORY_LOAN_CREATE', 'Buat Inventory Loan', 'INVENTORY', 'CREATE', true, CURRENT_TIMESTAMP),
  ('INVENTORY_LOAN_UPDATE', 'Ubah dan Batalkan Draft Inventory Loan', 'INVENTORY', 'UPDATE', true, CURRENT_TIMESTAMP),
  ('INVENTORY_LOAN_ACTIVATE', 'Aktifkan Inventory Loan', 'INVENTORY', 'APPROVE', true, CURRENT_TIMESTAMP),
  ('INVENTORY_LOAN_RESOLVE', 'Selesaikan Inventory Loan', 'INVENTORY', 'APPROVE', true, CURRENT_TIMESTAMP)
ON CONFLICT ("permission_code") DO UPDATE SET
  "permission_name" = EXCLUDED."permission_name",
  "module" = EXCLUDED."module",
  "action" = EXCLUDED."action",
  "is_active" = true;
