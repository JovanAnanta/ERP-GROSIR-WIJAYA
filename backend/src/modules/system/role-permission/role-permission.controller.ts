import {
  Controller,
  Get,
  Put,
  Body,
  Req,
  Ip,
  Headers,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { RolePermissionService } from './role-permission.service.js';
import { UpdateRolePermissionDto } from './dto/role-permission.dto.js';
import { SessionGuard } from '../../../common/guards/session.guards.js';
import { RolesGuard } from '../../../common/guards/roles.guard.js';
import { RequireRoles } from '../../../common/decorators/roles.decorator.js';
import type { Request } from 'express';

interface AuthRequest extends Request {
  user: { userId: bigint; role: { roleCode: string } };
}

@Controller('role-permissions')
@RequireRoles('SUPER_OWNER')
@UseGuards(SessionGuard, RolesGuard)
export class RolePermissionController {
  constructor(private readonly rpService: RolePermissionService) {}

  @Get('admin')
  async getAdminPermissions(@Req() req: AuthRequest) {
    if (req.user.role.roleCode !== 'SUPER_OWNER') {
      throw new HttpException(
        'Hanya Super Owner yang dapat melihat halaman ini.',
        HttpStatus.FORBIDDEN,
      );
    }
    const data = await this.rpService.getAdminPermissions();
    return { success: true, data };
  }

  @Put('admin')
  async updateAdminPermissions(
    @Body() dto: UpdateRolePermissionDto,
    @Req() req: AuthRequest,
    @Ip() ip: string | undefined,
    @Headers('user-agent') ua: string | undefined,
  ) {
    if (req.user.role.roleCode !== 'SUPER_OWNER') {
      throw new HttpException(
        'Anda tidak memiliki hak untuk mengubah Permission.',
        HttpStatus.FORBIDDEN,
      );
    }

    const safeIp = ip ?? req.socket.remoteAddress ?? 'UNKNOWN_IP';
    const safeUa = ua ?? 'UNKNOWN_BROWSER';

    await this.rpService.updateAdminPermissions(
      req.user.userId,
      dto.oldPermissionIds,
      dto.newPermissionIds,
      safeIp,
      safeUa,
    );

    return { success: true, message: 'Permission berhasil diperbarui.' };
  }
}
