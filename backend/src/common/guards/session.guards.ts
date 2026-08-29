import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../database/prisma.service.js';
import * as crypto from 'crypto';
import {
  SESSION_ABSOLUTE_TTL_MS,
  SESSION_COOKIE_NAME,
  SESSION_IDLE_TTL_MS,
} from '../../modules/system/auth.constants.js';
import { SECURITY_EVENTS } from '../logging/business-logger.js';

interface CookieRequest extends Request {
  cookies: Record<string, string | undefined>;
  user?: any; // Disederhanakan untuk keluwesan tipe
  sessionId?: bigint;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  private async logUnauthorized(
    request: CookieRequest,
    description: string,
    userId?: bigint,
  ) {
    const delegate = (
      this.prisma as unknown as {
        securityLog?: {
          create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
        };
      }
    ).securityLog;
    if (!delegate) return;
    await delegate.create({
      data: {
        userId,
        eventType: SECURITY_EVENTS.UNAUTHORIZED_API_ACCESS,
        ipAddress: request.ip ?? request.socket?.remoteAddress ?? 'UNKNOWN_IP',
        description,
        reference:
          `${request.method ?? 'UNKNOWN'} ${request.originalUrl ?? request.url ?? ''}`.trim(),
        success: false,
      },
    });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<CookieRequest>();

    const cookies = request.cookies ?? {};
    const token = cookies[SESSION_COOKIE_NAME];

    if (typeof token !== 'string' || !token) {
      await this.logUnauthorized(request, 'Request API tanpa session cookie');
      throw new HttpException(
        'Session tidak valid. Silakan Login kembali.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const session = await this.prisma.userSession.findUnique({
      where: { sessionTokenHash: tokenHash },
      include: { user: { include: { role: true } } },
    });

    if (!session || !session.user || session.revokedAt !== null) {
      await this.logUnauthorized(
        request,
        'Request API menggunakan session yang tidak valid atau telah dicabut',
        session?.userId,
      );
      throw new HttpException(
        'Session tidak valid atau telah berakhir. Silakan Login kembali.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // PERBAIKAN: Mengecek truthiness untuk menghindari kegagalan konversi Boolean(1)
    if (!session.user.isActive) {
      await this.logUnauthorized(
        request,
        'Request API menggunakan akun yang tidak aktif',
        session.userId,
      );
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
      await this.logUnauthorized(
        request,
        'Request API menggunakan session yang telah kedaluwarsa',
        session.userId,
      );
      throw new HttpException(
        'Session telah berakhir. Silakan Login kembali.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const idleDuration = now.getTime() - session.lastActivityAt.getTime();
    if (idleDuration >= SESSION_IDLE_TTL_MS) {
      throw new HttpException('Session_Locked_Idle', HttpStatus.FORBIDDEN);
    }

    request.user = session.user;
    request.sessionId = session.sessionId;

    const touched = await this.prisma.userSession.updateMany({
      where: { sessionId: session.sessionId, revokedAt: null },
      data: { lastActivityAt: now },
    });
    if (touched.count !== 1) {
      await this.logUnauthorized(
        request,
        'Session dicabut ketika request sedang diverifikasi',
        session.userId,
      );
      throw new HttpException(
        'Session tidak valid atau telah berakhir. Silakan Login kembali.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    return true;
  }
}
