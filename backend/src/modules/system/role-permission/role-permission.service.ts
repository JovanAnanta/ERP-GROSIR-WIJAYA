import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import type { Prisma } from '../../../../generated/prisma/client.js';

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
      where: { isActive: true },
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
    });

    // 3. Ambil Permission yang saat ini dimiliki Admin
    const adminPerms = await this.prisma.rolePermission.findMany({
      where: { roleId: adminRole.roleId },
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
        where: { roleId: adminRole.roleId },
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

      // 1. Hapus semua mapping permission lama
      await tx.rolePermission.deleteMany({
        where: { roleId: adminRole.roleId },
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

      // 3. Tulis Activity Log
      await tx.activityLog.create({
        data: {
          userId: actorId,
          activityType: 'ROLE_PERMISSION_UPDATED',
          entityType: 'ROLE',
          entityId: adminRole.roleId,
          description: `Memperbarui permission untuk role ADMIN`,
          createdAt: now,
        },
      });

      // 4. Tulis Audit Log
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'ROLE_PERMISSION_UPDATED',
          entityType: 'ROLE',
          entityId: adminRole.roleId,
          changedFields: {
            oldIds: expectedOldIds,
            newIds: [...newPermIds].sort(),
          },
          ipAddress: ip,
          userAgent: ua,
          createdAt: now,
        },
      });
    });
  }
}
