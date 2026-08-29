-- FR-SYS-005/006/007 metadata. Nullable columns preserve existing logs.
ALTER TABLE "activity_log"
ADD COLUMN IF NOT EXISTS "module" VARCHAR(50);

ALTER TABLE "audit_log"
ADD COLUMN IF NOT EXISTS "transaction_id" VARCHAR(50),
ADD COLUMN IF NOT EXISTS "module" VARCHAR(50),
ADD COLUMN IF NOT EXISTS "source" VARCHAR(150);

ALTER TABLE "security_log"
ADD COLUMN IF NOT EXISTS "description" VARCHAR(500),
ADD COLUMN IF NOT EXISTS "reference" VARCHAR(100);

CREATE INDEX IF NOT EXISTS "activity_log_module_activity_type_created_at_idx"
ON "activity_log"("module", "activity_type", "created_at");
CREATE INDEX IF NOT EXISTS "audit_log_transaction_id_idx"
ON "audit_log"("transaction_id");
CREATE INDEX IF NOT EXISTS "audit_log_module_created_at_idx"
ON "audit_log"("module", "created_at");
CREATE INDEX IF NOT EXISTS "security_log_event_type_created_at_idx"
ON "security_log"("event_type", "created_at");
CREATE INDEX IF NOT EXISTS "security_log_ip_address_created_at_idx"
ON "security_log"("ip_address", "created_at");
