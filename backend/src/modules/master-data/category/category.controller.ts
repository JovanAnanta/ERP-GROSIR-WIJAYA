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
import { CategoryService } from './category.service.js';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  CategoryQueryDto,
} from './dto/category.dto.js';
import { SessionGuard } from '../../../common/guards/session.guards.js';
import { PermissionGuard } from '../../../common/guards/permissions.guard.js';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator.js';
import { PERMISSIONS } from '../../../common/authorization/permission-catalog.js';
import { PositiveBigIntPipe } from '../../../common/pipes/positive-bigint.pipe.js';
import type { Request } from 'express';

interface AuthRequest extends Request {
  user: { userId: bigint; role: { roleCode: string } };
}

@Controller('categories')
@UseGuards(SessionGuard, PermissionGuard)
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.MASTER_VIEW)
  async getAll(@Query() query: CategoryQueryDto) {
    const result = await this.categoryService.findAll(query);
    return { success: true, ...result };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.MASTER_CREATE)
  async create(
    @Body() dto: CreateCategoryDto,
    @Req() req: AuthRequest,
    @Ip() ip: string | undefined,
    @Headers('user-agent') ua: string | undefined,
  ) {
    const safeIp = ip ?? req.socket.remoteAddress ?? 'UNKNOWN_IP';
    const safeUa = ua ?? 'UNKNOWN_BROWSER';
    const category = await this.categoryService.create(
      req.user.userId,
      dto,
      safeIp,
      safeUa,
    );

    return {
      success: true,
      message: 'Category berhasil ditambahkan.',
      data: { categoryId: category.categoryId.toString() },
    };
  }

  @Put(':id')
  @RequirePermissions(PERMISSIONS.MASTER_UPDATE)
  async update(
    @Param('id', PositiveBigIntPipe) id: string,
    @Body() dto: UpdateCategoryDto,
    @Req() req: AuthRequest,
    @Ip() ip: string | undefined,
    @Headers('user-agent') ua: string | undefined,
  ) {
    const safeIp = ip ?? req.socket.remoteAddress ?? 'UNKNOWN_IP';
    const safeUa = ua ?? 'UNKNOWN_BROWSER';
    await this.categoryService.update(
      req.user.userId,
      BigInt(id),
      dto,
      safeIp,
      safeUa,
    );

    return { success: true, message: 'Category berhasil diperbarui.' };
  }

  // =========================================
  // TAMBAHAN: INACTIVATE & REACTIVATE ENDPOINTS
  // =========================================
  @Post(':id/inactivate')
  @RequirePermissions(PERMISSIONS.MASTER_UPDATE)
  async inactivate(
    @Param('id', PositiveBigIntPipe) id: string,
    @Req() req: AuthRequest,
    @Ip() ip: string | undefined,
    @Headers('user-agent') ua: string | undefined,
  ) {
    const safeIp = ip ?? req.socket.remoteAddress ?? 'UNKNOWN_IP';
    const safeUa = ua ?? 'UNKNOWN_BROWSER';
    await this.categoryService.inactivate(
      req.user.userId,
      BigInt(id),
      safeIp,
      safeUa,
    );

    return { success: true, message: 'Category berhasil dinonaktifkan.' };
  }

  @Post(':id/reactivate')
  @RequirePermissions(PERMISSIONS.MASTER_UPDATE)
  async reactivate(
    @Param('id', PositiveBigIntPipe) id: string,
    @Req() req: AuthRequest,
    @Ip() ip: string | undefined,
    @Headers('user-agent') ua: string | undefined,
  ) {
    const safeIp = ip ?? req.socket.remoteAddress ?? 'UNKNOWN_IP';
    const safeUa = ua ?? 'UNKNOWN_BROWSER';
    await this.categoryService.reactivate(
      req.user.userId,
      BigInt(id),
      safeIp,
      safeUa,
    );

    return { success: true, message: 'Category berhasil diaktifkan kembali.' };
  }
}
