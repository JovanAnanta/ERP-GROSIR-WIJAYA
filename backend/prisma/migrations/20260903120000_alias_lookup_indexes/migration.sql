-- Expression indexes enforce case/space-insensitive aliases without changing existing names.
-- The transaction aborts on existing collisions. No rows are deleted or corrected.
BEGIN;
CREATE UNIQUE INDEX "product_alias_normalized_key" ON "product_alias" ((lower(regexp_replace(btrim(alias_name), '[[:space:]]+', ' ', 'g'))));
CREATE UNIQUE INDEX "unit_alias_normalized_key" ON "unit_alias" ((lower(regexp_replace(btrim(alias_name), '[[:space:]]+', ' ', 'g'))));
CREATE INDEX "product_name_normalized_lookup_idx" ON "product" ((lower(regexp_replace(btrim(product_name), '[[:space:]]+', ' ', 'g'))));
CREATE INDEX "unit_name_normalized_lookup_idx" ON "unit" ((lower(regexp_replace(btrim(unit_name), '[[:space:]]+', ' ', 'g'))));
INSERT INTO "permission" ("permission_code", "permission_name", "module", "action", "is_active") VALUES
('SALES_IMPORT', 'Import Pesanan WhatsApp', 'SALES', 'IMPORT', TRUE),
('ALIAS_VIEW', 'Lihat Daftar Alias', 'PRICING', 'VIEW', TRUE),
('ALIAS_MANAGE', 'Tambah, Ubah dan Hapus Alias', 'PRICING', 'UPDATE', TRUE)
ON CONFLICT ("permission_code") DO NOTHING;
-- Existing Admin grants are preserved; the Owner configures the new permissions.
COMMIT;
