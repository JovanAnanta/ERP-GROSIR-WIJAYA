import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../database/prisma.service.js';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator.js';
import {
  SECURITY_EVENTS,
  writeSecurityLog,
} from '../logging/business-logger.js';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Jika endpoint tidak diberi pelindung @RequirePermissions, loloskan
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: { userId: bigint; roleId: bigint; role: { roleCode: string } };
      ip?: string;
      method?: string;
      originalUrl?: string;
      url?: string;
      socket?: { remoteAddress?: string };
    }>();
    const user = request.user;

    if (!user) {
      await writeSecurityLog(this.prisma, {
        eventType: SECURITY_EVENTS.UNAUTHORIZED_API_ACCESS,
        ipAddress: request.ip ?? request.socket?.remoteAddress ?? 'UNKNOWN_IP',
        description: 'Permission diperiksa tanpa user terautentikasi',
        reference:
          `${request.method ?? 'UNKNOWN'} ${request.originalUrl ?? request.url ?? ''}`.trim(),
        success: false,
      });
      throw new ForbiddenException('Akses ditolak. Sesi tidak valid.');
    }

    // FR-SYS-003: Super Owner dan Owner memiliki Full Access (Bypass validasi)
    if (
      user.role.roleCode === 'SUPER_OWNER' ||
      user.role.roleCode === 'OWNER'
    ) {
      return true;
    }

    // Untuk Role lain (Admin), cek ke database apakah role tersebut punya permission yang diminta
    const hasPermissions = await this.prisma.rolePermission.count({
      where: {
        roleId: user.roleId,
        permission: {
          permissionCode: { in: requiredPermissions },
          isActive: true,
        },
      },
    });

    if (hasPermissions !== requiredPermissions.length) {
      await writeSecurityLog(this.prisma, {
        userId: user.userId,
        eventType: SECURITY_EVENTS.PERMISSION_DENIED,
        ipAddress: request.ip ?? request.socket?.remoteAddress ?? 'UNKNOWN_IP',
        description: `Permission tidak mencukupi: ${requiredPermissions.join(', ')}`,
        reference:
          `${request.method ?? 'UNKNOWN'} ${request.originalUrl ?? request.url ?? ''}`.trim(),
        success: false,
      });
      throw new ForbiddenException(
        'Anda tidak memiliki hak akses (Permission) untuk melakukan aksi ini.',
      );
    }

    return true;
  }
}
