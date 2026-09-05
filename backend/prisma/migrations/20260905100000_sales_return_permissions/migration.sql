INSERT INTO "permission" ("permission_code", "permission_name", "module", "action", "is_active")
VALUES
  ('CUSTOMER_FINANCIAL_VIEW', 'Lihat Piutang Customer', 'SALES', 'VIEW', true),
  ('SALES_RETURN_VIEW', 'Lihat Sales Return', 'SALES', 'VIEW', true),
  ('SALES_RETURN_CREATE', 'Buat Sales Return', 'SALES', 'CREATE', true),
  ('SALES_RETURN_COMPLETE', 'Selesaikan Sales Return', 'SALES', 'APPROVE', true)
ON CONFLICT ("permission_code") DO UPDATE SET
  "permission_name" = EXCLUDED."permission_name",
  "module" = EXCLUDED."module",
  "action" = EXCLUDED."action",
  "is_active" = true;

INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT r."role_id", p."permission_id"
FROM "role" r
CROSS JOIN "permission" p
WHERE r."role_code" IN ('SUPER_OWNER', 'OWNER')
  AND p."permission_code" IN ('CUSTOMER_FINANCIAL_VIEW', 'SALES_RETURN_VIEW', 'SALES_RETURN_CREATE', 'SALES_RETURN_COMPLETE')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
