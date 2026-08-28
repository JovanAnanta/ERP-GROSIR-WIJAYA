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
import { SupplierService } from './supplier.service.js';
import {
  CreateSupplierDto,
  UpdateSupplierDto,
  SupplierQueryDto,
} from './supplier/dto/supplier.dto.js';
import { SessionGuard } from '../../common/guards/session.guards.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PositiveBigIntPipe } from '../../common/pipes/positive-bigint.pipe.js';
import type { Request } from 'express';

interface AuthRequest extends Request {
  user: { userId: bigint; role: { roleCode: string } };
}

@Controller('suppliers')
@UseGuards(SessionGuard)
export class SupplierController {
  constructor(private readonly supplierService: SupplierService) {}

  @Get()
  @RequirePermissions('SUPPLIER_VIEW')
  async getAll(@Query() query: SupplierQueryDto) {
    const result = await this.supplierService.findAll(query);
    return { success: true, ...result };
  }

  @Post()
  @RequirePermissions('SUPPLIER_CREATE')
  async create(
    @Body() dto: CreateSupplierDto,
    @Req() req: AuthRequest,
    @Ip() ip: string | undefined,
    @Headers('user-agent') ua: string | undefined,
  ) {
    const safeIp = ip ?? req.socket.remoteAddress ?? 'UNKNOWN_IP';
    const safeUa = ua ?? 'UNKNOWN_BROWSER';
    const supplier = await this.supplierService.create(
      req.user.userId,
      dto,
      safeIp,
      safeUa,
    );

    return {
      success: true,
      message: 'Supplier berhasil ditambahkan.',
      data: { supplierId: supplier.supplierId.toString() },
    };
  }

  @Put(':id')
  @RequirePermissions('SUPPLIER_UPDATE')
  async update(
    @Param('id', PositiveBigIntPipe) id: string,
    @Body() dto: UpdateSupplierDto,
    @Req() req: AuthRequest,
    @Ip() ip: string | undefined,
    @Headers('user-agent') ua: string | undefined,
  ) {
    const safeIp = ip ?? req.socket.remoteAddress ?? 'UNKNOWN_IP';
    const safeUa = ua ?? 'UNKNOWN_BROWSER';
    await this.supplierService.update(
      req.user.userId,
      BigInt(id),
      dto,
      safeIp,
      safeUa,
    );

    return { success: true, message: 'Data Supplier berhasil diperbarui.' };
  }

  @Post(':id/inactivate')
  @RequirePermissions('SUPPLIER_INACTIVATE')
  async inactivate(
    @Param('id', PositiveBigIntPipe) id: string,
    @Req() req: AuthRequest,
    @Ip() ip: string | undefined,
    @Headers('user-agent') ua: string | undefined,
  ) {
    const safeIp = ip ?? req.socket.remoteAddress ?? 'UNKNOWN_IP';
    const safeUa = ua ?? 'UNKNOWN_BROWSER';
    await this.supplierService.inactivate(
      req.user.userId,
      BigInt(id),
      safeIp,
      safeUa,
    );

    return { success: true, message: 'Supplier berhasil dinonaktifkan.' };
  }

  @Post(':id/reactivate')
  @RequirePermissions('SUPPLIER_REACTIVATE')
  async reactivate(
    @Param('id', PositiveBigIntPipe) id: string,
    @Req() req: AuthRequest,
    @Ip() ip: string | undefined,
    @Headers('user-agent') ua: string | undefined,
  ) {
    const safeIp = ip ?? req.socket.remoteAddress ?? 'UNKNOWN_IP';
    const safeUa = ua ?? 'UNKNOWN_BROWSER';
    await this.supplierService.reactivate(
      req.user.userId,
      BigInt(id),
      safeIp,
      safeUa,
    );

    return { success: true, message: 'Supplier berhasil diaktifkan kembali.' };
  }
}
