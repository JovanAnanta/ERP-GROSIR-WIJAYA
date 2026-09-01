import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { PriceQueryDto, UpdatePriceDto } from './dto/pricing.dto.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import {
  ACTIVITY_TYPES,
  AUDIT_OPERATIONS,
  changedFields,
  createAuditTransactionId,
} from '../../common/logging/business-logger.js';

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  async getGuestPrices(query: PriceQueryDto) {
    const page = parseInt(query.page || '1', 10);
    const limit = parseInt(query.limit || '20', 10);
    const skip = (page - 1) * limit;

    const whereProduct: Prisma.ProductWhereInput = { isActive: true };
    if (query.search) {
      whereProduct.productName = {
        contains: query.search,
        mode: 'insensitive',
      };
    }
    if (query.categoryId) whereProduct.categoryId = BigInt(query.categoryId);
    if (query.brandId) whereProduct.brandId = BigInt(query.brandId);

    const where: Prisma.ProductUnitWhereInput = {
      isActive: true,
      product: whereProduct,
    };

    const [total, data] = await Promise.all([
      this.prisma.productUnit.count({ where }),
      this.prisma.productUnit.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ product: { productName: 'asc' } }, { displayOrder: 'asc' }],
        include: {
          product: { include: { category: true, brand: true } },
          unit: true,
          guestPrices: { take: 1 },
        },
      }),
    ]);

    const mappedData = data.map((pu) => ({
      productUnitId: pu.productUnitId.toString(),
      productName: pu.product.productName,
      categoryName: pu.product.category.categoryName,
      brandName: pu.product.brand?.brandName || null,
      unitName: pu.unit.unitName,
      suggestedPrice:
        pu.guestPrices.length > 0
          ? Number(pu.guestPrices[0].suggestedPrice)
          : 0,
      updatedAt:
        pu.guestPrices.length > 0
          ? pu.guestPrices[0].updatedAt?.toISOString() ||
            pu.guestPrices[0].createdAt.toISOString()
          : null,
    }));

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

  async updateGuestPrices(
    userId: bigint,
    dto: UpdatePriceDto,
    ip: string,
    ua: string,
  ) {
    if (dto.updates.length === 0) return { updatedCount: 0 };

    return await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        let updatedCount = 0;
        const now = new Date();
        const transactionId = createAuditTransactionId();

        for (const item of dto.updates) {
          const productUnitId = BigInt(item.productUnitId);
          const existing = await tx.guestSuggestedPrice.findFirst({
            where: { productUnitId },
          });
          const oldPrice = existing ? Number(existing.suggestedPrice) : 0;

          if (oldPrice !== item.price) {
            let saved;
            if (existing) {
              saved = await tx.guestSuggestedPrice.update({
                where: { guestPriceId: existing.guestPriceId },
                data: {
                  suggestedPrice: item.price,
                  updatedBy: userId,
                  updatedAt: now,
                },
              });
            } else {
              saved = await tx.guestSuggestedPrice.create({
                data: {
                  productUnitId,
                  suggestedPrice: item.price,
                  createdBy: userId,
                  createdAt: now,
                },
              });
            }

            await tx.auditLog.create({
              data: {
                userId,
                action: existing
                  ? AUDIT_OPERATIONS.UPDATE
                  : AUDIT_OPERATIONS.CREATE,
                transactionId,
                module: 'PRICE',
                source: existing
                  ? 'Updated via Guest Pricing'
                  : 'Created via Guest Pricing',
                entityType: 'GUEST_PRICE',
                entityId: saved.guestPriceId,
                entityNumber: productUnitId.toString(),
                changedFields: changedFields(existing, saved, [
                  'productUnitId',
                  'suggestedPrice',
                ]),
                ipAddress: ip,
                userAgent: ua,
                createdAt: now,
              },
            });
            updatedCount++;
          }
        }

        if (updatedCount > 0) {
          await tx.activityLog.create({
            data: {
              userId,
              activityType: ACTIVITY_TYPES.UPDATE,
              module: 'PRICE',
              entityType: 'GUEST_PRICE',
              description: `Memperbarui ${updatedCount} harga Guest.`,
              createdAt: now,
            },
          });
        }

        return { updatedCount };
      },
    );
  }

  // ===========================================================================
  // 2. BROCHURE ENGINE (FR-PRICE-007)
  // ===========================================================================
  async getBrochureData() {
    // Tarik System Configuration (ID=1)
    const sysConfig = await this.prisma.systemConfiguration.findUnique({
      where: { id: 1 },
    });
    const storeInfo = sysConfig
      ? {
          companyName: sysConfig.companyName,
          address: sysConfig.address,
          phone: sysConfig.phone,
          logoBase64: sysConfig.logoBase64,
        }
      : null;

    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      select: {
        productId: true,
        productName: true,
        category: { select: { categoryName: true } },
        brand: { select: { brandName: true } },
        productUnits: {
          where: { isActive: true },
          select: {
            unit: { select: { unitName: true } },
            guestPrices: { select: { suggestedPrice: true }, take: 1 },
          },
          orderBy: { displayOrder: 'asc' },
        },
      },
      orderBy: [
        { category: { categoryName: 'asc' } },
        { brand: { brandName: 'asc' } },
        { productName: 'asc' },
      ],
    });

    const result = {
      rokok: [] as any[],
      minuman: [] as any[],
      acak: [] as any[],
      bulkRepack: [] as any[],
    };

    for (const p of products) {
      const validUnits = p.productUnits
        .map((pu) => ({
          unitName: pu.unit.unitName.toUpperCase(),
          price:
            pu.guestPrices.length > 0
              ? Number(pu.guestPrices[0].suggestedPrice)
              : 0,
        }))
        .filter((u) => u.price > 0);

      if (validUnits.length === 0) continue;

      const catLower = p.category.categoryName.toLowerCase();
      let groupKey: 'rokok' | 'minuman' | 'acak' | 'bulkRepack' = 'acak';

      if (
        catLower.includes('curah') ||
        catLower.includes('bal') ||
        catLower.includes('repack')
      ) {
        groupKey = 'bulkRepack';
      } else if (catLower.includes('rokok')) {
        groupKey = 'rokok';
      } else if (catLower.includes('minuman') && !catLower.includes('serbuk')) {
        // Pengecualian mutlak: "Minuman Serbuk" dilempar ke tabel ACAK
        groupKey = 'minuman';
      }

      result[groupKey].push({
        productId: p.productId.toString(),
        productName: p.productName,
        categoryName: p.category.categoryName,
        brandName: p.brand?.brandName || null,
        units: validUnits,
      });
    }

    return { storeInfo, brochure: result };
  }
}
