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
import { SystemConfigurationService } from './system-configuration.service.js';
import { UpdateSystemConfigurationDto } from './dto/system-configuration.dto.js';
import { SessionGuard } from '../../../common/guards/session.guards.js';
import { RolesGuard } from '../../../common/guards/roles.guard.js';
import { RequireRoles } from '../../../common/decorators/roles.decorator.js';
import type { Request } from 'express';

interface AuthRequest extends Request {
  user: { userId: bigint; role: { roleCode: string } };
}

@Controller('system-configuration')
@UseGuards(SessionGuard)
export class SystemConfigurationController {
  constructor(private readonly configService: SystemConfigurationService) {}

  @Get()
  async get() {
    const data = await this.configService.getConfig();
    return { success: true, data };
  }

  @Put()
  @RequireRoles('SUPER_OWNER')
  @UseGuards(RolesGuard)
  async update(
    @Body() dto: UpdateSystemConfigurationDto,
    @Req() req: AuthRequest,
    @Ip() ip: string | undefined,
    @Headers('user-agent') ua: string | undefined,
  ) {
    if (req.user.role.roleCode !== 'SUPER_OWNER') {
      throw new HttpException(
        'Hanya Super Owner yang dapat mengubah System Configuration.',
        HttpStatus.FORBIDDEN,
      );
    }

    const safeIp = ip ?? req.socket.remoteAddress ?? 'UNKNOWN_IP';
    const safeUa = ua ?? 'UNKNOWN_BROWSER';

    await this.configService.updateConfig(req.user.userId, dto, safeIp, safeUa);
    return {
      success: true,
      message: 'System Configuration berhasil diperbarui.',
    };
  }
}
