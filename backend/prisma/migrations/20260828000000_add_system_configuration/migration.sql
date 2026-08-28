-- AddTable
-- Additive migration: preserves existing data and supports databases where the
-- table may already have been created with `prisma db push`.
CREATE TABLE IF NOT EXISTS "system_configuration" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "company_name" VARCHAR(150) NOT NULL,
    "address" TEXT NOT NULL,
    "phone" VARCHAR(50) NOT NULL,
    "logo_base64" TEXT,
    "receipt_header_1" VARCHAR(255),
    "receipt_header_2" VARCHAR(255),
    "receipt_header_3" VARCHAR(255),
    "receipt_footer_1" TEXT,
    "receipt_footer_2" TEXT,
    "receipt_footer_3" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" BIGINT,

    CONSTRAINT "system_configuration_pkey" PRIMARY KEY ("id")
);
