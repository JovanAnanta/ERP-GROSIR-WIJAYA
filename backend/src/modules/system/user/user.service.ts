import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import type {
  User,
  Role,
  Prisma,
} from '../../../../generated/prisma/client.js';
import * as bcrypt from 'bcrypt';

export type CurrentUserWithRole = User & { role: Role };

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  // =========================================================================
  // HELPER: Hak Akses (Hierarchical Role Authorization)
  // =========================================================================
  private checkPermission(
    currentUser: CurrentUserWithRole,
    targetRoleCode: string,
    action: string,
  ): void {
    const actorRole = currentUser.role.roleCode;

    if (actorRole === 'SUPER_OWNER') {
      if (action === 'CREATE' && targetRoleCode === 'SUPER_OWNER') {
        throw new HttpException(
          'Super Owner hanya dapat dibuat saat inisialisasi sistem.',
          HttpStatus.FORBIDDEN,
        );
      }
      return; // Super Owner bisa segalanya selain buat Super Owner baru
    }

    if (actorRole === 'OWNER') {
      if (targetRoleCode === 'SUPER_OWNER' || targetRoleCode === 'OWNER') {
        throw new HttpException(
          'Anda tidak memiliki hak untuk mengelola role level Owner atau Super Owner.',
          HttpStatus.FORBIDDEN,
        );
      }
      return;
    }

    throw new HttpException(
      'Anda tidak memiliki hak untuk melakukan aksi ini.',
      HttpStatus.FORBIDDEN,
    );
  }

  // =========================================================================
  // HELPER: Logging
  // =========================================================================
  private async writeLogs(
    tx: Prisma.TransactionClient,
    currentUser: CurrentUserWithRole,
    activityType: string,
    description: string,
    entityId: bigint | null,
    changedFields: Record<string, unknown> | null,
    ip: string,
    ua: string,
  ): Promise<void> {
    const now = new Date();

    // 1. Activity Log (Operasional Sehari-hari)
    await tx.activityLog.create({
      data: {
        userId: currentUser.userId,
        activityType: activityType,
        entityType: 'USER',
        entityId: entityId,
        description: description,
        createdAt: now,
      },
    });

    // 2. Audit Log (Jejak Rekam Immutable)
    if (changedFields) {
      await tx.auditLog.create({
        data: {
          userId: currentUser.userId,
          action: activityType,
          entityType: 'USER',
          entityId: entityId ?? BigInt(0),
          changedFields: changedFields as Prisma.InputJsonValue,
          ipAddress: ip,
          userAgent: ua,
          createdAt: now,
        },
      });
    }
  }

  // =========================================================================
  // BUSINESS FLOW: Create User
  // =========================================================================
  async createUser(
    currentUser: CurrentUserWithRole,
    dto: {
      username: string;
      fullName: string;
      password: string;
      roleId: string;
    },
    ip: string,
    ua: string,
  ): Promise<User> {
    const targetRole = await this.prisma.role.findUnique({
      where: { roleId: BigInt(dto.roleId) },
    });
    if (!targetRole)
      throw new HttpException('Role tidak valid.', HttpStatus.BAD_REQUEST);

    this.checkPermission(currentUser, targetRole.roleCode, 'CREATE');

    const exist = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (exist)
      throw new HttpException('Username sudah digunakan.', HttpStatus.CONFLICT);

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(dto.password, salt);

    return await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const newUser = await tx.user.create({
          data: {
            username: dto.username,
            fullName: dto.fullName,
            passwordHash: passwordHash,
            roleId: targetRole.roleId,
            isActive: true,
            createdBy: currentUser.userId,
            createdAt: new Date(),
          },
        });

        await this.writeLogs(
          tx,
          currentUser,
          'CREATE',
          `Membuat user baru: ${newUser.username}`,
          newUser.userId,
          { username: newUser.username, role: targetRole.roleCode },
          ip,
          ua,
        );

        return newUser;
      },
    );
  }

  // =========================================================================
  // BUSINESS FLOW: Edit User
  // =========================================================================
  async updateUser(
    currentUser: CurrentUserWithRole,
    targetUserId: bigint,
    dto: {
      fullName: string;
      roleId: string;
      isActive: boolean;
      updatedAt: string;
    },
    ip: string,
    ua: string,
  ): Promise<User> {
    const existingUser = await this.prisma.user.findUnique({
      where: { userId: targetUserId },
      include: { role: true },
    });

    if (!existingUser)
      throw new HttpException('User tidak ditemukan.', HttpStatus.NOT_FOUND);

    const targetRole = await this.prisma.role.findUnique({
      where: { roleId: BigInt(dto.roleId) },
    });
    if (!targetRole)
      throw new HttpException('Role baru tidak valid.', HttpStatus.BAD_REQUEST);

    // Validasi izin terhadap role lama DAN role baru
    this.checkPermission(currentUser, existingUser.role.roleCode, 'UPDATE');
    this.checkPermission(currentUser, targetRole.roleCode, 'UPDATE');

    // Optimistic Concurrency Control (FR-SYS-002)
    const currentDbTime = existingUser.updatedAt
      ? existingUser.updatedAt.getTime().toString()
      : '0';
    if (currentDbTime !== dto.updatedAt) {
      throw new HttpException(
        'Data User telah berubah oleh transaksi lain. Silakan Refresh.',
        HttpStatus.CONFLICT,
      );
    }

    return await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const updatedUser = await tx.user.update({
          where: { userId: targetUserId },
          data: {
            fullName: dto.fullName,
            roleId: targetRole.roleId,
            isActive: dto.isActive,
            updatedBy: currentUser.userId,
            updatedAt: new Date(),
          },
        });

        const changedFields = {
          fullName: { old: existingUser.fullName, new: updatedUser.fullName },
          roleId: {
            old: existingUser.roleId.toString(),
            new: updatedUser.roleId.toString(),
          },
          isActive: { old: existingUser.isActive, new: updatedUser.isActive },
        };

        await this.writeLogs(
          tx,
          currentUser,
          'UPDATE',
          `Mengubah data user: ${existingUser.username}`,
          targetUserId,
          changedFields,
          ip,
          ua,
        );

        return updatedUser;
      },
    );
  }

  // =========================================================================
  // BUSINESS FLOW: Disable User & Reset Password & Sessions
  // =========================================================================
  async disableUser(
    currentUser: CurrentUserWithRole,
    targetUserId: bigint,
    ip: string,
    ua: string,
  ): Promise<void> {
    const target = await this.prisma.user.findUnique({
      where: { userId: targetUserId },
      include: { role: true },
    });
    if (!target)
      throw new HttpException('User tidak ditemukan.', HttpStatus.NOT_FOUND);
    this.checkPermission(currentUser, target.role.roleCode, 'DISABLE');

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.user.update({
        where: { userId: targetUserId },
        data: {
          isActive: false,
          updatedBy: currentUser.userId,
          updatedAt: new Date(),
        },
      });

      // Hentikan semua session aktif (FR-SYS-002)
      await tx.userSession.updateMany({
        where: { userId: targetUserId, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: 'User Disabled by Admin' },
      });

      await this.writeLogs(
        tx,
        currentUser,
        'DISABLE',
        `Menonaktifkan user: ${target.username}`,
        targetUserId,
        { isActive: { old: true, new: false } },
        ip,
        ua,
      );
    });
  }

  async resetPassword(
    currentUser: CurrentUserWithRole,
    targetUserId: bigint,
    newPassword: string,
    ip: string,
    ua: string,
  ): Promise<void> {
    const target = await this.prisma.user.findUnique({
      where: { userId: targetUserId },
      include: { role: true },
    });
    if (!target)
      throw new HttpException('User tidak ditemukan.', HttpStatus.NOT_FOUND);

    // Pengecualian FR: Owner bisa reset password dirinya sendiri
    if (currentUser.userId !== targetUserId) {
      this.checkPermission(currentUser, target.role.roleCode, 'RESET_PASSWORD');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.user.update({
        where: { userId: targetUserId },
        data: {
          passwordHash: passwordHash,
          updatedBy: currentUser.userId,
          updatedAt: new Date(),
        },
      });

      await tx.userSession.updateMany({
        where: { userId: targetUserId, revokedAt: null },
        data: {
          revokedAt: new Date(),
          revokeReason: 'Password Reset',
        },
      });

      await this.writeLogs(
        tx,
        currentUser,
        'RESET_PASSWORD',
        `Merubah password user: ${target.username}`,
        targetUserId,
        { password: 'RESET' },
        ip,
        ua,
      );
    });
  }

  async forceLogout(
    currentUser: CurrentUserWithRole,
    targetUserId: bigint,
    ip: string,
    ua: string,
  ): Promise<void> {
    const target = await this.prisma.user.findUnique({
      where: { userId: targetUserId },
      include: { role: true },
    });
    if (!target)
      throw new HttpException('User tidak ditemukan.', HttpStatus.NOT_FOUND);
    this.checkPermission(currentUser, target.role.roleCode, 'FORCE_LOGOUT');

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.userSession.updateMany({
        where: { userId: targetUserId, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: 'Force Logout by Admin' },
      });

      await this.writeLogs(
        tx,
        currentUser,
        'FORCE_LOGOUT',
        `Force logout user: ${target.username}`,
        targetUserId,
        { session: 'KILLED' },
        ip,
        ua,
      );
    });
  }

  async unlockSession(
    currentUser: CurrentUserWithRole,
    targetUserId: bigint,
    ip: string,
    ua: string,
  ): Promise<void> {
    const target = await this.prisma.user.findUnique({
      where: { userId: targetUserId },
      include: { role: true },
    });
    if (!target)
      throw new HttpException('User tidak ditemukan.', HttpStatus.NOT_FOUND);
    this.checkPermission(currentUser, target.role.roleCode, 'UNLOCK_SESSION');

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.userSession.updateMany({
        where: { userId: targetUserId, revokedAt: null },
        data: { lastActivityAt: new Date() },
      });

      // PERBAIKAN FR-007: Log ini secara otomatis mengangkat sanksi "ACCOUNT_LOCKED" 10 menit
      await tx.securityLog.create({
        data: {
          userId: targetUserId,
          eventType: 'ACCOUNT_UNLOCKED',
          ipAddress: ip,
          userAgent: ua,
          success: true,
        },
      });

      await this.writeLogs(
        tx,
        currentUser,
        'UNLOCK_SESSION',
        `Membuka session dan kunci akun user: ${target.username}`,
        targetUserId,
        { session: 'UNLOCKED' },
        ip,
        ua,
      );
    });
  }
  // =========================================================================
  // BUSINESS FLOW: Read (List)
  // =========================================================================
  async getAllUsers(): Promise<Omit<User, 'passwordHash'>[]> {
    const users = await this.prisma.user.findMany({
      include: { role: { select: { roleName: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return users.map((u) => {
      // PERBAIKAN: Menggunakan void untuk mengatasi rule no-unused-vars
      const { passwordHash, ...safeUser } = u;
      void passwordHash;
      return safeUser;
    });
  }
}
