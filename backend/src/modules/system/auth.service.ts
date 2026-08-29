import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service.js';
import type { User, Prisma } from '../../../generated/prisma/client.js';
import { SESSION_ABSOLUTE_TTL_MS } from './auth.constants.js';
import {
  ACTIVITY_TYPES,
  SECURITY_EVENTS,
  writeActivityLog,
  writeSecurityLog,
} from '../../common/logging/business-logger.js';
import type { SecurityLogInput } from '../../common/logging/business-logger.js';
import type { PermissionCode } from '../../common/authorization/permission-catalog.js';

export interface AuthLoginParams {
  username: string;
  password: string;
  ip: string;
  userAgent: string;
  deviceId: string;
}

export interface AuthLoginResult {
  token: string;
  user: User;
}

@Injectable()
export class AuthService {
  private readonly DUMMY_HASH =
    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';

  constructor(private readonly prisma: PrismaService) {}

  async getEffectivePermissions(
    userId: bigint,
  ): Promise<(PermissionCode | '*')[]> {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: {
        role: {
          select: {
            roleCode: true,
            permissions: {
              where: { permission: { isActive: true } },
              select: { permission: { select: { permissionCode: true } } },
            },
          },
        },
      },
    });

    if (!user) return [];
    if (
      user.role.roleCode === 'SUPER_OWNER' ||
      user.role.roleCode === 'OWNER'
    ) {
      return ['*'];
    }

    return user.role.permissions
      .map((mapping) => mapping.permission.permissionCode as PermissionCode)
      .sort();
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async logSecurityEvent(
    userId: bigint | null,
    eventType: SecurityLogInput['eventType'],
    ipAddress: string,
    userAgent: string,
    success: boolean,
    description: string,
    reference?: string,
  ): Promise<void> {
    void userAgent;
    await writeSecurityLog(this.prisma, {
      userId: userId ?? undefined,
      eventType,
      ipAddress,
      success,
      description,
      reference,
    });
  }

  async login(dto: AuthLoginParams): Promise<AuthLoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });

    // 1. CEK STATUS AKUN TERKUNCI (FR-SYS-007)
    if (user) {
      const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
      const lockEvent = await this.prisma.securityLog.findFirst({
        where: {
          userId: user.userId,
          eventType: 'ACCOUNT_LOCKED',
          createdAt: { gte: tenMinsAgo },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (lockEvent) {
        const [unlockActivity, legacyUnlockEvent] = await Promise.all([
          this.prisma.activityLog.findFirst({
            where: {
              userId: user.userId,
              activityType: ACTIVITY_TYPES.UPDATE,
              entityType: 'USER',
              metadata: {
                path: ['securityAction'],
                equals: 'ACCOUNT_UNLOCKED',
              },
              createdAt: { gte: lockEvent.createdAt },
            },
          }),
          this.prisma.securityLog.findFirst({
            where: {
              userId: user.userId,
              eventType: 'ACCOUNT_UNLOCKED',
              createdAt: { gte: lockEvent.createdAt },
            },
          }),
        ]);

        if (!unlockActivity && !legacyUnlockEvent) {
          // PERBAIKAN: Hitung persis sisa menit untuk dilempar ke Frontend
          const remainingMs =
            lockEvent.createdAt.getTime() + 10 * 60 * 1000 - Date.now();
          const remainingMins = Math.ceil(remainingMs / 60000);

          await this.logSecurityEvent(
            user.userId,
            SECURITY_EVENTS.LOGIN_FAILED,
            dto.ip,
            dto.userAgent,
            false,
            'Akun masih dalam masa penguncian otomatis',
            user.username,
          );
          throw new HttpException(
            `Akun terkunci. Coba lagi dalam ${remainingMins} menit.`,
            HttpStatus.FORBIDDEN,
          );
        }
      }
    }

    const hashToCompare = user ? user.passwordHash : this.DUMMY_HASH;
    const isPasswordValid = await bcrypt.compare(dto.password, hashToCompare);

    if (!user) {
      await this.logSecurityEvent(
        null,
        SECURITY_EVENTS.LOGIN_FAILED,
        dto.ip,
        dto.userAgent,
        false,
        'Username tidak ditemukan',
        dto.username,
      );
      throw new HttpException(
        'Username atau Password salah.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (!user.isActive) {
      await this.logSecurityEvent(
        user.userId,
        SECURITY_EVENTS.LOGIN_FAILED,
        dto.ip,
        dto.userAgent,
        false,
        'Akun User dinonaktifkan',
        user.username,
      );
      throw new HttpException(
        'User telah dinonaktifkan. Hubungi Super Owner.',
        HttpStatus.FORBIDDEN,
      );
    }

    // 2. LOGIKA 10x GAGAL (DENGAN RESET COUNTER)
    if (!isPasswordValid) {
      const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);

      const lastUnlockActivity = await this.prisma.activityLog.findFirst({
        where: {
          userId: user.userId,
          activityType: ACTIVITY_TYPES.UPDATE,
          entityType: 'USER',
          metadata: {
            path: ['securityAction'],
            equals: 'ACCOUNT_UNLOCKED',
          },
          createdAt: { gte: fifteenMinsAgo },
        },
        orderBy: { createdAt: 'desc' },
      });

      const resetTimes = [
        fifteenMinsAgo,
        ...(user.lastLoginAt && user.lastLoginAt >= fifteenMinsAgo
          ? [user.lastLoginAt]
          : []),
        ...(lastUnlockActivity ? [lastUnlockActivity.createdAt] : []),
      ];
      const countFromTime = new Date(
        Math.max(...resetTimes.map((value) => value.getTime())),
      );

      const failedCount = await this.prisma.securityLog.count({
        where: {
          userId: user.userId,
          eventType: { in: ['LOGIN_ATTEMPT', SECURITY_EVENTS.LOGIN_FAILED] },
          success: false,
          OR: [
            { failureReason: 'Password salah' },
            { description: 'Password salah' },
          ],
          createdAt: { gte: countFromTime },
        },
      });

      await this.logSecurityEvent(
        user.userId,
        SECURITY_EVENTS.LOGIN_FAILED,
        dto.ip,
        dto.userAgent,
        false,
        'Password salah',
        user.username,
      );

      if (failedCount + 1 >= 10) {
        await this.logSecurityEvent(
          user.userId,
          SECURITY_EVENTS.ACCOUNT_LOCKED,
          dto.ip,
          dto.userAgent,
          false,
          '10x gagal login dalam 15 menit',
          user.username,
        );
        throw new HttpException(
          'Akun terkunci. Coba lagi dalam 10 menit.',
          HttpStatus.FORBIDDEN,
        );
      }

      throw new HttpException(
        'Username atau Password salah.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const plainToken = crypto.randomBytes(64).toString('base64url');
    // ... sisa logika pembuatan sesi tetap sama ...
    const tokenHash = this.hashToken(plainToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_ABSOLUTE_TTL_MS);

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const revokedSessions = await tx.userSession.updateMany({
        where: { userId: user.userId, revokedAt: null },
        data: { revokedAt: now, revokeReason: 'Login from another device' },
      });

      await tx.userSession.create({
        data: {
          userId: user.userId,
          sessionTokenHash: tokenHash,
          deviceIdentifier: dto.deviceId,
          ipAddress: dto.ip,
          userAgent: dto.userAgent,
          lastActivityAt: now,
          expiresAt,
        },
      });

      await tx.user.update({
        where: { userId: user.userId },
        data: { lastLoginAt: now, lastLoginIp: dto.ip },
      });

      await writeActivityLog(tx, {
        userId: user.userId,
        activityType: ACTIVITY_TYPES.LOGIN,
        module: 'SYSTEM',
        entityType: 'USER',
        entityId: user.userId,
        entityNumber: user.username,
        description: `Login user ${user.username}`,
      });
      if (revokedSessions.count > 0)
        await writeSecurityLog(tx, {
          userId: user.userId,
          eventType: SECURITY_EVENTS.CONCURRENT_LOGIN,
          ipAddress: dto.ip,
          description: 'Session sebelumnya dihentikan karena login baru',
          reference: user.username,
        });
    });

    return { token: plainToken, user };
  }
  async logout(token: string, ip: string, userAgent: string): Promise<void> {
    const tokenHash = this.hashToken(token);
    const session = await this.prisma.userSession.findUnique({
      where: { sessionTokenHash: tokenHash },
    });

    if (session && session.revokedAt === null) {
      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.userSession.update({
          where: { sessionId: session.sessionId },
          data: { revokedAt: new Date(), revokeReason: 'User Logout' },
        });

        void ip;
        void userAgent;
        await writeActivityLog(tx, {
          userId: session.userId,
          activityType: ACTIVITY_TYPES.LOGOUT,
          module: 'SYSTEM',
          entityType: 'USER',
          entityId: session.userId,
          description: 'Logout user',
        });
      });
    }
  }

  async unlockSession(
    token: string,
    password: string,
    ip: string,
    userAgent: string,
  ): Promise<{ success: boolean }> {
    const tokenHash = this.hashToken(token);

    const session = await this.prisma.userSession.findUnique({
      where: { sessionTokenHash: tokenHash },
      include: { user: true },
    });

    if (!session || session.revokedAt !== null) {
      // Jika token memang tidak valid/sudah mati, biarkan 401 agar ditendang Axios
      throw new HttpException(
        'Session tidak valid. Silakan Login kembali.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (!session.user.isActive) {
      throw new HttpException(
        'User telah dinonaktifkan. Hubungi Super Owner.',
        HttpStatus.FORBIDDEN,
      );
    }

    const now = new Date();
    const absoluteExpiresAt = new Date(
      session.createdAt.getTime() + SESSION_ABSOLUTE_TTL_MS,
    );
    if (now >= absoluteExpiresAt || now >= session.expiresAt) {
      await this.prisma.userSession.updateMany({
        where: { sessionId: session.sessionId, revokedAt: null },
        data: { revokedAt: now, revokeReason: 'Absolute session expired' },
      });
      throw new HttpException(
        'Session telah berakhir. Silakan Login kembali.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const isPasswordValid = await bcrypt.compare(
      password,
      session.user.passwordHash,
    );

    if (!isPasswordValid) {
      // LOGIKA 3x KESEMPATAN KHUSUS UNLOCK POPUP
      const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);

      const countFromTime =
        session.lastActivityAt >= fifteenMinsAgo
          ? session.lastActivityAt
          : fifteenMinsAgo;

      // Hitung khusus kegagalan UNLOCK
      const failedCount = await this.prisma.securityLog.count({
        where: {
          userId: session.userId,
          eventType: { in: ['UNLOCK_FAILED', SECURITY_EVENTS.LOGIN_FAILED] },
          success: false,
          OR: [
            { failureReason: 'Password salah saat unlock' },
            { description: 'Password salah saat membuka session' },
          ],
          createdAt: { gte: countFromTime },
        },
      });

      await this.logSecurityEvent(
        session.userId,
        SECURITY_EVENTS.LOGIN_FAILED,
        ip,
        userAgent,
        false,
        'Password salah saat membuka session',
        session.user.username,
      );

      // JIKA GAGAL 3x, KUNCI AKUN & CABUT SESI (TENDANG)
      if (failedCount + 1 >= 3) {
        await this.logSecurityEvent(
          session.userId,
          SECURITY_EVENTS.ACCOUNT_LOCKED,
          ip,
          userAgent,
          false,
          '3x gagal unlock dalam 15 menit',
          session.user.username,
        );

        await this.prisma.userSession.update({
          where: { sessionId: session.sessionId },
          data: {
            revokedAt: new Date(),
            revokeReason: 'Akun Terkunci (Brute-Force Unlock)',
          },
        });

        // Melempar kata "terkunci" dengan 403 agar ditangkap oleh Popup Frontend untuk tendangan pamungkas
        throw new HttpException(
          'Akun terkunci akibat 3x salah password.',
          HttpStatus.FORBIDDEN,
        );
      }

      // PERBAIKAN KRUSIAL: Gunakan BAD_REQUEST (400) agar Axios Interceptor 401 tidak menendang user!
      const sisa = 3 - (failedCount + 1);
      throw new HttpException(
        `Password salah. Sisa kesempatan: ${sisa}x`,
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.prisma.userSession.update({
      where: { sessionId: session.sessionId },
      data: { lastActivityAt: now },
    });

    void ip;
    void userAgent;

    return { success: true };
  }
}
