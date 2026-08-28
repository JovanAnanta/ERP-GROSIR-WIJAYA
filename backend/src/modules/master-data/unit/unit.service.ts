import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { CreateUnitDto, UpdateUnitDto, UnitQueryDto } from './dto/unit.dto.js';
import type { Prisma, Unit } from '../../../../generated/prisma/client.js';

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

        await tx.activityLog.create({
          data: {
            userId,
            activityType: 'CREATE_UNIT',
            entityType: 'UNIT',
            entityId: unit.unitId,
            description: `Membuat Master Unit Baru: ${unit.unitName}`,
            createdAt: new Date(),
          },
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
          await tx.activityLog.create({
            data: {
              userId,
              activityType: 'UPDATE_UNIT',
              entityType: 'UNIT',
              entityId: unitId,
              description: `Memperbarui Unit: ${existing.unitName} menjadi ${updated.unitName}`,
              createdAt: new Date(),
            },
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

      await tx.activityLog.create({
        data: {
          userId,
          activityType: 'INACTIVATE_UNIT',
          entityType: 'UNIT',
          entityId: unitId,
          description: `Menonaktifkan Unit: ${unit.unitName}`,
          createdAt: new Date(),
        },
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

      await tx.activityLog.create({
        data: {
          userId,
          activityType: 'REACTIVATE_UNIT',
          entityType: 'UNIT',
          entityId: unitId,
          description: `Mengaktifkan kembali Unit: ${unit.unitName}`,
          createdAt: new Date(),
        },
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
