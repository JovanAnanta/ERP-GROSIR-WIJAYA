import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  CreateCustomerDto,
  UpdateCustomerDto,
  CustomerQueryDto,
} from './dto/customer.dto.js';
import type { Prisma, Customer } from '../../../../generated/prisma/client.js';

// Type khusus untuk mengakali Schema yang mungkin belum memiliki typing sempurna
type FinancialSummaryData = {
  outstandingAmount?: number | string | Prisma.Decimal;
};

// Type eksplisit yang 100% kompatibel dengan JSON (Menyelesaikan TS2322)
type AuditFieldChange = {
  old: string | null;
  new: string | null;
};

@Injectable()
export class CustomerService {
  constructor(private readonly prisma: PrismaService) {}

  // ===========================================================================
  // HELPER: Pengecekan Duplikat (FR-CUST-001 & FR-CUST-002)
  // ===========================================================================
  private async checkDuplicateWarning(
    name: string,
    phone: string | undefined,
    forceSave: boolean,
    excludeId?: bigint,
  ) {
    if (forceSave) return;

    const trimmedName = name.trim();

    const duplicates = await this.prisma.customer.findMany({
      where: {
        AND: [
          excludeId ? { customerId: { not: excludeId } } : {},
          {
            OR: [
              { customerName: { equals: trimmedName, mode: 'insensitive' } },
              phone ? { phone: phone } : { customerId: BigInt(-1) },
            ],
          },
        ],
      },
      select: { customerId: true, customerName: true, phone: true },
    });

    if (duplicates.length > 0) {
      const duplicateNames = duplicates
        .map((d) => `${d.customerName} (${d.phone ?? '-'})`)
        .join(', ');
      throw new HttpException(
        `DUPLICATE_WARNING: Ditemukan kemiripan dengan customer: ${duplicateNames}. Lanjutkan?`,
        HttpStatus.CONFLICT,
      );
    }
  }

  // ===========================================================================
  // 1. CREATE CUSTOMER (FR-CUST-001)
  // ===========================================================================
  async create(
    userId: bigint,
    dto: CreateCustomerDto,
    ip: string,
    ua: string,
  ): Promise<Customer> {
    const trimmedName = dto.customerName.trim();
    await this.checkDuplicateWarning(
      trimmedName,
      dto.phone,
      dto.forceSave ?? false,
    );

    return await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const customer = await tx.customer.create({
          data: {
            customerName: trimmedName,
            phone: dto.phone,
            address: dto.address,
            isActive: true,
            createdBy: userId,
            createdAt: new Date(),
          },
        });

        const now = new Date();

        await tx.activityLog.create({
          data: {
            userId,
            activityType: 'CREATE_CUSTOMER',
            entityType: 'CUSTOMER',
            entityId: customer.customerId,
            description: `Membuat Customer Baru: ${customer.customerName}`,
            createdAt: now,
          },
        });

        await tx.auditLog.create({
          data: {
            userId,
            action: 'CREATE',
            entityType: 'CUSTOMER',
            entityId: customer.customerId,
            changedFields: {
              customerName: { new: customer.customerName },
              phone: { new: customer.phone },
              address: { new: customer.address },
            },
            ipAddress: ip,
            userAgent: ua,
            createdAt: now,
          },
        });

        return customer;
      },
    );
  }

  // ===========================================================================
  // 2. UPDATE CUSTOMER (FR-CUST-002)
  // ===========================================================================
  async update(
    userId: bigint,
    customerId: bigint,
    dto: UpdateCustomerDto,
    ip: string,
    ua: string,
  ): Promise<Customer> {
    const existing = await this.prisma.customer.findUnique({
      where: { customerId },
    });
    if (!existing)
      throw new HttpException(
        'Customer tidak ditemukan.',
        HttpStatus.NOT_FOUND,
      );

    // PERBAIKAN: Hapus perbandingan strict milidetik yang menyebabkan false positive 409 Conflict.
    // Cukup pastikan data masih ada di database. Prisma @updatedAt akan otomatis memperbarui timestamp.

    const trimmedName = dto.customerName.trim();
    await this.checkDuplicateWarning(
      trimmedName,
      dto.phone,
      dto.forceSave ?? false,
      customerId,
    );

    return await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const updated = await tx.customer.update({
          where: { customerId },
          data: {
            customerName: trimmedName,
            phone: dto.phone,
            address: dto.address,
            updatedBy: userId,
            updatedAt: new Date(),
          },
        });

        const now = new Date();
        const changedFields: Record<string, AuditFieldChange> = {};

        if (existing.customerName !== updated.customerName) {
          changedFields.customerName = {
            old: existing.customerName,
            new: updated.customerName,
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
              activityType: 'UPDATE_CUSTOMER',
              entityType: 'CUSTOMER',
              entityId: customerId,
              description: `Memperbarui data Customer: ${updated.customerName}`,
              createdAt: now,
            },
          });

          await tx.auditLog.create({
            data: {
              userId,
              action: 'UPDATE',
              entityType: 'CUSTOMER',
              entityId: customerId,
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
  // ===========================================================================
  // 3. INACTIVATE CUSTOMER (FR-CUST-003)
  // ===========================================================================
  async inactivate(
    userId: bigint,
    customerId: bigint,
    ip: string,
    ua: string,
  ): Promise<void> {
    const customer = await this.prisma.customer.findUnique({
      where: { customerId },
      include: { financialSummary: true },
    });
    if (!customer)
      throw new HttpException(
        'Customer tidak ditemukan.',
        HttpStatus.NOT_FOUND,
      );
    if (!customer.isActive)
      throw new HttpException(
        'Customer sudah berstatus Inactive.',
        HttpStatus.BAD_REQUEST,
      );

    const summary =
      customer.financialSummary as unknown as FinancialSummaryData | null;
    const outstanding = summary?.outstandingAmount
      ? Number(summary.outstandingAmount)
      : 0;

    if (outstanding > 0) {
      throw new HttpException(
        'Customer tidak dapat dinonaktifkan karena masih memiliki Piutang (Outstanding AR).',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.customer.update({
        where: { customerId },
        data: { isActive: false, updatedBy: userId, updatedAt: new Date() },
      });

      const now = new Date();
      await tx.activityLog.create({
        data: {
          userId,
          activityType: 'INACTIVATE_CUSTOMER',
          entityType: 'CUSTOMER',
          entityId: customerId,
          description: `Menonaktifkan Customer: ${customer.customerName}`,
          createdAt: now,
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'INACTIVATE',
          entityType: 'CUSTOMER',
          entityId: customerId,
          changedFields: { isActive: { old: true, new: false } },
          ipAddress: ip,
          userAgent: ua,
          createdAt: now,
        },
      });
    });
  }

  // ===========================================================================
  // 4. REACTIVATE CUSTOMER (FR-CUST-004)
  // ===========================================================================
  async reactivate(
    userId: bigint,
    customerId: bigint,
    ip: string,
    ua: string,
  ): Promise<void> {
    const customer = await this.prisma.customer.findUnique({
      where: { customerId },
    });
    if (!customer)
      throw new HttpException(
        'Customer tidak ditemukan.',
        HttpStatus.NOT_FOUND,
      );
    if (customer.isActive)
      throw new HttpException(
        'Customer sudah berstatus Active.',
        HttpStatus.BAD_REQUEST,
      );

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.customer.update({
        where: { customerId },
        data: { isActive: true, updatedBy: userId, updatedAt: new Date() },
      });

      const now = new Date();
      await tx.activityLog.create({
        data: {
          userId,
          activityType: 'REACTIVATE_CUSTOMER',
          entityType: 'CUSTOMER',
          entityId: customerId,
          description: `Mengaktifkan kembali Customer: ${customer.customerName}`,
          createdAt: now,
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'REACTIVATE',
          entityType: 'CUSTOMER',
          entityId: customerId,
          changedFields: { isActive: { old: false, new: true } },
          ipAddress: ip,
          userAgent: ua,
          createdAt: now,
        },
      });
    });
  }

  // ===========================================================================
  // 5. GET CUSTOMER LIST (FR-CUST-006)
  // ===========================================================================
  async findAll(query: CustomerQueryDto) {
    const page = parseInt(query.page || '1', 10);
    const limit = parseInt(query.limit || '20', 10);
    const skip = (page - 1) * limit;

    const where: Prisma.CustomerWhereInput = {};

    if (query.search) {
      where.OR = [
        { customerName: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search } },
      ];
    }

    if (query.status === 'ACTIVE') where.isActive = true;
    if (query.status === 'INACTIVE') where.isActive = false;

    if (query.hasOutstandingAr === 'YES') {
      where.financialSummary = { isNot: null };
    } else if (query.hasOutstandingAr === 'NO') {
      where.financialSummary = { is: null };
    }

    const orderBy: Prisma.CustomerOrderByWithRelationInput = {};
    const sortField = query.sortBy || 'customerName';
    const sortDir = query.sortDir || 'asc';

    if (sortField === 'customerName') orderBy.customerName = sortDir;
    else if (sortField === 'updatedAt') orderBy.updatedAt = sortDir;
    else orderBy.createdAt = 'desc';

    const [total, data] = await Promise.all([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: { financialSummary: true },
      }),
    ]);

    const mappedData = data.map((c) => {
      const summary =
        c.financialSummary as unknown as FinancialSummaryData | null;
      const outstandingAr = summary?.outstandingAmount
        ? Number(summary.outstandingAmount)
        : 0;

      return {
        customerId: c.customerId.toString(),
        customerName: c.customerName,
        phone: c.phone,
        address: c.address,
        isActive: c.isActive,
        outstandingAr: outstandingAr,
        updatedAt: c.updatedAt?.toISOString() || null,
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
