-- CreateTable
CREATE TABLE "category" (
    "category_id" BIGSERIAL NOT NULL,
    "category_name" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT NOT NULL,
    "updated_at" TIMESTAMP(3),
    "updated_by" BIGINT,

    CONSTRAINT "category_pkey" PRIMARY KEY ("category_id")
);

-- CreateTable
CREATE TABLE "brand" (
    "brand_id" BIGSERIAL NOT NULL,
    "brand_name" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT NOT NULL,
    "updated_at" TIMESTAMP(3),
    "updated_by" BIGINT,

    CONSTRAINT "brand_pkey" PRIMARY KEY ("brand_id")
);

-- CreateTable
CREATE TABLE "unit" (
    "unit_id" BIGSERIAL NOT NULL,
    "unit_name" VARCHAR(50) NOT NULL,
    "is_active" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT NOT NULL,
    "updated_at" TIMESTAMP(3),
    "updated_by" BIGINT,

    CONSTRAINT "unit_pkey" PRIMARY KEY ("unit_id")
);

-- CreateTable
CREATE TABLE "product" (
    "product_id" BIGSERIAL NOT NULL,
    "product_name" VARCHAR(255) NOT NULL,
    "category_id" BIGINT NOT NULL,
    "brand_id" BIGINT,
    "is_active" BOOLEAN NOT NULL,
    "minimum_inventory_qty" DECIMAL(18,3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT NOT NULL,
    "updated_at" TIMESTAMP(3),
    "updated_by" BIGINT,

    CONSTRAINT "product_pkey" PRIMARY KEY ("product_id")
);

-- CreateTable
CREATE TABLE "product_unit" (
    "product_unit_id" BIGSERIAL NOT NULL,
    "product_id" BIGINT NOT NULL,
    "unit_id" BIGINT NOT NULL,
    "conversion_factor" DECIMAL(18,6) NOT NULL,
    "display_order" INTEGER NOT NULL,
    "is_parent" BOOLEAN NOT NULL,
    "is_active" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT NOT NULL,
    "updated_at" TIMESTAMP(3),
    "updated_by" BIGINT,

    CONSTRAINT "product_unit_pkey" PRIMARY KEY ("product_unit_id")
);

-- CreateTable
CREATE TABLE "supplier" (
    "supplier_id" BIGSERIAL NOT NULL,
    "supplier_name" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(30),
    "email" VARCHAR(150),
    "address" TEXT,
    "pic_name" VARCHAR(150),
    "is_active" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT NOT NULL,
    "updated_at" TIMESTAMP(3),
    "updated_by" BIGINT,

    CONSTRAINT "supplier_pkey" PRIMARY KEY ("supplier_id")
);

-- CreateTable
CREATE TABLE "product_supplier" (
    "product_supplier_id" BIGSERIAL NOT NULL,
    "product_id" BIGINT NOT NULL,
    "supplier_id" BIGINT NOT NULL,
    "is_active" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT NOT NULL,
    "updated_at" TIMESTAMP(3),
    "updated_by" BIGINT,

    CONSTRAINT "product_supplier_pkey" PRIMARY KEY ("product_supplier_id")
);

-- CreateTable
CREATE TABLE "customer" (
    "customer_id" BIGSERIAL NOT NULL,
    "customer_name" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(30),
    "address" TEXT,
    "is_active" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT NOT NULL,
    "updated_at" TIMESTAMP(3),
    "updated_by" BIGINT,

    CONSTRAINT "customer_pkey" PRIMARY KEY ("customer_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "category_category_name_key" ON "category"("category_name");

-- CreateIndex
CREATE INDEX "category_created_by_idx" ON "category"("created_by");

-- CreateIndex
CREATE INDEX "category_updated_by_idx" ON "category"("updated_by");

-- CreateIndex
CREATE UNIQUE INDEX "brand_brand_name_key" ON "brand"("brand_name");

-- CreateIndex
CREATE INDEX "brand_created_by_idx" ON "brand"("created_by");

-- CreateIndex
CREATE INDEX "brand_updated_by_idx" ON "brand"("updated_by");

-- CreateIndex
CREATE UNIQUE INDEX "unit_unit_name_key" ON "unit"("unit_name");

-- CreateIndex
CREATE INDEX "unit_created_by_idx" ON "unit"("created_by");

-- CreateIndex
CREATE INDEX "unit_updated_by_idx" ON "unit"("updated_by");

-- CreateIndex
CREATE INDEX "product_category_id_idx" ON "product"("category_id");

-- CreateIndex
CREATE INDEX "product_brand_id_idx" ON "product"("brand_id");

-- CreateIndex
CREATE INDEX "product_created_by_idx" ON "product"("created_by");

-- CreateIndex
CREATE INDEX "product_updated_by_idx" ON "product"("updated_by");

-- CreateIndex
CREATE INDEX "product_unit_product_id_idx" ON "product_unit"("product_id");

-- CreateIndex
CREATE INDEX "product_unit_unit_id_idx" ON "product_unit"("unit_id");

-- CreateIndex
CREATE INDEX "product_unit_created_by_idx" ON "product_unit"("created_by");

-- CreateIndex
CREATE INDEX "product_unit_updated_by_idx" ON "product_unit"("updated_by");

-- CreateIndex
CREATE INDEX "supplier_created_by_idx" ON "supplier"("created_by");

-- CreateIndex
CREATE INDEX "supplier_updated_by_idx" ON "supplier"("updated_by");

-- CreateIndex
CREATE INDEX "product_supplier_product_id_idx" ON "product_supplier"("product_id");

-- CreateIndex
CREATE INDEX "product_supplier_supplier_id_idx" ON "product_supplier"("supplier_id");

-- CreateIndex
CREATE INDEX "product_supplier_created_by_idx" ON "product_supplier"("created_by");

-- CreateIndex
CREATE INDEX "product_supplier_updated_by_idx" ON "product_supplier"("updated_by");

-- CreateIndex
CREATE INDEX "customer_created_by_idx" ON "customer"("created_by");

-- CreateIndex
CREATE INDEX "customer_updated_by_idx" ON "customer"("updated_by");

-- AddForeignKey
ALTER TABLE "category" ADD CONSTRAINT "category_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category" ADD CONSTRAINT "category_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand" ADD CONSTRAINT "brand_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand" ADD CONSTRAINT "brand_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit" ADD CONSTRAINT "unit_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit" ADD CONSTRAINT "unit_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "category"("category_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brand"("brand_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_unit" ADD CONSTRAINT "product_unit_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_unit" ADD CONSTRAINT "product_unit_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "unit"("unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_unit" ADD CONSTRAINT "product_unit_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_unit" ADD CONSTRAINT "product_unit_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_supplier" ADD CONSTRAINT "product_supplier_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_supplier" ADD CONSTRAINT "product_supplier_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("supplier_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_supplier" ADD CONSTRAINT "product_supplier_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_supplier" ADD CONSTRAINT "product_supplier_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer" ADD CONSTRAINT "customer_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer" ADD CONSTRAINT "customer_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
