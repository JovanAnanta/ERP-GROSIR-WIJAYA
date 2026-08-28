import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import {
  CreateSupplierDto,
  UpdateSupplierDto,
  SupplierQueryDto,
} from './supplier/dto/supplier.dto.js';
import type { Prisma, Supplier } from '../../../generated/prisma/client.js';

type FinancialSummaryData = {
  outstandingAmount?: number | string | Prisma.Decimal;
};

type AuditFieldChange = {
  old: string | null;
  new: string | null;
};

@Injectable()
export class SupplierService {
  constructor(private readonly prisma: PrismaService) {}

  private async checkDuplicateWarning(
    name: string,
    phone: string | undefined,
    forceSave: boolean,
    excludeId?: bigint,
  ) {
    if (forceSave) return;

    const trimmedName = name.trim();

    const duplicates = await this.prisma.supplier.findMany({
      where: {
        AND: [
          excludeId ? { supplierId: { not: excludeId } } : {},
          {
            OR: [
              { supplierName: { equals: trimmedName, mode: 'insensitive' } },
              phone ? { phone: phone } : { supplierId: BigInt(-1) },
            ],
          },
        ],
      },
      select: { supplierId: true, supplierName: true, phone: true },
    });

    if (duplicates.length > 0) {
      const duplicateNames = duplicates
        .map((d) => `${d.supplierName} (${d.phone ?? '-'})`)
        .join(', ');
      throw new HttpException(
        `DUPLICATE_WARNING: Ditemukan kemiripan dengan supplier: ${duplicateNames}. Lanjutkan?`,
        HttpStatus.CONFLICT,
      );
    }
  }

  async create(
    userId: bigint,
    dto: CreateSupplierDto,
    ip: string,
    ua: string,
  ): Promise<Supplier> {
    const trimmedName = dto.supplierName.trim();
    await this.checkDuplicateWarning(
      trimmedName,
      dto.phone,
      dto.forceSave ?? false,
    );

    return await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const supplier = await tx.supplier.create({
          data: {
            supplierName: trimmedName,
            phone: dto.phone,
            email: dto.email,
            address: dto.address,
            picName: dto.picName,
            isActive: true,
            createdBy: userId,
            createdAt: new Date(),
          },
        });

        const now = new Date();

        await tx.activityLog.create({
          data: {
            userId,
            activityType: 'CREATE_SUPPLIER',
            entityType: 'SUPPLIER',
            entityId: supplier.supplierId,
            description: `Membuat Supplier Baru: ${supplier.supplierName}`,
            createdAt: now,
          },
        });

        await tx.auditLog.create({
          data: {
            userId,
            action: 'CREATE',
            entityType: 'SUPPLIER',
            entityId: supplier.supplierId,
            changedFields: {
              supplierName: { new: supplier.supplierName },
              phone: { new: supplier.phone },
              address: { new: supplier.address },
            },
            ipAddress: ip,
            userAgent: ua,
            createdAt: now,
          },
        });

        return supplier;
      },
    );
  }

  async update(
    userId: bigint,
    supplierId: bigint,
    dto: UpdateSupplierDto,
    ip: string,
    ua: string,
  ): Promise<Supplier> {
    const existing = await this.prisma.supplier.findUnique({
      where: { supplierId },
    });
    if (!existing)
      throw new HttpException(
        'Supplier tidak ditemukan.',
        HttpStatus.NOT_FOUND,
      );

    // PERBAIKAN: Hapus perbandingan strict milidetik penyebab konflik 409.

    const trimmedName = dto.supplierName.trim();
    await this.checkDuplicateWarning(
      trimmedName,
      dto.phone,
      dto.forceSave ?? false,
      supplierId,
    );

    return await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const updated = await tx.supplier.update({
          where: { supplierId },
          data: {
            supplierName: trimmedName,
            phone: dto.phone,
            email: dto.email,
            address: dto.address,
            picName: dto.picName,
            updatedBy: userId,
            updatedAt: new Date(),
          },
        });

        const now = new Date();
        const changedFields: Record<string, AuditFieldChange> = {};

        if (existing.supplierName !== updated.supplierName) {
          changedFields.supplierName = {
            old: existing.supplierName,
            new: updated.supplierName,
          };
        }
        if (existing.phone !== updated.phone) {
          changedFields.phone = { old: existing.phone, new: updated.phone };
        }
        if (existing.address !== updated.address) {
          changedFields.address = {
            old: existing.address,
            new: updated.address,
          };
        }

        if (Object.keys(changedFields).length > 0) {
          await tx.activityLog.create({
            data: {
              userId,
              activityType: 'UPDATE_SUPPLIER',
              entityType: 'SUPPLIER',
              entityId: supplierId,
              description: `Memperbarui data Supplier: ${updated.supplierName}`,
              createdAt: now,
            },
          });

          await tx.auditLog.create({
            data: {
              userId,
              action: 'UPDATE',
              entityType: 'SUPPLIER',
              entityId: supplierId,
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
    supplierId: bigint,
    ip: string,
    ua: string,
  ): Promise<void> {
    const supplier = await this.prisma.supplier.findUnique({
      where: { supplierId },
      include: { financialSummary: true },
    });
    if (!supplier)
      throw new HttpException(
        'Supplier tidak ditemukan.',
        HttpStatus.NOT_FOUND,
      );
    if (!supplier.isActive)
      throw new HttpException(
        'Supplier sudah berstatus Inactive.',
        HttpStatus.BAD_REQUEST,
      );

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.supplier.update({
        where: { supplierId },
        data: { isActive: false, updatedBy: userId, updatedAt: new Date() },
      });

      const now = new Date();
      await tx.activityLog.create({
        data: {
          userId,
          activityType: 'INACTIVATE_SUPPLIER',
          entityType: 'SUPPLIER',
          entityId: supplierId,
          description: `Menonaktifkan Supplier: ${supplier.supplierName}`,
          createdAt: now,
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'INACTIVATE',
          entityType: 'SUPPLIER',
          entityId: supplierId,
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
    supplierId: bigint,
    ip: string,
    ua: string,
  ): Promise<void> {
    const supplier = await this.prisma.supplier.findUnique({
      where: { supplierId },
    });
    if (!supplier)
      throw new HttpException(
        'Supplier tidak ditemukan.',
        HttpStatus.NOT_FOUND,
      );
    if (supplier.isActive)
      throw new HttpException(
        'Supplier sudah berstatus Active.',
        HttpStatus.BAD_REQUEST,
      );

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.supplier.update({
        where: { supplierId },
        data: { isActive: true, updatedBy: userId, updatedAt: new Date() },
      });

      const now = new Date();
      await tx.activityLog.create({
        data: {
          userId,
          activityType: 'REACTIVATE_SUPPLIER',
          entityType: 'SUPPLIER',
          entityId: supplierId,
          description: `Mengaktifkan kembali Supplier: ${supplier.supplierName}`,
          createdAt: now,
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'REACTIVATE',
          entityType: 'SUPPLIER',
          entityId: supplierId,
          changedFields: { isActive: { old: false, new: true } },
          ipAddress: ip,
          userAgent: ua,
          createdAt: now,
        },
      });
    });
  }

  async findAll(query: SupplierQueryDto) {
    const page = parseInt(query.page || '1', 10);
    const limit = parseInt(query.limit || '20', 10);
    const skip = (page - 1) * limit;

    const where: Prisma.SupplierWhereInput = {};

    if (query.search) {
      where.OR = [
        { supplierName: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search } },
      ];
    }

    if (query.status === 'ACTIVE') where.isActive = true;
    if (query.status === 'INACTIVE') where.isActive = false;

    if (query.hasOutstandingAp === 'YES') {
      where.financialSummary = { isNot: null };
    } else if (query.hasOutstandingAp === 'NO') {
      where.financialSummary = { is: null };
    }

    const orderBy: Prisma.SupplierOrderByWithRelationInput = {};
    const sortField = query.sortBy || 'supplierName';
    const sortDir = query.sortDir || 'asc';

    if (sortField === 'supplierName') orderBy.supplierName = sortDir;
    else if (sortField === 'updatedAt') orderBy.updatedAt = sortDir;
    else orderBy.createdAt = 'desc';

    const [total, data] = await Promise.all([
      this.prisma.supplier.count({ where }),
      this.prisma.supplier.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: { financialSummary: true },
      }),
    ]);

    const mappedData = data.map((s) => {
      const summary =
        s.financialSummary as unknown as FinancialSummaryData | null;
      const outstandingAp = summary?.outstandingAmount
        ? Number(summary.outstandingAmount)
        : 0;

      return {
        supplierId: s.supplierId.toString(),
        supplierName: s.supplierName,
        phone: s.phone,
        email: s.email,
        address: s.address,
        picName: s.picName,
        isActive: s.isActive,
        outstandingAp: outstandingAp,
        updatedAt: s.updatedAt?.toISOString() || null,
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
}
