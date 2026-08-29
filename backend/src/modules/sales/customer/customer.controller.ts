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
import { CustomerService } from './customer.service.js';
import {
  CreateCustomerDto,
  UpdateCustomerDto,
  CustomerQueryDto,
} from './dto/customer.dto.js';
import { SessionGuard } from '../../../common/guards/session.guards.js';
import { PermissionGuard } from '../../../common/guards/permissions.guard.js';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator.js';
import { PERMISSIONS } from '../../../common/authorization/permission-catalog.js';
import { PositiveBigIntPipe } from '../../../common/pipes/positive-bigint.pipe.js';
import type { Request } from 'express';

interface AuthRequest extends Request {
  user: { userId: bigint; role: { roleCode: string } };
}

@Controller('customers')
@UseGuards(SessionGuard, PermissionGuard)
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SALES_VIEW)
  async getAll(@Query() query: CustomerQueryDto) {
    const result = await this.customerService.findAll(query);
    return { success: true, ...result };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.SALES_CREATE)
  async create(
    @Body() dto: CreateCustomerDto,
    @Req() req: AuthRequest,
    @Ip() ip: string | undefined,
    @Headers('user-agent') ua: string | undefined,
  ) {
    const safeIp = ip ?? req.socket.remoteAddress ?? 'UNKNOWN_IP';
    const safeUa = ua ?? 'UNKNOWN_BROWSER';
    const customer = await this.customerService.create(
      req.user.userId,
      dto,
      safeIp,
      safeUa,
    );

    return {
      success: true,
      message: 'Customer berhasil ditambahkan.',
      data: { customerId: customer.customerId.toString() },
    };
  }

  @Put(':id')
  @RequirePermissions(PERMISSIONS.SALES_UPDATE)
  async update(
    @Param('id', PositiveBigIntPipe) id: string,
    @Body() dto: UpdateCustomerDto,
    @Req() req: AuthRequest,
    @Ip() ip: string | undefined,
    @Headers('user-agent') ua: string | undefined,
  ) {
    const safeIp = ip ?? req.socket.remoteAddress ?? 'UNKNOWN_IP';
    const safeUa = ua ?? 'UNKNOWN_BROWSER';
    await this.customerService.update(
      req.user.userId,
      BigInt(id),
      dto,
      safeIp,
      safeUa,
    );

    return { success: true, message: 'Data Customer berhasil diperbarui.' };
  }

  @Post(':id/inactivate')
  @RequirePermissions(PERMISSIONS.SALES_UPDATE)
  async inactivate(
    @Param('id', PositiveBigIntPipe) id: string,
    @Req() req: AuthRequest,
    @Ip() ip: string | undefined,
    @Headers('user-agent') ua: string | undefined,
  ) {
    const safeIp = ip ?? req.socket.remoteAddress ?? 'UNKNOWN_IP';
    const safeUa = ua ?? 'UNKNOWN_BROWSER';
    await this.customerService.inactivate(
      req.user.userId,
      BigInt(id),
      safeIp,
      safeUa,
    );

    return { success: true, message: 'Customer berhasil dinonaktifkan.' };
  }

  @Post(':id/reactivate')
  @RequirePermissions(PERMISSIONS.SALES_UPDATE)
  async reactivate(
    @Param('id', PositiveBigIntPipe) id: string,
    @Req() req: AuthRequest,
    @Ip() ip: string | undefined,
    @Headers('user-agent') ua: string | undefined,
  ) {
    const safeIp = ip ?? req.socket.remoteAddress ?? 'UNKNOWN_IP';
    const safeUa = ua ?? 'UNKNOWN_BROWSER';
    await this.customerService.reactivate(
      req.user.userId,
      BigInt(id),
      safeIp,
      safeUa,
    );

    return { success: true, message: 'Customer berhasil diaktifkan kembali.' };
  }
}
