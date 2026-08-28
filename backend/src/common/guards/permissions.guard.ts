import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../database/prisma.service.js';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator.js';

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

    const request = context
      .switchToHttp()
      .getRequest<{ user?: { roleId: bigint; role: { roleCode: string } } }>();
    const user = request.user;

    if (!user) {
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
      throw new ForbiddenException(
        'Anda tidak memiliki hak akses (Permission) untuk melakukan aksi ini.',
      );
    }

    return true;
  }
}
