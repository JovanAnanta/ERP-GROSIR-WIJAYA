import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  CreateProductDto,
  UpdateProductDto,
  ProductQueryDto,
  ProductUnitInputDto,
} from './dto/product.dto.js';
import type {
  Prisma,
  Product,
  ProductUnit,
} from '../../../../generated/prisma/client.js';
import { ImportProductsPayloadDto } from './dto/product.dto.js';
import {
  ACTIVITY_TYPES,
  AUDIT_OPERATIONS,
  changedFields,
  createAuditTransactionId,
  writeActivityLog,
  writeAuditLog,
} from '../../../common/logging/business-logger.js';

interface FormattableProductUnit {
  isParent: boolean;
  conversionFactor: Prisma.Decimal | number;
  unit: { unitName: string };
}

@Injectable()
export class ProductService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveCategory(
    tx: Prisma.TransactionClient,
    userId: bigint,
    id?: string,
    newName?: string,
  ): Promise<bigint> {
    if (id) return BigInt(id);
    if (newName) {
      const trimmed = newName.trim();
      const existing = await tx.category.findFirst({
        where: { categoryName: { equals: trimmed, mode: 'insensitive' } },
      });
      if (existing) return existing.categoryId;
      const created = await tx.category.create({
        data: { categoryName: trimmed, isActive: true, createdBy: userId },
      });
      return created.categoryId;
    }
    throw new HttpException(
      'Kategori wajib dipilih atau dibuat baru.',
      HttpStatus.BAD_REQUEST,
    );
  }

  private async resolveBrand(
    tx: Prisma.TransactionClient,
    userId: bigint,
    id?: string,
    newName?: string,
  ): Promise<bigint | null> {
    if (!id && !newName) return null;
    if (id) return BigInt(id);
    if (newName) {
      const trimmed = newName.trim();
      const existing = await tx.brand.findFirst({
        where: { brandName: { equals: trimmed, mode: 'insensitive' } },
      });
      if (existing) return existing.brandId;
      const created = await tx.brand.create({
        data: { brandName: trimmed, isActive: true, createdBy: userId },
      });
      return created.brandId;
    }
    return null;
  }

  private async resolveUnit(
    tx: Prisma.TransactionClient,
    userId: bigint,
    id?: string,
    newName?: string,
  ): Promise<bigint> {
    if (id) return BigInt(id);
    if (newName) {
      const trimmed = newName.trim();
      const existing = await tx.unit.findFirst({
        where: { unitName: { equals: trimmed, mode: 'insensitive' } },
      });
      if (existing) return existing.unitId;
      const created = await tx.unit.create({
        data: { unitName: trimmed, isActive: true, createdBy: userId },
      });
      return created.unitId;
    }
    throw new HttpException(
      'Satuan (Unit) wajib diisi.',
      HttpStatus.BAD_REQUEST,
    );
  }

  private formatHierarchicalStock(
    baseQty: number,
    productUnits: FormattableProductUnit[],
  ): string {
    if (baseQty <= 0) {
      const parentUnit = productUnits.find((u) => u.isParent);
      return `0 ${parentUnit ? parentUnit.unit.unitName : ''}`;
    }

    const sortedUnits = [...productUnits].sort(
      (a, b) => Number(b.conversionFactor) - Number(a.conversionFactor),
    );
    let remainingQty = Math.floor(baseQty);
    const result: string[] = [];

    for (const pu of sortedUnits) {
      const factor = Number(pu.conversionFactor);
      if (remainingQty >= factor) {
        const count = Math.floor(remainingQty / factor);
        result.push(`${count} ${pu.unit.unitName}`);
        remainingQty = remainingQty % factor;
      }
    }
    return result.join(' ').trim();
  }

  async create(userId: bigint, dto: CreateProductDto): Promise<Product> {
    const trimmedName = dto.productName.trim();
    if (trimmedName.length === 0)
      throw new HttpException('Nama Product kosong.', HttpStatus.BAD_REQUEST);

    const units: ProductUnitInputDto[] = dto.units || [];
    const parents = units.filter((u) => u.isParent);
    if (parents.length !== 1 || Number(parents[0].conversionFactor) !== 1) {
      throw new HttpException(
        'Wajib memiliki 1 Parent Unit dengan Conversion Factor 1.',
        HttpStatus.BAD_REQUEST,
      );
    }

    return await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const transactionId = createAuditTransactionId();
        const categoryId = await this.resolveCategory(
          tx,
          userId,
          dto.categoryId,
          dto.newCategoryName,
        );
        const brandId = await this.resolveBrand(
          tx,
          userId,
          dto.brandId,
          dto.newBrandName,
        );

        const product = await tx.product.create({
          data: {
            productName: trimmedName,
            categoryId,
            brandId,
            minimumInventoryQty: dto.minimumInventoryQty,
            isActive: true,
            createdBy: userId,
            createdAt: new Date(),
          },
        });

        let parentProductUnitId: bigint | null = null;
        const createdUnits: ProductUnit[] = [];

        const orderedUnits = [
          parents[0],
          ...units.filter((unit) => !unit.isParent),
        ];
        for (const unitInput of orderedUnits) {
          const unitId = await this.resolveUnit(
            tx,
            userId,
            unitInput.unitId,
            unitInput.newUnitName,
          );
          const dOrder =
            typeof unitInput.displayOrder === 'number'
              ? unitInput.displayOrder
              : 100;
          const convFactor = Number(unitInput.conversionFactor);
          const isParentFlag = Boolean(unitInput.isParent);
          const isActiveFlag =
            unitInput.isActive !== undefined
              ? Boolean(unitInput.isActive)
              : true;

          const pu: ProductUnit = await tx.productUnit.create({
            data: {
              productId: product.productId,
              unitId: unitId,
              parentProductUnitId: isParentFlag ? null : parentProductUnitId,
              conversionFactor: convFactor,
              displayOrder: dOrder,
              isParent: isParentFlag,
              isActive: isActiveFlag,
              createdBy: userId,
              createdAt: new Date(),
            },
          });
          createdUnits.push(pu);
          if (pu.isParent) parentProductUnitId = pu.productUnitId;
        }

        let createdStock: Awaited<
          ReturnType<typeof tx.inventoryStock.create>
        > | null = null;
        if (parentProductUnitId) {
          createdStock = await tx.inventoryStock.create({
            data: {
              productId: product.productId,
              productUnitId: parentProductUnitId,
              actualQty: 0,
              availableQty: 0,
              updatedAt: new Date(),
            },
          });
        }

        await writeActivityLog(tx, {
          userId,
          activityType: ACTIVITY_TYPES.CREATE,
          module: 'PRODUCT',
          entityType: 'PRODUCT',
          entityId: product.productId,
          entityNumber: product.productName,
          description: `Membuat produk ${product.productName}`,
        });
        await writeAuditLog(tx, {
          userId,
          transactionId,
          module: 'PRODUCT',
          operation: AUDIT_OPERATIONS.CREATE,
          entityType: 'PRODUCT',
          entityId: product.productId,
          entityNumber: product.productName,
          source: 'Created via Product Master',
          changedFields: changedFields(null, product, [
            'productName',
            'categoryId',
            'brandId',
            'minimumInventoryQty',
            'isActive',
          ]),
        });
        await Promise.all([
          ...createdUnits.map((unit) =>
            writeAuditLog(tx, {
              userId,
              transactionId,
              module: 'PRODUCT',
              operation: AUDIT_OPERATIONS.CREATE,
              entityType: 'PRODUCT_UNIT',
              entityId: unit.productUnitId,
              entityNumber: product.productName,
              source: 'Created via Product Master',
              changedFields: changedFields(null, unit, [
                'productId',
                'unitId',
                'parentProductUnitId',
                'conversionFactor',
                'displayOrder',
                'isParent',
                'isActive',
              ]),
            }),
          ),
          ...(createdStock
            ? [
                writeAuditLog(tx, {
                  userId,
                  transactionId,
                  module: 'INVENTORY',
                  operation: AUDIT_OPERATIONS.CREATE,
                  entityType: 'INVENTORY_STOCK',
                  entityId: createdStock.inventoryStockId,
                  entityNumber: product.productName,
                  source: 'Initialized via Product Master',
                  changedFields: changedFields(null, createdStock, [
                    'productId',
                    'productUnitId',
                    'actualQty',
                    'availableQty',
                  ]),
                }),
              ]
            : []),
        ]);
        return product;
      },
    );
  }

  async update(
    userId: bigint,
    productId: bigint,
    dto: UpdateProductDto,
  ): Promise<Product> {
    const existing = await this.prisma.product.findUnique({
      where: { productId },
    });
    if (!existing)
      throw new HttpException('Produk tidak ditemukan.', HttpStatus.NOT_FOUND);

    const units: ProductUnitInputDto[] = dto.units || [];
    const parents = units.filter((unit) => unit.isParent);
    if (parents.length !== 1 || Number(parents[0].conversionFactor) !== 1) {
      throw new HttpException(
        'Wajib memiliki 1 Parent Unit dengan Conversion Factor 1.',
        HttpStatus.BAD_REQUEST,
      );
    }

    return await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const transactionId = createAuditTransactionId();
        const categoryId = await this.resolveCategory(
          tx,
          userId,
          dto.categoryId,
          dto.newCategoryName,
        );
        const brandId = await this.resolveBrand(
          tx,
          userId,
          dto.brandId,
          dto.newBrandName,
        );

        const updated = await tx.product.update({
          where: { productId },
          data: {
            productName: dto.productName.trim(),
            categoryId,
            brandId,
            minimumInventoryQty: dto.minimumInventoryQty,
            updatedBy: userId,
            updatedAt: new Date(),
          },
        });

        const existingParent = await tx.productUnit.findFirst({
          where: { productId, isParent: true },
          select: { productUnitId: true },
        });
        if (!existingParent) {
          throw new HttpException(
            'Parent Unit produk tidak ditemukan.',
            HttpStatus.CONFLICT,
          );
        }
        if (
          !parents[0].productUnitId ||
          BigInt(parents[0].productUnitId) !== existingParent.productUnitId
        ) {
          throw new HttpException(
            'Parent Unit produk yang sudah digunakan tidak dapat diganti.',
            HttpStatus.BAD_REQUEST,
          );
        }
        if (units.length > 0) {
          const orderedUnits = [
            parents[0],
            ...units.filter((unit) => !unit.isParent),
          ];
          for (const unitInput of orderedUnits) {
            const unitId = await this.resolveUnit(
              tx,
              userId,
              unitInput.unitId,
              unitInput.newUnitName,
            );
            const dOrder =
              typeof unitInput.displayOrder === 'number'
                ? unitInput.displayOrder
                : 100;
            const convFactor = Number(unitInput.conversionFactor);
            const isParentFlag = Boolean(unitInput.isParent);
            const isActiveFlag =
              unitInput.isActive !== undefined
                ? Boolean(unitInput.isActive)
                : true;

            if (unitInput.productUnitId) {
              if (!isActiveFlag && isParentFlag) {
                throw new HttpException(
                  `Satuan Dasar (Parent Unit) tidak boleh dinonaktifkan.`,
                  HttpStatus.BAD_REQUEST,
                );
              }
              const productUnitId = BigInt(unitInput.productUnitId);
              const beforeUnit = await tx.productUnit.findUniqueOrThrow({
                where: { productUnitId },
              });
              const changedUnit = await tx.productUnit.update({
                where: { productUnitId },
                data: {
                  unitId,
                  parentProductUnitId: isParentFlag
                    ? null
                    : existingParent.productUnitId,
                  conversionFactor: convFactor,
                  displayOrder: dOrder,
                  isParent: isParentFlag,
                  isActive: isActiveFlag,
                  updatedBy: userId,
                  updatedAt: new Date(),
                },
              });
              await writeAuditLog(tx, {
                userId,
                transactionId,
                module: 'PRODUCT',
                operation: AUDIT_OPERATIONS.UPDATE,
                entityType: 'PRODUCT_UNIT',
                entityId: productUnitId,
                entityNumber: updated.productName,
                source: 'Updated via Product Master',
                changedFields: changedFields(beforeUnit, changedUnit, [
                  'unitId',
                  'parentProductUnitId',
                  'conversionFactor',
                  'displayOrder',
                  'isParent',
                  'isActive',
                ]),
              });
            } else {
              if (isActiveFlag) {
                const newUnit = await tx.productUnit.create({
                  data: {
                    productId,
                    unitId,
                    parentProductUnitId: isParentFlag
                      ? null
                      : existingParent.productUnitId,
                    conversionFactor: convFactor,
                    displayOrder: dOrder,
                    isParent: isParentFlag,
                    isActive: true,
                    createdBy: userId,
                    createdAt: new Date(),
                  },
                });
                await writeAuditLog(tx, {
                  userId,
                  transactionId,
                  module: 'PRODUCT',
                  operation: AUDIT_OPERATIONS.CREATE,
                  entityType: 'PRODUCT_UNIT',
                  entityId: newUnit.productUnitId,
                  entityNumber: updated.productName,
                  source: 'Created via Product Master',
                  changedFields: changedFields(null, newUnit, [
                    'productId',
                    'unitId',
                    'parentProductUnitId',
                    'conversionFactor',
                    'displayOrder',
                    'isParent',
                    'isActive',
                  ]),
                });
              }
            }
          }
        }

        await writeActivityLog(tx, {
          userId,
          activityType: ACTIVITY_TYPES.UPDATE,
          module: 'PRODUCT',
          entityType: 'PRODUCT',
          entityId: productId,
          entityNumber: updated.productName,
          description: `Memperbarui produk ${updated.productName}`,
        });
        await writeAuditLog(tx, {
          userId,
          transactionId,
          module: 'PRODUCT',
          operation: AUDIT_OPERATIONS.UPDATE,
          entityType: 'PRODUCT',
          entityId: productId,
          entityNumber: updated.productName,
          source: 'Updated via Product Master',
          changedFields: changedFields(existing, updated, [
            'productName',
            'categoryId',
            'brandId',
            'minimumInventoryQty',
          ]),
        });
        return updated;
      },
    );
  }

  async toggleStatus(
    userId: bigint,
    productId: bigint,
    status: boolean,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.product.findUnique({ where: { productId } });
      if (!existing)
        throw new HttpException(
          'Produk tidak ditemukan.',
          HttpStatus.NOT_FOUND,
        );
      const updated = await tx.product.update({
        where: { productId },
        data: { isActive: status, updatedBy: userId, updatedAt: new Date() },
      });
      if (existing.isActive === updated.isActive) return;
      const transactionId = createAuditTransactionId();
      await writeActivityLog(tx, {
        userId,
        activityType: ACTIVITY_TYPES.UPDATE,
        module: 'PRODUCT',
        entityType: 'PRODUCT',
        entityId: productId,
        entityNumber: updated.productName,
        description: `${status ? 'Mengaktifkan kembali' : 'Menonaktifkan'} produk ${updated.productName}`,
      });
      await writeAuditLog(tx, {
        userId,
        transactionId,
        module: 'PRODUCT',
        operation: AUDIT_OPERATIONS.UPDATE,
        entityType: 'PRODUCT',
        entityId: productId,
        entityNumber: updated.productName,
        source: 'Updated via Product Master',
        changedFields: changedFields(existing, updated, ['isActive']),
      });
    });
  }

  async findAll(query: ProductQueryDto) {
    const page = parseInt(query.page || '1', 10);
    const limit = parseInt(query.limit || '20', 10);
    const skip = (page - 1) * limit;
    const where: Prisma.ProductWhereInput = {};

    if (query.search)
      where.productName = { contains: query.search, mode: 'insensitive' };
    if (query.status === 'ACTIVE') where.isActive = true;
    if (query.status === 'INACTIVE') where.isActive = false;
    if (query.categoryId) where.categoryId = BigInt(query.categoryId);
    if (query.brandId) where.brandId = BigInt(query.brandId);

    const sortField = query.sortBy || 'productName';
    const sortDir = query.sortDir || 'asc';
    const orderBy: Prisma.ProductOrderByWithRelationInput = {};
    if (sortField === 'productName') orderBy.productName = sortDir;
    else if (sortField === 'updatedAt') orderBy.updatedAt = sortDir;
    else orderBy.createdAt = 'desc';

    const [total, data] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { productName: 'asc' },
        include: {
          category: { select: { categoryName: true } },
          brand: { select: { brandName: true } },
          inventoryStocks: { select: { actualQty: true, availableQty: true } },
          productUnits: {
            // PERBAIKAN: Tidak difilter lagi. UI akan menerima semua unit (termasuk yang inactive)
            orderBy: { displayOrder: 'asc' },
            include: { unit: { select: { unitName: true } } },
          },
        },
      }),
    ]);

    const mappedData = data.map((p) => {
      const baseActualQty =
        p.inventoryStocks.length > 0
          ? Number(p.inventoryStocks[0].actualQty)
          : 0;
      // Konversi stok hierarkis hanya dihitung dari satuan yang masih AKTIF
      const activeUnits = p.productUnits.filter((u) => u.isActive);
      const formattedStock = this.formatHierarchicalStock(
        baseActualQty,
        activeUnits,
      );

      return {
        productId: p.productId.toString(),
        productName: p.productName,
        categoryName: p.category.categoryName,
        brandName: p.brand?.brandName || null,
        isActive: p.isActive,
        minimumInventoryQty: Number(p.minimumInventoryQty),
        actualStockDisplay: formattedStock,
        units: p.productUnits.map((pu) => ({
          productUnitId: pu.productUnitId.toString(),
          parentProductUnitId: pu.parentProductUnitId?.toString() ?? null,
          unitName: pu.unit.unitName,
          conversionFactor: Number(pu.conversionFactor),
          displayOrder: pu.displayOrder,
          isParent: pu.isParent,
          isActive: pu.isActive, // Properti penting untuk UI
        })),
        updatedAt: p.updatedAt?.toISOString() || null,
      };
    });

    return {
      data: mappedData,
      meta: {
        currentPage: page,
        pageSize: limit,
        totalData: total,
        totalPage: Math.ceil(total / limit),
      },
    };
  }

  async getLookupOptions() {
    const [categories, brands] = await Promise.all([
      this.prisma.category.findMany({
        where: { isActive: true },
        select: { categoryName: true },
        orderBy: { categoryName: 'asc' },
      }),
      this.prisma.brand.findMany({
        where: { isActive: true },
        select: { brandName: true },
        orderBy: { brandName: 'asc' },
      }),
    ]);
    return {
      categories: categories.map((c) => c.categoryName),
      brands: brands.map((b) => b.brandName),
    };
  }

  async massImport(
    userId: bigint,
    dto: ImportProductsPayloadDto,
  ): Promise<{ createdCount: number; updatedCount: number }> {
    if (!dto.products || dto.products.length === 0) {
      throw new HttpException(
        'Tidak ada data produk yang dikirim.',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Menggunakan konfigurasi timeout lebih panjang (30 detik) untuk transaksi massal
    return await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        let createdCount = 0;
        let updatedCount = 0;
        const now = new Date();
        const transactionId = createAuditTransactionId();

        // 1. IN-MEMORY CACHING: Tarik semua Master Data ke RAM untuk mencegah N+1 Query Problem!
        const catMap = new Map<string, bigint>();
        const brandMap = new Map<string, bigint>();
        const unitMap = new Map<string, bigint>();

        const [allCats, allBrands, allUnits] = await Promise.all([
          tx.category.findMany({
            select: { categoryId: true, categoryName: true },
          }),
          tx.brand.findMany({ select: { brandId: true, brandName: true } }),
          tx.unit.findMany({ select: { unitId: true, unitName: true } }),
        ]);

        allCats.forEach((c) =>
          catMap.set(c.categoryName.trim().toUpperCase(), c.categoryId),
        );
        allBrands.forEach((b) =>
          brandMap.set(b.brandName.trim().toUpperCase(), b.brandId),
        );
        allUnits.forEach((u) =>
          unitMap.set(u.unitName.trim().toUpperCase(), u.unitId),
        );

        // 2. PROSES ITERASI PRODUK
        for (let i = 0; i < dto.products.length; i++) {
          const item = dto.products[i];
          const pName = item.productName.trim();

          // Validasi Kritis: Harus 1 Parent Unit dengan konversi 1
          const parents = item.units.filter((u) => u.isParent);
          if (
            parents.length !== 1 ||
            Number(parents[0].conversionFactor) !== 1
          ) {
            throw new HttpException(
              `Baris ke-${i + 1} (${pName}): Wajib memiliki tepat 1 Satuan Dasar (Parent) dengan nilai konversi 1.`,
              HttpStatus.BAD_REQUEST,
            );
          }

          // --- Resolusi Kategori (Cache / Insert JIT) ---
          const catKey = item.categoryName.trim().toUpperCase();
          let categoryId = catMap.get(catKey);
          if (!categoryId) {
            const newCat = await tx.category.create({
              data: {
                categoryName: item.categoryName.trim(),
                isActive: true,
                createdBy: userId,
                createdAt: now,
              },
            });
            categoryId = newCat.categoryId;
            catMap.set(catKey, categoryId);
          }

          // --- Resolusi Brand (Cache / Insert JIT) ---
          let brandId: bigint | null = null;
          if (item.brandName && item.brandName.trim() !== '') {
            const brandKey = item.brandName.trim().toUpperCase();
            brandId = brandMap.get(brandKey) || null;
            if (!brandId) {
              const newBrand = await tx.brand.create({
                data: {
                  brandName: item.brandName.trim(),
                  isActive: true,
                  createdBy: userId,
                  createdAt: now,
                },
              });
              brandId = newBrand.brandId;
              brandMap.set(brandKey, brandId);
            }
          }

          // --- Cek Eksistensi Produk (OVERWRITE jika ada) ---
          const existingProduct = await tx.product.findFirst({
            where: { productName: { equals: pName, mode: 'insensitive' } },
          });

          let targetProductId: bigint;

          if (existingProduct) {
            // UPDATE INFORMASI DASAR
            const importedProduct = await tx.product.update({
              where: { productId: existingProduct.productId },
              data: {
                categoryId,
                brandId,
                minimumInventoryQty: item.minimumInventoryQty,
                updatedBy: userId,
                updatedAt: now,
              },
            });
            await writeAuditLog(tx, {
              userId,
              transactionId,
              module: 'PRODUCT',
              operation: AUDIT_OPERATIONS.UPDATE,
              entityType: 'PRODUCT',
              entityId: importedProduct.productId,
              entityNumber: importedProduct.productName,
              source: 'Updated via Product Import',
              changedFields: changedFields(existingProduct, importedProduct, [
                'categoryId',
                'brandId',
                'minimumInventoryQty',
              ]),
            });
            targetProductId = existingProduct.productId;

            // Hapus satuan lama (Soft Delete) yang tidak ada di Excel
            const existingUnits = await tx.productUnit.findMany({
              where: { productId: targetProductId, isActive: true },
              include: { unit: true },
            });
            const incomingUnitNames = item.units.map((u) =>
              u.unitName.trim().toUpperCase(),
            );
            const existingParent = existingUnits.find((unit) => unit.isParent);
            const incomingParent = parents[0];
            if (
              !existingParent ||
              existingParent.unit.unitName.trim().toUpperCase() !==
                incomingParent.unitName.trim().toUpperCase()
            ) {
              throw new HttpException(
                `Baris ke-${i + 1} (${pName}): Satuan Dasar produk yang sudah digunakan tidak dapat diganti.`,
                HttpStatus.BAD_REQUEST,
              );
            }

            for (const eu of existingUnits) {
              if (
                !incomingUnitNames.includes(
                  eu.unit.unitName.trim().toUpperCase(),
                )
              ) {
                if (eu.isParent) {
                  throw new HttpException(
                    `Baris ke-${i + 1} (${pName}): Tidak boleh mengubah/menghapus Satuan Dasar produk yang sudah ada!`,
                    HttpStatus.BAD_REQUEST,
                  );
                }
                await tx.productUnit.update({
                  where: { productUnitId: eu.productUnitId },
                  data: { isActive: false, updatedBy: userId, updatedAt: now },
                });
              }
            }
            updatedCount++;
          } else {
            // CREATE BARU
            const newProd = await tx.product.create({
              data: {
                productName: pName,
                categoryId,
                brandId,
                minimumInventoryQty: item.minimumInventoryQty,
                isActive: true,
                createdBy: userId,
                createdAt: now,
              },
            });
            await writeAuditLog(tx, {
              userId,
              transactionId,
              module: 'PRODUCT',
              operation: AUDIT_OPERATIONS.CREATE,
              entityType: 'PRODUCT',
              entityId: newProd.productId,
              entityNumber: newProd.productName,
              source: 'Created via Product Import',
              changedFields: changedFields(null, newProd, [
                'productName',
                'categoryId',
                'brandId',
                'minimumInventoryQty',
                'isActive',
              ]),
            });
            targetProductId = newProd.productId;
            createdCount++;
          }

          // --- Eksekusi Satuan (Auto Display Order) ---
          const sortedUnits = [...item.units].sort(
            (a, b) => Number(a.conversionFactor) - Number(b.conversionFactor),
          );
          const orderedUnits = [
            parents[0],
            ...sortedUnits.filter((unit) => !unit.isParent),
          ];
          let displayOrder = 100;
          let parentProductUnitId: bigint | null = null;

          for (const u of orderedUnits) {
            const unitKey = u.unitName.trim().toUpperCase();
            let unitId = unitMap.get(unitKey);
            if (!unitId) {
              const newUnitMaster = await tx.unit.create({
                data: {
                  unitName: u.unitName.trim(),
                  isActive: true,
                  createdBy: userId,
                  createdAt: now,
                },
              });
              unitId = newUnitMaster.unitId;
              unitMap.set(unitKey, unitId);
            }

            // Upsert ProductUnit
            const existingPU = await tx.productUnit.findFirst({
              where: { productId: targetProductId, unitId: unitId },
            });

            if (existingPU) {
              const updatedPU: ProductUnit = await tx.productUnit.update({
                where: { productUnitId: existingPU.productUnitId },
                data: {
                  conversionFactor: Number(u.conversionFactor),
                  parentProductUnitId: u.isParent ? null : parentProductUnitId,
                  displayOrder,
                  isParent: u.isParent,
                  isActive: true,
                  updatedBy: userId,
                  updatedAt: now,
                },
              });
              if (updatedPU.isParent)
                parentProductUnitId = updatedPU.productUnitId;
            } else {
              const newPU: ProductUnit = await tx.productUnit.create({
                data: {
                  productId: targetProductId,
                  unitId,
                  parentProductUnitId: u.isParent ? null : parentProductUnitId,
                  conversionFactor: Number(u.conversionFactor),
                  displayOrder,
                  isParent: u.isParent,
                  isActive: true,
                  createdBy: userId,
                  createdAt: now,
                },
              });
              if (newPU.isParent) parentProductUnitId = newPU.productUnitId;
            }
            displayOrder += 100;
          }

          // Init Inventory Stock jika produk baru
          if (!existingProduct && parentProductUnitId) {
            await tx.inventoryStock.create({
              data: {
                productId: targetProductId,
                productUnitId: parentProductUnitId,
                actualQty: 0,
                availableQty: 0,
                updatedAt: now,
              },
            });
          }
        }

        // Catat Activity Log Massal
        await writeActivityLog(tx, {
          userId,
          activityType: ACTIVITY_TYPES.IMPORT,
          module: 'PRODUCT',
          entityType: 'PRODUCT',
          description: `Import produk: ${createdCount} baru dan ${updatedCount} diperbarui`,
          metadata: { createdCount, updatedCount },
        });

        return { createdCount, updatedCount };
      },
      {
        timeout: 60000, // Beri napas waktu transaksi hingga 60 detik untuk menelan payload super besar
      },
    );
  }
}
