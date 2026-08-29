import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  SECURITY_EVENTS,
  writeSecurityLog,
} from '../logging/business-logger.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest<{
      user?: { userId?: bigint; role?: { roleCode?: string } };
      ip?: string;
      method?: string;
      originalUrl?: string;
      url?: string;
      socket?: { remoteAddress?: string };
    }>();
    const roleCode = request.user?.role?.roleCode;

    if (!roleCode || !requiredRoles.includes(roleCode)) {
      if (this.prisma)
        await writeSecurityLog(this.prisma, {
          userId: request.user?.userId,
          eventType: SECURITY_EVENTS.PERMISSION_DENIED,
          ipAddress:
            request.ip ?? request.socket?.remoteAddress ?? 'UNKNOWN_IP',
          description: `Role ${roleCode ?? 'UNKNOWN'} tidak memiliki hak akses`,
          reference:
            `${request.method ?? 'UNKNOWN'} ${request.originalUrl ?? request.url ?? ''}`.trim(),
          success: false,
        });
      throw new ForbiddenException(
        'Anda tidak memiliki hak akses untuk aksi ini.',
      );
    }

    return true;
  }
}
