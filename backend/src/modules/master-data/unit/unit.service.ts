import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { CreateUnitDto, UpdateUnitDto, UnitQueryDto } from './dto/unit.dto.js';
import type { Prisma, Unit } from '../../../../generated/prisma/client.js';
import {
  ACTIVITY_TYPES,
  AUDIT_OPERATIONS,
  changedFields,
  createAuditTransactionId,
  writeActivityLog,
  writeAuditLog,
} from '../../../common/logging/business-logger.js';

@Injectable()
export class UnitService {
  constructor(private readonly prisma: PrismaService) {}

  // ===========================================================================
  // HELPER: Pengecekan Duplikat
  // ===========================================================================
  private async checkDuplicateWarning(
    name: string,
    forceSave: boolean,
    excludeId?: bigint,
  ) {
    if (forceSave) return;

    const trimmedName = name.trim();

    const duplicates = await this.prisma.unit.findMany({
      where: {
        AND: [
          excludeId ? { unitId: { not: excludeId } } : {},
          { unitName: { equals: trimmedName, mode: 'insensitive' } },
        ],
      },
      select: { unitId: true, unitName: true },
    });

    if (duplicates.length > 0) {
      const duplicateNames = duplicates.map((d) => d.unitName).join(', ');
      throw new HttpException(
        `DUPLICATE_WARNING: Ditemukan kemiripan dengan unit: ${duplicateNames}. Lanjutkan?`,
        HttpStatus.CONFLICT,
      );
    }
  }

  // ===========================================================================
  // 1. CREATE UNIT (FR-UNIT-001)
  // ===========================================================================
  async create(userId: bigint, dto: CreateUnitDto): Promise<Unit> {
    const trimmedName = dto.unitName.trim();
    if (trimmedName.length === 0)
      throw new HttpException(
        'Nama Unit tidak boleh hanya spasi.',
        HttpStatus.BAD_REQUEST,
      );

    await this.checkDuplicateWarning(trimmedName, dto.forceSave ?? false);

    return await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const unit = await tx.unit.create({
          data: {
            unitName: trimmedName,
            isActive: true,
            createdBy: userId,
            createdAt: new Date(),
          },
        });

        const transactionId = createAuditTransactionId();
        await writeActivityLog(tx, {
          userId,
          activityType: ACTIVITY_TYPES.CREATE,
          module: 'MASTER_DATA',
          entityType: 'UNIT',
          entityId: unit.unitId,
          entityNumber: unit.unitName,
          description: `Membuat unit ${unit.unitName}`,
        });
        await writeAuditLog(tx, {
          userId,
          transactionId,
          module: 'MASTER_DATA',
          operation: AUDIT_OPERATIONS.CREATE,
          entityType: 'UNIT',
          entityId: unit.unitId,
          entityNumber: unit.unitName,
          source: 'Created via Unit Master',
          changedFields: changedFields(null, unit, ['unitName', 'isActive']),
        });

        return unit;
      },
    );
  }

  // ===========================================================================
  // 2. UPDATE UNIT (FR-UNIT-002)
  // ===========================================================================
  async update(
    userId: bigint,
    unitId: bigint,
    dto: UpdateUnitDto,
  ): Promise<Unit> {
    const existing = await this.prisma.unit.findUnique({ where: { unitId } });
    if (!existing)
      throw new HttpException('Unit tidak ditemukan.', HttpStatus.NOT_FOUND);

    const trimmedName = dto.unitName.trim();
    if (trimmedName.length === 0)
      throw new HttpException(
        'Nama Unit tidak boleh hanya spasi.',
        HttpStatus.BAD_REQUEST,
      );

    await this.checkDuplicateWarning(
      trimmedName,
      dto.forceSave ?? false,
      unitId,
    );

    return await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        // PERBAIKAN: Menghapus blok variabel dummy "as any" yang memicu error linter
        const updated = await tx.unit.update({
          where: { unitId },
          data: {
            unitName: trimmedName,
            updatedBy: userId,
            updatedAt: new Date(),
          },
        });

        if (existing.unitName !== updated.unitName) {
          const transactionId = createAuditTransactionId();
          await writeActivityLog(tx, {
            userId,
            activityType: ACTIVITY_TYPES.UPDATE,
            module: 'MASTER_DATA',
            entityType: 'UNIT',
            entityId: unitId,
            entityNumber: updated.unitName,
            description: `Memperbarui unit ${updated.unitName}`,
          });
          await writeAuditLog(tx, {
            userId,
            transactionId,
            module: 'MASTER_DATA',
            operation: AUDIT_OPERATIONS.UPDATE,
            entityType: 'UNIT',
            entityId: unitId,
            entityNumber: updated.unitName,
            source: 'Updated via Unit Master',
            changedFields: changedFields(existing, updated, ['unitName']),
          });
        }

        return updated;
      },
    );
  }

  // ===========================================================================
  // 3. INACTIVATE UNIT
  // ===========================================================================
  async inactivate(userId: bigint, unitId: bigint): Promise<void> {
    const unit = await this.prisma.unit.findUnique({ where: { unitId } });
    if (!unit)
      throw new HttpException('Unit tidak ditemukan.', HttpStatus.NOT_FOUND);
    if (!unit.isActive)
      throw new HttpException(
        'Unit sudah berstatus Inactive.',
        HttpStatus.BAD_REQUEST,
      );

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.unit.update({
        where: { unitId },
        data: { isActive: false, updatedBy: userId, updatedAt: new Date() },
      });

      const transactionId = createAuditTransactionId();
      await writeActivityLog(tx, {
        userId,
        activityType: ACTIVITY_TYPES.UPDATE,
        module: 'MASTER_DATA',
        entityType: 'UNIT',
        entityId: unitId,
        entityNumber: unit.unitName,
        description: `Menonaktifkan unit ${unit.unitName}`,
      });
      await writeAuditLog(tx, {
        userId,
        transactionId,
        module: 'MASTER_DATA',
        operation: AUDIT_OPERATIONS.UPDATE,
        entityType: 'UNIT',
        entityId: unitId,
        entityNumber: unit.unitName,
        source: 'Updated via Unit Master',
        changedFields: changedFields(unit, { ...unit, isActive: false }, [
          'isActive',
        ]),
      });
    });
  }

  // ===========================================================================
  // 4. REACTIVATE UNIT
  // ===========================================================================
  async reactivate(userId: bigint, unitId: bigint): Promise<void> {
    const unit = await this.prisma.unit.findUnique({ where: { unitId } });
    if (!unit)
      throw new HttpException('Unit tidak ditemukan.', HttpStatus.NOT_FOUND);
    if (unit.isActive)
      throw new HttpException(
        'Unit sudah berstatus Active.',
        HttpStatus.BAD_REQUEST,
      );

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.unit.update({
        where: { unitId },
        data: { isActive: true, updatedBy: userId, updatedAt: new Date() },
      });

      const transactionId = createAuditTransactionId();
      await writeActivityLog(tx, {
        userId,
        activityType: ACTIVITY_TYPES.UPDATE,
        module: 'MASTER_DATA',
        entityType: 'UNIT',
        entityId: unitId,
        entityNumber: unit.unitName,
        description: `Mengaktifkan kembali unit ${unit.unitName}`,
      });
      await writeAuditLog(tx, {
        userId,
        transactionId,
        module: 'MASTER_DATA',
        operation: AUDIT_OPERATIONS.UPDATE,
        entityType: 'UNIT',
        entityId: unitId,
        entityNumber: unit.unitName,
        source: 'Updated via Unit Master',
        changedFields: changedFields(unit, { ...unit, isActive: true }, [
          'isActive',
        ]),
      });
    });
  }

  // ===========================================================================
  // 5. GET ALL UNIT LIST (FR-UNIT-003) - FULL LOAD
  // ===========================================================================
  async findAll(query: UnitQueryDto) {
    const where: Prisma.UnitWhereInput = {};

    if (query.search) {
      where.unitName = { contains: query.search, mode: 'insensitive' };
    }

    if (query.status === 'ACTIVE') where.isActive = true;
    if (query.status === 'INACTIVE') where.isActive = false;

    const sortField = query.sortBy || 'unitName';
    const sortDir = query.sortDir || 'asc';

    const orderBy: Prisma.UnitOrderByWithRelationInput = {};
    if (sortField === 'unitName') {
      orderBy.unitName = sortDir;
    } else if (sortField === 'totalProduct') {
      orderBy.productUnits = { _count: sortDir };
    } else if (sortField === 'updatedAt') {
      orderBy.updatedAt = sortDir;
    } else {
      orderBy.createdAt = 'desc';
    }

    const data = await this.prisma.unit.findMany({
      where,
      orderBy,
      include: { _count: { select: { productUnits: true } } },
    });

    const mappedData = data.map((u) => ({
      unitId: u.unitId.toString(),
      unitName: u.unitName,
      isActive: u.isActive,
      totalProduct: u._count.productUnits,
      updatedAt: u.updatedAt?.toISOString() || null,
    }));

    return {
      data: mappedData,
      totalData: mappedData.length,
    };
  }
}
