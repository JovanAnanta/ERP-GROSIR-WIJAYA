import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service.js';
import type { User, Prisma } from '../../../generated/prisma/client.js';

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
  // PERBAIKAN: Mendeklarasikan property DUMMY_HASH secara eksplisit untuk mencegah error TS2339
  private readonly DUMMY_HASH = '$2b$10$abcdefghijklmnopqrstuv';

  constructor(private readonly prisma: PrismaService) {}

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async logSecurityEvent(
    userId: bigint | null,
    eventType: string,
    ipAddress: string,
    userAgent: string,
    success: boolean,
    failureReason: string | null = null,
  ): Promise<void> {
    await this.prisma.securityLog.create({
      data: {
        userId,
        eventType,
        ipAddress,
        userAgent,
        success,
        failureReason,
      },
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
        const unlockEvent = await this.prisma.securityLog.findFirst({
          where: {
            userId: user.userId,
            eventType: 'ACCOUNT_UNLOCKED',
            createdAt: { gte: lockEvent.createdAt },
          },
        });

        if (!unlockEvent) {
          // PERBAIKAN: Hitung persis sisa menit untuk dilempar ke Frontend
          const remainingMs =
            lockEvent.createdAt.getTime() + 10 * 60 * 1000 - Date.now();
          const remainingMins = Math.ceil(remainingMs / 60000);

          await this.logSecurityEvent(
            user.userId,
            'LOGIN_ATTEMPT_BLOCKED',
            dto.ip,
            dto.userAgent,
            false,
            'Akun masih dalam masa penguncian otomatis',
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
        'LOGIN_ATTEMPT',
        dto.ip,
        dto.userAgent,
        false,
        'Username tidak ditemukan',
      );
      throw new HttpException(
        'Username atau Password salah.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (!user.isActive) {
      await this.logSecurityEvent(
        user.userId,
        'LOGIN_ATTEMPT',
        dto.ip,
        dto.userAgent,
        false,
        'Akun User dinonaktifkan',
      );
      throw new HttpException(
        'User telah dinonaktifkan. Hubungi Super Owner.',
        HttpStatus.FORBIDDEN,
      );
    }

    // 2. LOGIKA 10x GAGAL (DENGAN RESET COUNTER)
    if (!isPasswordValid) {
      const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);

      // PERBAIKAN: Cari kapan terakhir kali dia SUKSES login atau DI-UNLOCK
      const lastResetEvent = await this.prisma.securityLog.findFirst({
        where: {
          userId: user.userId,
          eventType: { in: ['LOGIN_SUCCESS', 'ACCOUNT_UNLOCKED'] },
          createdAt: { gte: fifteenMinsAgo },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Sistem HANYA menghitung kegagalan SETELAH dia terakhir kali sukses
      const countFromTime = lastResetEvent
        ? lastResetEvent.createdAt
        : fifteenMinsAgo;

      const failedCount = await this.prisma.securityLog.count({
        where: {
          userId: user.userId,
          eventType: 'LOGIN_ATTEMPT',
          success: false,
          failureReason: 'Password salah',
          createdAt: { gte: countFromTime },
        },
      });

      await this.logSecurityEvent(
        user.userId,
        'LOGIN_ATTEMPT',
        dto.ip,
        dto.userAgent,
        false,
        'Password salah',
      );

      if (failedCount + 1 >= 10) {
        await this.logSecurityEvent(
          user.userId,
          'ACCOUNT_LOCKED',
          dto.ip,
          dto.userAgent,
          false,
          '10x gagal login dalam 15 menit',
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
    const expiresAt = new Date(now.getTime() + 12 * 60 * 60 * 1000);

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.userSession.updateMany({
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

      await tx.securityLog.create({
        data: {
          userId: user.userId,
          eventType: 'LOGIN_SUCCESS',
          ipAddress: dto.ip,
          userAgent: dto.userAgent,
          success: true,
          failureReason: null,
        },
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

        await tx.securityLog.create({
          data: {
            userId: session.userId,
            eventType: 'LOGOUT',
            ipAddress: ip,
            userAgent: userAgent,
            success: true,
            failureReason: null,
          },
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

    const isPasswordValid = await bcrypt.compare(
      password,
      session.user.passwordHash,
    );

    if (!isPasswordValid) {
      // LOGIKA 3x KESEMPATAN KHUSUS UNLOCK POPUP
      const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);

      const lastResetEvent = await this.prisma.securityLog.findFirst({
        where: {
          userId: session.userId,
          eventType: { in: ['LOGIN_SUCCESS', 'ACCOUNT_UNLOCKED'] },
          createdAt: { gte: fifteenMinsAgo },
        },
        orderBy: { createdAt: 'desc' },
      });

      const countFromTime = lastResetEvent
        ? lastResetEvent.createdAt
        : fifteenMinsAgo;

      // Hitung khusus kegagalan UNLOCK
      const failedCount = await this.prisma.securityLog.count({
        where: {
          userId: session.userId,
          eventType: 'UNLOCK_FAILED',
          success: false,
          createdAt: { gte: countFromTime },
        },
      });

      await this.logSecurityEvent(
        session.userId,
        'UNLOCK_FAILED',
        ip,
        userAgent,
        false,
        'Password salah saat unlock',
      );

      // JIKA GAGAL 3x, KUNCI AKUN & CABUT SESI (TENDANG)
      if (failedCount + 1 >= 3) {
        await this.logSecurityEvent(
          session.userId,
          'ACCOUNT_LOCKED',
          ip,
          userAgent,
          false,
          '3x gagal unlock dalam 15 menit',
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

    // Jika password benar, refresh waktu kadaluarsa sesi
    const now = new Date();
    const newExpiresAt = new Date(now.getTime() + 12 * 60 * 60 * 1000);

    await this.prisma.userSession.update({
      where: { sessionId: session.sessionId },
      data: { lastActivityAt: now, expiresAt: newExpiresAt },
    });

    await this.logSecurityEvent(
      session.userId,
      'SESSION_UNLOCK',
      ip,
      userAgent,
      true,
      null,
    );

    return { success: true };
  }
}
