import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  CreateBrandDto,
  UpdateBrandDto,
  BrandQueryDto,
} from './dto/brand.dto.js';
import type { Prisma, Brand } from '../../../../generated/prisma/client.js';

type AuditFieldChange = {
  old: string | boolean | null;
  new: string | boolean | null;
};

@Injectable()
export class BrandService {
  constructor(private readonly prisma: PrismaService) {}

  private async checkDuplicateWarning(
    name: string,
    forceSave: boolean,
    excludeId?: bigint,
  ) {
    if (forceSave) return;

    const trimmedName = name.trim();
    const duplicates = await this.prisma.brand.findMany({
      where: {
        AND: [
          excludeId ? { brandId: { not: excludeId } } : {},
          { brandName: { equals: trimmedName, mode: 'insensitive' } },
        ],
      },
      select: { brandId: true, brandName: true },
    });

    if (duplicates.length > 0) {
      const duplicateNames = duplicates.map((d) => d.brandName).join(', ');
      throw new HttpException(
        `DUPLICATE_WARNING: Ditemukan kemiripan dengan merek: ${duplicateNames}. Lanjutkan?`,
        HttpStatus.CONFLICT,
      );
    }
  }

  async create(
    userId: bigint,
    dto: CreateBrandDto,
    ip: string,
    ua: string,
  ): Promise<Brand> {
    const trimmedName = dto.brandName.trim();
    if (trimmedName.length === 0)
      throw new HttpException(
        'Nama Merek tidak boleh kosong.',
        HttpStatus.BAD_REQUEST,
      );

    await this.checkDuplicateWarning(trimmedName, dto.forceSave ?? false);

    return await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const brand = await tx.brand.create({
          data: {
            brandName: trimmedName,
            isActive: true,
            createdBy: userId,
            createdAt: new Date(),
          },
        });

        const now = new Date();
        await tx.activityLog.create({
          data: {
            userId,
            activityType: 'CREATE_BRAND',
            entityType: 'BRAND',
            entityId: brand.brandId,
            description: `Membuat Merek Baru: ${brand.brandName}`,
            createdAt: now,
          },
        });

        await tx.auditLog.create({
          data: {
            userId,
            action: 'CREATE',
            entityType: 'BRAND',
            entityId: brand.brandId,
            changedFields: { brandName: { new: brand.brandName } },
            ipAddress: ip,
            userAgent: ua,
            createdAt: now,
          },
        });

        return brand;
      },
    );
  }

  async update(
    userId: bigint,
    brandId: bigint,
    dto: UpdateBrandDto,
    ip: string,
    ua: string,
  ): Promise<Brand> {
    const existing = await this.prisma.brand.findUnique({ where: { brandId } });
    if (!existing)
      throw new HttpException('Merek tidak ditemukan.', HttpStatus.NOT_FOUND);

    const trimmedName = dto.brandName.trim();
    if (trimmedName.length === 0)
      throw new HttpException(
        'Nama Merek tidak boleh kosong.',
        HttpStatus.BAD_REQUEST,
      );

    await this.checkDuplicateWarning(
      trimmedName,
      dto.forceSave ?? false,
      brandId,
    );

    return await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const updated = await tx.brand.update({
          where: { brandId },
          data: {
            brandName: trimmedName,
            updatedBy: userId,
            updatedAt: new Date(),
          },
        });

        const now = new Date();
        const changedFields: Record<string, AuditFieldChange> = {};
        if (existing.brandName !== updated.brandName)
          changedFields.brandName = {
            old: existing.brandName,
            new: updated.brandName,
          };

        if (Object.keys(changedFields).length > 0) {
          await tx.activityLog.create({
            data: {
              userId,
              activityType: 'UPDATE_BRAND',
              entityType: 'BRAND',
              entityId: brandId,
              description: `Memperbarui Merek: ${updated.brandName}`,
              createdAt: now,
            },
          });

          await tx.auditLog.create({
            data: {
              userId,
              action: 'UPDATE',
              entityType: 'BRAND',
              entityId: brandId,
              changedFields: changedFields,
              ipAddress: ip,
              userAgent: ua,
              createdAt: now,
            },
          });
        }

        return updated;
      },
    );
  }

  async inactivate(
    userId: bigint,
    brandId: bigint,
    ip: string,
    ua: string,
  ): Promise<void> {
    const brand = await this.prisma.brand.findUnique({ where: { brandId } });
    if (!brand)
      throw new HttpException('Merek tidak ditemukan.', HttpStatus.NOT_FOUND);
    if (!brand.isActive)
      throw new HttpException(
        'Merek sudah berstatus Inactive.',
        HttpStatus.BAD_REQUEST,
      );

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.brand.update({
        where: { brandId },
        data: { isActive: false, updatedBy: userId, updatedAt: new Date() },
      });
      const now = new Date();
      await tx.activityLog.create({
        data: {
          userId,
          activityType: 'INACTIVATE_BRAND',
          entityType: 'BRAND',
          entityId: brandId,
          description: `Menonaktifkan Merek: ${brand.brandName}`,
          createdAt: now,
        },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: 'INACTIVATE',
          entityType: 'BRAND',
          entityId: brandId,
          changedFields: { isActive: { old: true, new: false } },
          ipAddress: ip,
          userAgent: ua,
          createdAt: now,
        },
      });
    });
  }

  async reactivate(
    userId: bigint,
    brandId: bigint,
    ip: string,
    ua: string,
  ): Promise<void> {
    const brand = await this.prisma.brand.findUnique({ where: { brandId } });
    if (!brand)
      throw new HttpException('Merek tidak ditemukan.', HttpStatus.NOT_FOUND);
    if (brand.isActive)
      throw new HttpException(
        'Merek sudah berstatus Active.',
        HttpStatus.BAD_REQUEST,
      );

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.brand.update({
        where: { brandId },
        data: { isActive: true, updatedBy: userId, updatedAt: new Date() },
      });
      const now = new Date();
      await tx.activityLog.create({
        data: {
          userId,
          activityType: 'REACTIVATE_BRAND',
          entityType: 'BRAND',
          entityId: brandId,
          description: `Mengaktifkan kembali Merek: ${brand.brandName}`,
          createdAt: now,
        },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: 'REACTIVATE',
          entityType: 'BRAND',
          entityId: brandId,
          changedFields: { isActive: { old: false, new: true } },
          ipAddress: ip,
          userAgent: ua,
          createdAt: now,
        },
      });
    });
  }

  async findAll(query: BrandQueryDto) {
    const page = parseInt(query.page || '1', 10);
    const limit = parseInt(query.limit || '20', 10);
    const skip = (page - 1) * limit;
    const where: Prisma.BrandWhereInput = {};

    if (query.search)
      where.brandName = { contains: query.search, mode: 'insensitive' };
    if (query.status === 'ACTIVE') where.isActive = true;
    if (query.status === 'INACTIVE') where.isActive = false;

    const sortField = query.sortBy || 'brandName';
    const sortDir = query.sortDir || 'asc';

    const orderBy: Prisma.BrandOrderByWithRelationInput = {};
    if (sortField === 'brandName') orderBy.brandName = sortDir;
    else if (sortField === 'totalProduct')
      orderBy.products = { _count: sortDir };
    else if (sortField === 'updatedAt') orderBy.updatedAt = sortDir;
    else orderBy.createdAt = 'desc';

    const [total, data] = await Promise.all([
      this.prisma.brand.count({ where }),
      this.prisma.brand.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: { _count: { select: { products: true } } },
      }),
    ]);

    const mappedData = data.map((b) => ({
      brandId: b.brandId.toString(),
      brandName: b.brandName,
      isActive: b.isActive,
      totalProduct: b._count.products,
      updatedAt: b.updatedAt?.toISOString() || null,
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
}
