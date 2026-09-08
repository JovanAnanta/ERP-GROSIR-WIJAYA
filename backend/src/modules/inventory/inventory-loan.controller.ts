import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { PERMISSIONS } from '../../common/authorization/permission-catalog.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PermissionGuard } from '../../common/guards/permissions.guard.js';
import { SessionGuard } from '../../common/guards/session.guards.js';
import { PositiveBigIntPipe } from '../../common/pipes/positive-bigint.pipe.js';
import {
  CompleteInventoryLoanResolutionDto,
  InventoryLoanListQueryDto,
  SaveInventoryLoanDto,
} from './dto/inventory-loan.dto.js';
import { InventoryLoanService } from './inventory-loan.service.js';

interface AuthRequest extends Request {
  user: { userId: bigint };
}

@Controller('inventory/loans')
@UseGuards(SessionGuard, PermissionGuard)
export class InventoryLoanController {
  constructor(private readonly service: InventoryLoanService) {}
  private ip(req: Request) {
    return req.ip ?? req.socket.remoteAddress;
  }

  @Get('lookups')
  @RequirePermissions(PERMISSIONS.INVENTORY_LOAN_VIEW)
  lookups() {
    return this.service.lookups().then((data) => ({ success: true, data }));
  }

  @Get()
  @RequirePermissions(PERMISSIONS.INVENTORY_LOAN_VIEW)
  list(@Query() query: InventoryLoanListQueryDto) {
    return this.service
      .list(query)
      .then((result) => ({ success: true, ...result }));
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.INVENTORY_LOAN_VIEW)
  detail(@Param('id', PositiveBigIntPipe) id: string) {
    return this.service.detail(id).then((data) => ({ success: true, data }));
  }

  @Post()
  @RequirePermissions(PERMISSIONS.INVENTORY_LOAN_CREATE)
  create(@Body() dto: SaveInventoryLoanDto, @Req() req: AuthRequest) {
    return this.service
      .create(req.user.userId, dto, this.ip(req))
      .then((data) => ({
        success: true,
        message: 'Draft Inventory Loan berhasil dibuat.',
        data,
      }));
  }

  @Put(':id')
  @RequirePermissions(PERMISSIONS.INVENTORY_LOAN_UPDATE)
  update(
    @Param('id', PositiveBigIntPipe) id: string,
    @Body() dto: SaveInventoryLoanDto,
    @Req() req: AuthRequest,
  ) {
    return this.service
      .update(req.user.userId, id, dto, this.ip(req))
      .then((data) => ({
        success: true,
        message: 'Draft Inventory Loan berhasil diperbarui.',
        data,
      }));
  }

  @Post(':id/activate')
  @RequirePermissions(PERMISSIONS.INVENTORY_LOAN_ACTIVATE)
  activate(
    @Param('id', PositiveBigIntPipe) id: string,
    @Req() req: AuthRequest,
  ) {
    return this.service
      .activate(req.user.userId, id, this.ip(req))
      .then((data) => ({
        success: true,
        message: 'Inventory Loan aktif dan stok berhasil diproses.',
        data,
      }));
  }

  @Post(':id/cancel')
  @RequirePermissions(PERMISSIONS.INVENTORY_LOAN_UPDATE)
  cancel(@Param('id', PositiveBigIntPipe) id: string, @Req() req: AuthRequest) {
    return this.service
      .cancel(req.user.userId, id, this.ip(req))
      .then((data) => ({
        success: true,
        message: 'Draft Inventory Loan dibatalkan.',
        data,
      }));
  }

  @Post(':id/resolutions')
  @RequirePermissions(PERMISSIONS.INVENTORY_LOAN_RESOLVE)
  resolve(
    @Param('id', PositiveBigIntPipe) id: string,
    @Body() dto: CompleteInventoryLoanResolutionDto,
    @Req() req: AuthRequest,
  ) {
    return this.service
      .resolve(req.user.userId, id, dto, this.ip(req))
      .then((data) => ({
        success: true,
        message: 'Penyelesaian Inventory Loan berhasil diproses.',
        data,
      }));
  }
}
