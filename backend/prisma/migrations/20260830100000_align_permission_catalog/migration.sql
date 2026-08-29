-- FR-SYS-003: canonical module/action permission catalog.
-- Existing business data is untouched. Legacy permission rows are retained as inactive.
INSERT INTO "permission" ("permission_code", "permission_name", "module", "action", "is_active")
VALUES
  ('DASHBOARD_VIEW', 'Lihat Dashboard', 'DASHBOARD', 'VIEW', TRUE),
  ('MASTER_VIEW', 'Lihat Master Data', 'MASTER', 'VIEW', TRUE),
  ('MASTER_CREATE', 'Tambah Master Data', 'MASTER', 'CREATE', TRUE),
  ('MASTER_UPDATE', 'Ubah dan Aktif/Nonaktif Master Data', 'MASTER', 'UPDATE', TRUE),
  ('MASTER_EXPORT', 'Export Master Data', 'MASTER', 'EXPORT', TRUE),
  ('PURCHASE_VIEW', 'Lihat Purchasing', 'PURCHASE', 'VIEW', TRUE),
  ('PURCHASE_CREATE', 'Buat Transaksi Purchasing', 'PURCHASE', 'CREATE', TRUE),
  ('PURCHASE_UPDATE', 'Ubah dan Bayar Transaksi Purchasing', 'PURCHASE', 'UPDATE', TRUE),
  ('PURCHASE_APPROVE', 'Proses Status dan Penyelesaian Purchasing', 'PURCHASE', 'APPROVE', TRUE),
  ('PURCHASE_EXPORT', 'Export Purchasing', 'PURCHASE', 'EXPORT', TRUE),
  ('SALES_VIEW', 'Lihat Sales dan Customer', 'SALES', 'VIEW', TRUE),
  ('SALES_CREATE', 'Buat Sales dan Customer', 'SALES', 'CREATE', TRUE),
  ('SALES_UPDATE', 'Ubah Sales dan Customer', 'SALES', 'UPDATE', TRUE),
  ('SALES_APPROVE', 'Approve Sales', 'SALES', 'APPROVE', TRUE),
  ('SALES_EXPORT', 'Export Sales', 'SALES', 'EXPORT', TRUE),
  ('PRICING_VIEW', 'Lihat Pricing', 'PRICING', 'VIEW', TRUE),
  ('PRICING_UPDATE', 'Ubah Pricing', 'PRICING', 'UPDATE', TRUE),
  ('PRICING_EXPORT', 'Publish dan Export Pricing', 'PRICING', 'EXPORT', TRUE),
  ('INVENTORY_VIEW', 'Lihat Inventory', 'INVENTORY', 'VIEW', TRUE),
  ('INVENTORY_CREATE', 'Buat Transaksi Inventory', 'INVENTORY', 'CREATE', TRUE),
  ('INVENTORY_UPDATE', 'Ubah Inventory', 'INVENTORY', 'UPDATE', TRUE),
  ('INVENTORY_APPROVE', 'Approve Inventory', 'INVENTORY', 'APPROVE', TRUE),
  ('FIFO_VIEW', 'Lihat FIFO', 'FIFO', 'VIEW', TRUE),
  ('FINANCIAL_VIEW', 'Lihat Financial', 'FINANCIAL', 'VIEW', TRUE),
  ('REPORT_VIEW', 'Lihat Report', 'REPORT', 'VIEW', TRUE),
  ('REPORT_EXPORT', 'Export Report', 'REPORT', 'EXPORT', TRUE)
ON CONFLICT ("permission_code") DO UPDATE SET
  "permission_name" = EXCLUDED."permission_name",
  "module" = EXCLUDED."module",
  "action" = EXCLUDED."action",
  "is_active" = TRUE;

-- Preserve configured Admin access by translating legacy entity-level mappings.
WITH legacy_map("legacy_code", "canonical_code") AS (
  VALUES
    ('CATEGORY_VIEW', 'MASTER_VIEW'), ('BRAND_VIEW', 'MASTER_VIEW'),
    ('UNIT_VIEW', 'MASTER_VIEW'), ('PRODUCT_VIEW', 'MASTER_VIEW'),
    ('CATEGORY_CREATE', 'MASTER_CREATE'), ('BRAND_CREATE', 'MASTER_CREATE'),
    ('UNIT_CREATE', 'MASTER_CREATE'), ('PRODUCT_CREATE', 'MASTER_CREATE'),
    ('CATEGORY_UPDATE', 'MASTER_UPDATE'), ('BRAND_UPDATE', 'MASTER_UPDATE'),
    ('UNIT_UPDATE', 'MASTER_UPDATE'), ('PRODUCT_UPDATE', 'MASTER_UPDATE'),
    ('CATEGORY_INACTIVATE', 'MASTER_UPDATE'), ('BRAND_INACTIVATE', 'MASTER_UPDATE'),
    ('UNIT_INACTIVATE', 'MASTER_UPDATE'), ('PRODUCT_INACTIVATE', 'MASTER_UPDATE'),
    ('CATEGORY_REACTIVATE', 'MASTER_UPDATE'), ('BRAND_REACTIVATE', 'MASTER_UPDATE'),
    ('UNIT_REACTIVATE', 'MASTER_UPDATE'), ('PRODUCT_REACTIVATE', 'MASTER_UPDATE'),
    ('SUPPLIER_VIEW', 'PURCHASE_VIEW'), ('PURCHASE_ORDER_VIEW', 'PURCHASE_VIEW'),
    ('PURCHASE_INVOICE_VIEW', 'PURCHASE_VIEW'),
    ('SUPPLIER_CREATE', 'PURCHASE_CREATE'), ('PURCHASE_ORDER_CREATE', 'PURCHASE_CREATE'),
    ('PURCHASE_INVOICE_CREATE', 'PURCHASE_CREATE'),
    ('SUPPLIER_UPDATE', 'PURCHASE_UPDATE'), ('SUPPLIER_INACTIVATE', 'PURCHASE_UPDATE'),
    ('SUPPLIER_REACTIVATE', 'PURCHASE_UPDATE'), ('PURCHASE_ORDER_CREATE', 'PURCHASE_UPDATE'),
    ('PURCHASE_INVOICE_CREATE', 'PURCHASE_UPDATE'),
    ('CUSTOMER_VIEW', 'SALES_VIEW'), ('CUSTOMER_CREATE', 'SALES_CREATE'),
    ('CUSTOMER_UPDATE', 'SALES_UPDATE'), ('CUSTOMER_INACTIVATE', 'SALES_UPDATE'),
    ('CUSTOMER_REACTIVATE', 'SALES_UPDATE')
)
INSERT INTO "role_permission" ("role_id", "permission_id", "created_by")
SELECT rp."role_id", canonical."permission_id", rp."created_by"
FROM "role_permission" rp
JOIN "permission" legacy ON legacy."permission_id" = rp."permission_id"
JOIN legacy_map mapping ON mapping."legacy_code" = legacy."permission_code"
JOIN "permission" canonical ON canonical."permission_code" = mapping."canonical_code"
JOIN "role" role_row ON role_row."role_id" = rp."role_id" AND role_row."role_code" = 'ADMIN'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

-- A fresh installation previously had no Admin mappings while the unregistered guard
-- allowed the visible operational workflow. Preserve that visible baseline once.
INSERT INTO "role_permission" ("role_id", "permission_id", "created_by")
SELECT admin_role."role_id", permission_row."permission_id", NULL
FROM "role" admin_role
JOIN "permission" permission_row ON permission_row."permission_code" IN (
  'DASHBOARD_VIEW', 'MASTER_VIEW', 'SALES_VIEW', 'PURCHASE_VIEW',
  'PURCHASE_CREATE', 'PURCHASE_UPDATE', 'PURCHASE_APPROVE', 'PRICING_VIEW'
)
WHERE admin_role."role_code" = 'ADMIN'
  AND NOT EXISTS (
    SELECT 1
    FROM "role_permission" existing
    JOIN "permission" existing_permission
      ON existing_permission."permission_id" = existing."permission_id"
    WHERE existing."role_id" = admin_role."role_id"
      AND existing_permission."is_active" = TRUE
  )
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

UPDATE "permission"
SET "is_active" = FALSE
WHERE "permission_code" IN (
  'CATEGORY_VIEW', 'CATEGORY_CREATE', 'CATEGORY_UPDATE', 'CATEGORY_INACTIVATE', 'CATEGORY_REACTIVATE',
  'BRAND_VIEW', 'BRAND_CREATE', 'BRAND_UPDATE', 'BRAND_INACTIVATE', 'BRAND_REACTIVATE',
  'UNIT_VIEW', 'UNIT_CREATE', 'UNIT_UPDATE', 'UNIT_INACTIVATE', 'UNIT_REACTIVATE',
  'PRODUCT_VIEW', 'PRODUCT_CREATE', 'PRODUCT_UPDATE', 'PRODUCT_INACTIVATE', 'PRODUCT_REACTIVATE',
  'SUPPLIER_VIEW', 'SUPPLIER_CREATE', 'SUPPLIER_UPDATE', 'SUPPLIER_INACTIVATE', 'SUPPLIER_REACTIVATE',
  'CUSTOMER_VIEW', 'CUSTOMER_CREATE', 'CUSTOMER_UPDATE', 'CUSTOMER_INACTIVATE', 'CUSTOMER_REACTIVATE',
  'PURCHASE_ORDER_VIEW', 'PURCHASE_ORDER_CREATE', 'PURCHASE_INVOICE_VIEW', 'PURCHASE_INVOICE_CREATE'
);
