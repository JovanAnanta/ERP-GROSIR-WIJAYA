import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import type { Prisma } from '../../../../generated/prisma/client.js';
import {
  ACTIVITY_TYPES,
  AUDIT_OPERATIONS,
  createAuditTransactionId,
} from '../../../common/logging/business-logger.js';
import { CONFIGURABLE_PERMISSION_CODES } from '../../../common/authorization/permission-catalog.js';

@Injectable()
export class RolePermissionService {
  constructor(private readonly prisma: PrismaService) {}

  async getAdminPermissions() {
    // 1. Ambil Role Admin
    const adminRole = await this.prisma.role.findUnique({
      where: { roleCode: 'ADMIN' },
    });
    if (!adminRole)
      throw new HttpException(
        'Role Admin tidak ditemukan',
        HttpStatus.NOT_FOUND,
      );

    // 2. Ambil Semua Master Permission
    const allPermissions = await this.prisma.permission.findMany({
      where: {
        isActive: true,
        permissionCode: { in: [...CONFIGURABLE_PERMISSION_CODES] },
      },
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
    });

    // 3. Ambil Permission yang saat ini dimiliki Admin
    const adminPerms = await this.prisma.rolePermission.findMany({
      where: {
        roleId: adminRole.roleId,
        permission: {
          isActive: true,
          permissionCode: { in: [...CONFIGURABLE_PERMISSION_CODES] },
        },
      },
      select: { permissionId: true },
    });
    const activePermIds = adminPerms.map((p) => p.permissionId.toString());

    return {
      roleId: adminRole.roleId.toString(),
      roleCode: adminRole.roleCode,
      allPermissions: allPermissions.map((p) => ({
        id: p.permissionId.toString(),
        code: p.permissionCode,
        name: p.permissionName,
        module: p.module,
        action: p.action,
      })),
      activePermissionIds: activePermIds,
    };
  }

  async updateAdminPermissions(
    actorId: bigint,
    oldPermIds: string[],
    newPermIds: string[],
    ip: string,
    ua: string,
  ): Promise<void> {
    const adminRole = await this.prisma.role.findUnique({
      where: { roleCode: 'ADMIN' },
    });
    if (!adminRole)
      throw new HttpException(
        'Role Admin tidak ditemukan',
        HttpStatus.NOT_FOUND,
      );

    if (newPermIds.length > 0) {
      const validPermissionCount = await this.prisma.permission.count({
        where: {
          permissionId: { in: newPermIds.map((id) => BigInt(id)) },
          isActive: true,
          permissionCode: { in: [...CONFIGURABLE_PERMISSION_CODES] },
        },
      });
      if (validPermissionCount !== newPermIds.length) {
        throw new HttpException(
          'Terdapat permission yang tidak valid atau tidak aktif.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // OPTIMISTIC CONCURRENCY CHECK (Array Validation Approach B)
      const currentDbPerms = await tx.rolePermission.findMany({
        where: {
          roleId: adminRole.roleId,
          permission: {
            isActive: true,
            permissionCode: { in: [...CONFIGURABLE_PERMISSION_CODES] },
          },
        },
      });
      const currentDbPermIds = currentDbPerms
        .map((p) => p.permissionId.toString())
        .sort();
      const expectedOldIds = [...oldPermIds].sort();

      if (JSON.stringify(currentDbPermIds) !== JSON.stringify(expectedOldIds)) {
        throw new HttpException(
          'Permission telah diubah oleh transaksi lain. Silakan Refresh.',
          HttpStatus.CONFLICT,
        );
      }

      if (
        JSON.stringify(currentDbPermIds) ===
        JSON.stringify([...newPermIds].sort())
      ) {
        return;
      }

      // Hanya mapping katalog aktif yang dikelola halaman ini. Mapping historis
      // yang sudah nonaktif tetap dipertahankan untuk menjaga auditability.
      await tx.rolePermission.deleteMany({
        where: {
          roleId: adminRole.roleId,
          permission: {
            permissionCode: { in: [...CONFIGURABLE_PERMISSION_CODES] },
          },
        },
      });

      // 2. Insert mapping permission baru
      if (newPermIds.length > 0) {
        const newMappings = newPermIds.map((pId) => ({
          roleId: adminRole.roleId,
          permissionId: BigInt(pId),
          createdBy: actorId,
        }));
        await tx.rolePermission.createMany({ data: newMappings });
      }

      const now = new Date();
      const transactionId = createAuditTransactionId();

      // 3. Tulis Activity Log
      await tx.activityLog.create({
        data: {
          userId: actorId,
          activityType: ACTIVITY_TYPES.UPDATE,
          module: 'SYSTEM',
          entityType: 'ROLE',
          entityId: adminRole.roleId,
          description: `Memperbarui permission untuk role ADMIN`,
          createdAt: now,
        },
      });

      const previousIds = new Set(expectedOldIds);
      const nextIds = new Set(newPermIds);
      const changedIds = [
        ...expectedOldIds.filter((id) => !nextIds.has(id)),
        ...newPermIds.filter((id) => !previousIds.has(id)),
      ];
      const changedPermissions = await tx.permission.findMany({
        where: { permissionId: { in: changedIds.map((id) => BigInt(id)) } },
        select: { permissionId: true, permissionCode: true },
      });

      // FR-SYS-003: satu audit record untuk setiap permission yang berubah,
      // semuanya memakai transactionId yang sama.
      for (const permission of changedPermissions) {
        const id = permission.permissionId.toString();
        const enabled = nextIds.has(id);
        await tx.auditLog.create({
          data: {
            userId: actorId,
            action: AUDIT_OPERATIONS.UPDATE,
            transactionId,
            module: 'SYSTEM',
            source: 'Updated via Role Permission',
            entityType: 'ROLE_PERMISSION',
            entityId: permission.permissionId,
            entityNumber: permission.permissionCode,
            changedFields: { enabled: { before: !enabled, after: enabled } },
            ipAddress: ip,
            userAgent: ua,
            createdAt: now,
          },
        });
      }
    });
  }
}
