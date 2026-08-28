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

interface CookieRequest extends Request {
  cookies: Record<string, string | undefined>;
  user?: any; // Disederhanakan untuk keluwesan tipe
  sessionId?: bigint;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<CookieRequest>();

    const cookies = request.cookies ?? {};
    const token = cookies['erp_session'];

    if (typeof token !== 'string' || !token) {
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
      throw new HttpException(
        'Session telah digunakan pada Device lain atau telah berakhir.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // PERBAIKAN: Mengecek truthiness untuk menghindari kegagalan konversi Boolean(1)
    if (!session.user.isActive) {
      throw new HttpException(
        'User telah dinonaktifkan. Hubungi Super Owner.',
        HttpStatus.FORBIDDEN,
      );
    }

    const now = new Date();

    if (now.getTime() > session.expiresAt.getTime()) {
      throw new HttpException('Session_Locked_Absolute', HttpStatus.FORBIDDEN);
    }

    const diffInMinutes =
      (now.getTime() - session.lastActivityAt.getTime()) / (1000 * 60);
    if (diffInMinutes > 30) {
      throw new HttpException('Session_Locked_Idle', HttpStatus.FORBIDDEN);
    }

    request.user = session.user;
    request.sessionId = session.sessionId;

    Promise.resolve(
      this.prisma.userSession.update({
        where: { sessionId: session.sessionId },
        data: { lastActivityAt: now },
      }),
    ).catch(() => {});

    return true;
  }
}
