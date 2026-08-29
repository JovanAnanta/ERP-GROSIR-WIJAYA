import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  Body,
  Req,
  Ip,
  Headers,
  UseGuards,
} from '@nestjs/common';
import { BrandService } from './brand.service.js';
import {
  CreateBrandDto,
  UpdateBrandDto,
  BrandQueryDto,
} from './dto/brand.dto.js';
import { SessionGuard } from '../../../common/guards/session.guards.js';
import { PermissionGuard } from '../../../common/guards/permissions.guard.js';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator.js';
import { PERMISSIONS } from '../../../common/authorization/permission-catalog.js';
import { PositiveBigIntPipe } from '../../../common/pipes/positive-bigint.pipe.js';
import type { Request } from 'express';

interface AuthRequest extends Request {
  user: { userId: bigint; role: { roleCode: string } };
}

@Controller('brands')
@UseGuards(SessionGuard, PermissionGuard)
export class BrandController {
  constructor(private readonly brandService: BrandService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.MASTER_VIEW)
  async getAll(@Query() query: BrandQueryDto) {
    const result = await this.brandService.findAll(query);
    return { success: true, ...result };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.MASTER_CREATE)
  async create(
    @Body() dto: CreateBrandDto,
    @Req() req: AuthRequest,
    @Ip() ip: string | undefined,
    @Headers('user-agent') ua: string | undefined,
  ) {
    const safeIp = ip ?? req.socket.remoteAddress ?? 'UNKNOWN_IP';
    const brand = await this.brandService.create(
      req.user.userId,
      dto,
      safeIp,
      ua ?? 'UNKNOWN_BROWSER',
    );
    return {
      success: true,
      message: 'Merek berhasil ditambahkan.',
      data: { brandId: brand.brandId.toString() },
    };
  }

  @Put(':id')
  @RequirePermissions(PERMISSIONS.MASTER_UPDATE)
  async update(
    @Param('id', PositiveBigIntPipe) id: string,
    @Body() dto: UpdateBrandDto,
    @Req() req: AuthRequest,
    @Ip() ip: string | undefined,
    @Headers('user-agent') ua: string | undefined,
  ) {
    const safeIp = ip ?? req.socket.remoteAddress ?? 'UNKNOWN_IP';
    await this.brandService.update(
      req.user.userId,
      BigInt(id),
      dto,
      safeIp,
      ua ?? 'UNKNOWN_BROWSER',
    );
    return { success: true, message: 'Merek berhasil diperbarui.' };
  }

  @Post(':id/inactivate')
  @RequirePermissions(PERMISSIONS.MASTER_UPDATE)
  async inactivate(
    @Param('id', PositiveBigIntPipe) id: string,
    @Req() req: AuthRequest,
    @Ip() ip: string | undefined,
    @Headers('user-agent') ua: string | undefined,
  ) {
    await this.brandService.inactivate(
      req.user.userId,
      BigInt(id),
      ip ?? 'UNKNOWN_IP',
      ua ?? 'UNKNOWN_BROWSER',
    );
    return { success: true, message: 'Merek berhasil dinonaktifkan.' };
  }

  @Post(':id/reactivate')
  @RequirePermissions(PERMISSIONS.MASTER_UPDATE)
  async reactivate(
    @Param('id', PositiveBigIntPipe) id: string,
    @Req() req: AuthRequest,
    @Ip() ip: string | undefined,
    @Headers('user-agent') ua: string | undefined,
  ) {
    await this.brandService.reactivate(
      req.user.userId,
      BigInt(id),
      ip ?? 'UNKNOWN_IP',
      ua ?? 'UNKNOWN_BROWSER',
    );
    return { success: true, message: 'Merek berhasil diaktifkan kembali.' };
  }
}
