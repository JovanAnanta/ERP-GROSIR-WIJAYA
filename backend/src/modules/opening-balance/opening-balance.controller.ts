import {
  Body,
  Controller,
  Get,
  Param,
  Post,
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
  CreateCustomerOpeningBalanceDto,
  CreateSupplierOpeningBalanceDto,
  OpeningBalanceCatalogQueryDto,
  SaveInventoryOpeningBalanceDto,
} from './dto/opening-balance.dto.js';
import { OpeningBalanceService } from './opening-balance.service.js';

interface AuthRequest extends Request {
  user: { userId: bigint };
}

@Controller('opening-balances')
@UseGuards(SessionGuard, PermissionGuard)
export class OpeningBalanceController {
  constructor(private readonly service: OpeningBalanceService) {}

  @Post('customers')
  @RequirePermissions(PERMISSIONS.SALES_OPENING_BALANCE_CREATE)
  async customer(
    @Req() req: AuthRequest,
    @Body() dto: CreateCustomerOpeningBalanceDto,
  ) {
    return {
      success: true,
      message: 'Saldo awal piutang customer berhasil dicatat.',
      data: await this.service.createCustomer(req.user.userId, dto),
    };
  }

  @Post('suppliers')
  @RequirePermissions(PERMISSIONS.PURCHASE_OPENING_BALANCE_CREATE)
  async supplier(
    @Req() req: AuthRequest,
    @Body() dto: CreateSupplierOpeningBalanceDto,
  ) {
    return {
      success: true,
      message: 'Saldo awal hutang supplier berhasil dicatat.',
      data: await this.service.createSupplier(req.user.userId, dto),
    };
  }

  @Get('inventory/catalog')
  @RequirePermissions(PERMISSIONS.FIFO_OPENING_BALANCE_VIEW)
  async catalog(@Query() query: OpeningBalanceCatalogQueryDto) {
    return {
      success: true,
      ...((await this.service.inventoryCatalog(query)) as object),
    };
  }

  @Get('inventory/draft')
  @RequirePermissions(PERMISSIONS.FIFO_OPENING_BALANCE_VIEW)
  async draft(@Req() req: AuthRequest) {
    return {
      success: true,
      data: await this.service.currentInventoryDraft(req.user.userId),
    };
  }

  @Post('inventory/draft')
  @RequirePermissions(PERMISSIONS.FIFO_OPENING_BALANCE_CREATE)
  async saveDraft(
    @Req() req: AuthRequest,
    @Body() dto: SaveInventoryOpeningBalanceDto,
  ) {
    return {
      success: true,
      message: 'Draft saldo awal tersimpan.',
      data: await this.service.saveInventoryDraft(req.user.userId, dto),
    };
  }

  @Post('inventory/:id/complete')
  @RequirePermissions(PERMISSIONS.FIFO_OPENING_BALANCE_POST)
  async complete(
    @Req() req: AuthRequest,
    @Param('id', PositiveBigIntPipe) id: string,
  ) {
    return {
      success: true,
      message: 'Saldo awal persediaan berhasil ditetapkan.',
      data: await this.service.completeInventory(req.user.userId, BigInt(id)),
    };
  }

  @Get('inventory/:id')
  @RequirePermissions(PERMISSIONS.FIFO_OPENING_BALANCE_VIEW)
  async detail(@Param('id', PositiveBigIntPipe) id: string) {
    return {
      success: true,
      data: await this.service.inventoryDetail(BigInt(id)),
    };
  }
}
