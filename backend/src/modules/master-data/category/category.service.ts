import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  CategoryQueryDto,
} from './dto/category.dto.js';
import type { Prisma, Category } from '../../../../generated/prisma/client.js';
import {
  ACTIVITY_TYPES,
  AUDIT_OPERATIONS,
  changedFields as buildChangedFields,
  createAuditTransactionId,
} from '../../../common/logging/business-logger.js';

type AuditFieldChange = {
  old: string | boolean | null;
  new: string | boolean | null;
};

@Injectable()
export class CategoryService {
  constructor(private readonly prisma: PrismaService) {}

  private async checkDuplicateWarning(
    name: string,
    forceSave: boolean,
    excludeId?: bigint,
  ) {
    if (forceSave) return;

    const trimmedName = name.trim();

    const duplicates = await this.prisma.category.findMany({
      where: {
        AND: [
          excludeId ? { categoryId: { not: excludeId } } : {},
          { categoryName: { equals: trimmedName, mode: 'insensitive' } },
        ],
      },
      select: { categoryId: true, categoryName: true },
    });

    if (duplicates.length > 0) {
      const duplicateNames = duplicates.map((d) => d.categoryName).join(', ');
      throw new HttpException(
        `DUPLICATE_WARNING: Ditemukan kemiripan dengan kategori: ${duplicateNames}. Lanjutkan?`,
        HttpStatus.CONFLICT,
      );
    }
  }

  async create(
    userId: bigint,
    dto: CreateCategoryDto,
    ip: string,
    ua: string,
  ): Promise<Category> {
    const trimmedName = dto.categoryName.trim();
    if (trimmedName.length === 0)
      throw new HttpException(
        'Nama Category tidak boleh hanya berisi spasi.',
        HttpStatus.BAD_REQUEST,
      );

    await this.checkDuplicateWarning(trimmedName, dto.forceSave ?? false);

    return await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const category = await tx.category.create({
          data: {
            categoryName: trimmedName,
            isActive: true,
            createdBy: userId,
            createdAt: new Date(),
          },
        });

        const now = new Date();
        const transactionId = createAuditTransactionId();

        await tx.activityLog.create({
          data: {
            userId,
            activityType: ACTIVITY_TYPES.CREATE,
            module: 'MASTER_DATA',
            entityType: 'CATEGORY',
            entityId: category.categoryId,
            description: `Membuat Kategori Baru: ${category.categoryName}`,
            createdAt: now,
          },
        });

        await tx.auditLog.create({
          data: {
            userId,
            action: 'CREATE',
            transactionId,
            module: 'MASTER_DATA',
            source: 'Created via Category Master',
            entityType: 'CATEGORY',
            entityId: category.categoryId,
            changedFields: buildChangedFields(null, category, [
              'categoryName',
              'isActive',
            ]),
            ipAddress: ip,
            userAgent: ua,
            createdAt: now,
          },
        });

        return category;
      },
    );
  }

  async update(
    userId: bigint,
    categoryId: bigint,
    dto: UpdateCategoryDto,
    ip: string,
    ua: string,
  ): Promise<Category> {
    const existing = await this.prisma.category.findUnique({
      where: { categoryId },
    });
    if (!existing)
      throw new HttpException(
        'Category tidak ditemukan.',
        HttpStatus.NOT_FOUND,
      );

    const trimmedName = dto.categoryName.trim();
    if (trimmedName.length === 0)
      throw new HttpException(
        'Nama Category tidak boleh hanya berisi spasi.',
        HttpStatus.BAD_REQUEST,
      );

    await this.checkDuplicateWarning(
      trimmedName,
      dto.forceSave ?? false,
      categoryId,
    );

    return await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const updated = await tx.category.update({
          where: { categoryId },
          data: {
            categoryName: trimmedName,
            updatedBy: userId,
            updatedAt: new Date(),
          },
        });

        const now = new Date();
        const transactionId = createAuditTransactionId();
        const changedFields: Record<string, AuditFieldChange> = {};

        if (existing.categoryName !== updated.categoryName) {
          changedFields.categoryName = {
            old: existing.categoryName,
            new: updated.categoryName,
          };
        }

        if (Object.keys(changedFields).length > 0) {
          await tx.activityLog.create({
            data: {
              userId,
              activityType: ACTIVITY_TYPES.UPDATE,
              module: 'MASTER_DATA',
              entityType: 'CATEGORY',
              entityId: categoryId,
              description: `Memperbarui data Kategori: ${updated.categoryName}`,
              createdAt: now,
            },
          });

          await tx.auditLog.create({
            data: {
              userId,
              action: 'UPDATE',
              transactionId,
              module: 'MASTER_DATA',
              source: 'Updated via Category Master',
              entityType: 'CATEGORY',
              entityId: categoryId,
              changedFields: buildChangedFields(existing, updated, [
                'categoryName',
              ]),
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

  // ===========================================================================
  // TAMBAHAN: INACTIVATE CATEGORY (FR-CAT-004)
  // ===========================================================================
  async inactivate(
    userId: bigint,
    categoryId: bigint,
    ip: string,
    ua: string,
  ): Promise<void> {
    const category = await this.prisma.category.findUnique({
      where: { categoryId },
    });
    if (!category)
      throw new HttpException(
        'Kategori tidak ditemukan.',
        HttpStatus.NOT_FOUND,
      );
    if (!category.isActive)
      throw new HttpException(
        'Kategori sudah berstatus Inactive.',
        HttpStatus.BAD_REQUEST,
      );

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.category.update({
        where: { categoryId },
        data: { isActive: false, updatedBy: userId, updatedAt: new Date() },
      });

      const now = new Date();
      const transactionId = createAuditTransactionId();
      await tx.activityLog.create({
        data: {
          userId,
          activityType: ACTIVITY_TYPES.UPDATE,
          module: 'MASTER_DATA',
          entityType: 'CATEGORY',
          entityId: categoryId,
          description: `Menonaktifkan Kategori: ${category.categoryName}`,
          createdAt: now,
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: AUDIT_OPERATIONS.UPDATE,
          transactionId,
          module: 'MASTER_DATA',
          source: 'Updated via Category Master',
          entityType: 'CATEGORY',
          entityId: categoryId,
          changedFields: buildChangedFields(
            category,
            { ...category, isActive: false },
            ['isActive'],
          ),
          ipAddress: ip,
          userAgent: ua,
          createdAt: now,
        },
      });
    });
  }

  // ===========================================================================
  // TAMBAHAN: REACTIVATE CATEGORY (FR-CAT-005)
  // ===========================================================================
  async reactivate(
    userId: bigint,
    categoryId: bigint,
    ip: string,
    ua: string,
  ): Promise<void> {
    const category = await this.prisma.category.findUnique({
      where: { categoryId },
    });
    if (!category)
      throw new HttpException(
        'Kategori tidak ditemukan.',
        HttpStatus.NOT_FOUND,
      );
    if (category.isActive)
      throw new HttpException(
        'Kategori sudah berstatus Active.',
        HttpStatus.BAD_REQUEST,
      );

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.category.update({
        where: { categoryId },
        data: { isActive: true, updatedBy: userId, updatedAt: new Date() },
      });

      const now = new Date();
      const transactionId = createAuditTransactionId();
      await tx.activityLog.create({
        data: {
          userId,
          activityType: ACTIVITY_TYPES.UPDATE,
          module: 'MASTER_DATA',
          entityType: 'CATEGORY',
          entityId: categoryId,
          description: `Mengaktifkan kembali Kategori: ${category.categoryName}`,
          createdAt: now,
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: AUDIT_OPERATIONS.UPDATE,
          transactionId,
          module: 'MASTER_DATA',
          source: 'Updated via Category Master',
          entityType: 'CATEGORY',
          entityId: categoryId,
          changedFields: buildChangedFields(
            category,
            { ...category, isActive: true },
            ['isActive'],
          ),
          ipAddress: ip,
          userAgent: ua,
          createdAt: now,
        },
      });
    });
  }

  // ===========================================================================
  // UPDATE: GET CATEGORY LIST dengan FILTER STATUS
  // ===========================================================================
  async findAll(query: CategoryQueryDto) {
    const page = parseInt(query.page || '1', 10);
    const limit = parseInt(query.limit || '20', 10);
    const skip = (page - 1) * limit;

    const where: Prisma.CategoryWhereInput = {};

    if (query.search) {
      where.categoryName = { contains: query.search, mode: 'insensitive' };
    }

    // PERBAIKAN: Menambahkan dukungan Filter Status
    if (query.status === 'ACTIVE') where.isActive = true;
    if (query.status === 'INACTIVE') where.isActive = false;

    const sortField = query.sortBy || 'categoryName';
    const sortDir = query.sortDir || 'asc';

    const orderBy: Prisma.CategoryOrderByWithRelationInput = {};
    if (sortField === 'categoryName') {
      orderBy.categoryName = sortDir;
    } else if (sortField === 'totalProduct') {
      orderBy.products = { _count: sortDir };
    } else if (sortField === 'updatedAt') {
      orderBy.updatedAt = sortDir;
    } else {
      orderBy.createdAt = 'desc';
    }

    const [total, data] = await Promise.all([
      this.prisma.category.count({ where }),
      this.prisma.category.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: { _count: { select: { products: true } } },
      }),
    ]);

    const mappedData = data.map((c) => ({
      categoryId: c.categoryId.toString(),
      categoryName: c.categoryName,
      isActive: c.isActive,
      totalProduct: c._count.products,
      updatedAt: c.updatedAt?.toISOString() || null,
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
