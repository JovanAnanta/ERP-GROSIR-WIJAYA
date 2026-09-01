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
  InventoryListQueryDto,
  MovementHistoryQueryDto,
  SaveAdjustmentDto,
  SaveOpnameDto,
  SaveTransformationDto,
} from './dto/inventory.dto.js';
import { InventoryService } from './inventory.service.js';

interface AuthRequest extends Request {
  user: { userId: bigint };
}

@Controller('inventory')
@UseGuards(SessionGuard, PermissionGuard)
export class InventoryController {
  constructor(private readonly service: InventoryService) {}
  private ip(req: Request) {
    return req.ip ?? req.socket.remoteAddress;
  }

  @Get('lookups/products')
  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  async products(@Query('search') search?: string) {
    return { success: true, data: await this.service.getProductLookup(search) };
  }

  @Get('lookups/transformation-products')
  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  async transformationProducts() {
    return {
      success: true,
      data: await this.service.getTransformationLookup(),
    };
  }

  @Get('lookups/stock-filters')
  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  async stockFilters() {
    return { success: true, data: await this.service.getStockFilters() };
  }

  @Get('transformations')
  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  async transformations(@Query() query: InventoryListQueryDto) {
    return {
      success: true,
      ...((await this.service.listTransformations(query)) as object),
    };
  }

  @Get('transformations/:id')
  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  async transformation(@Param('id', PositiveBigIntPipe) id: string) {
    return { success: true, data: await this.service.getTransformation(id) };
  }

  @Post('transformations')
  @RequirePermissions(PERMISSIONS.INVENTORY_CREATE)
  async createTransformation(
    @Body() dto: SaveTransformationDto,
    @Req() req: AuthRequest,
  ) {
    return {
      success: true,
      message: 'Inventory Transformation berhasil diproses.',
      data: await this.service.createTransformation(
        req.user.userId,
        dto,
        this.ip(req),
      ),
    };
  }

  @Get('movement-history')
  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  async movementHistory(@Query() query: MovementHistoryQueryDto) {
    return {
      success: true,
      ...((await this.service.listStockHistory(query)) as object),
    };
  }

  @Get('movement-history/:productUnitId')
  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  async productMovements(
    @Param('productUnitId', PositiveBigIntPipe) productUnitId: string,
    @Query() query: MovementHistoryQueryDto,
  ) {
    return {
      success: true,
      ...((await this.service.listProductMovements(
        productUnitId,
        query,
      )) as object),
    };
  }

  @Get('lookups/suppliers')
  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  async suppliers() {
    return { success: true, data: await this.service.getSuppliers() };
  }

  @Get('lookups/supplier-catalog/:supplierId')
  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  async supplierCatalog(
    @Param('supplierId', PositiveBigIntPipe) supplierId: string,
  ) {
    return {
      success: true,
      data: await this.service.getSupplierCatalog(supplierId),
    };
  }

  @Get('adjustments')
  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  async adjustments(@Query() query: InventoryListQueryDto) {
    return {
      success: true,
      ...((await this.service.listAdjustments(query)) as object),
    };
  }

  @Get('adjustments/:id')
  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  async adjustment(@Param('id', PositiveBigIntPipe) id: string) {
    return { success: true, data: await this.service.getAdjustment(id) };
  }

  @Post('adjustments')
  @RequirePermissions(PERMISSIONS.INVENTORY_CREATE)
  async createAdjustment(
    @Body() dto: SaveAdjustmentDto,
    @Req() req: AuthRequest,
  ) {
    return {
      success: true,
      message: 'Stock Adjustment berhasil disimpan.',
      data: await this.service.createAdjustment(
        req.user.userId,
        dto,
        this.ip(req),
      ),
    };
  }

  @Put('adjustments/:id')
  @RequirePermissions(PERMISSIONS.INVENTORY_UPDATE)
  async updateAdjustment(
    @Param('id', PositiveBigIntPipe) id: string,
    @Body() dto: SaveAdjustmentDto,
    @Req() req: AuthRequest,
  ) {
    return {
      success: true,
      message: 'Stock Adjustment berhasil diperbarui.',
      data: await this.service.updateAdjustment(
        req.user.userId,
        id,
        dto,
        this.ip(req),
      ),
    };
  }

  @Post('adjustments/:id/approve')
  @RequirePermissions(PERMISSIONS.INVENTORY_APPROVE)
  async approveAdjustment(
    @Param('id', PositiveBigIntPipe) id: string,
    @Req() req: AuthRequest,
  ) {
    return {
      success: true,
      message: 'Stock Adjustment berhasil disetujui.',
      data: await this.service.approveAdjustment(
        req.user.userId,
        id,
        this.ip(req),
      ),
    };
  }

  @Post('adjustments/:id/cancel')
  @RequirePermissions(PERMISSIONS.INVENTORY_APPROVE)
  async cancelAdjustment(
    @Param('id', PositiveBigIntPipe) id: string,
    @Req() req: AuthRequest,
  ) {
    return {
      success: true,
      message: 'Stock Adjustment dibatalkan.',
      data: await this.service.cancelAdjustment(
        req.user.userId,
        id,
        this.ip(req),
      ),
    };
  }

  @Get('opnames')
  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  async opnames(@Query() query: InventoryListQueryDto) {
    return {
      success: true,
      ...((await this.service.listOpnames(query)) as object),
    };
  }

  @Get('opnames/:id')
  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  async opname(@Param('id', PositiveBigIntPipe) id: string) {
    return { success: true, data: await this.service.getOpname(id) };
  }

  @Post('opnames')
  @RequirePermissions(PERMISSIONS.INVENTORY_CREATE)
  async createOpname(@Body() dto: SaveOpnameDto, @Req() req: AuthRequest) {
    return {
      success: true,
      message: 'Stock Opname berhasil disimpan.',
      data: await this.service.createOpname(req.user.userId, dto, this.ip(req)),
    };
  }

  @Put('opnames/:id')
  @RequirePermissions(PERMISSIONS.INVENTORY_UPDATE)
  async updateOpname(
    @Param('id', PositiveBigIntPipe) id: string,
    @Body() dto: SaveOpnameDto,
    @Req() req: AuthRequest,
  ) {
    return {
      success: true,
      message: 'Stock Opname berhasil diperbarui.',
      data: await this.service.updateOpname(
        req.user.userId,
        id,
        dto,
        this.ip(req),
      ),
    };
  }

  @Get('opnames/:id/conflicts')
  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  async conflicts(@Param('id', PositiveBigIntPipe) id: string) {
    return { success: true, data: await this.service.checkOpname(id) };
  }

  @Post('opnames/:id/refresh-snapshots')
  @RequirePermissions(PERMISSIONS.INVENTORY_UPDATE)
  async refresh(
    @Param('id', PositiveBigIntPipe) id: string,
    @Req() req: AuthRequest,
  ) {
    return {
      success: true,
      message: 'Snapshot stok diperbarui tanpa menghapus hasil hitung.',
      data: await this.service.refreshOpnameSnapshots(req.user.userId, id),
    };
  }

  @Post('opnames/:id/approve')
  @RequirePermissions(PERMISSIONS.INVENTORY_APPROVE)
  async approveOpname(
    @Param('id', PositiveBigIntPipe) id: string,
    @Req() req: AuthRequest,
  ) {
    return {
      success: true,
      message: 'Stock Opname berhasil disetujui.',
      data: await this.service.approveOpname(req.user.userId, id, this.ip(req)),
    };
  }

  @Post('opnames/:id/cancel')
  @RequirePermissions(PERMISSIONS.INVENTORY_APPROVE)
  async cancelOpname(
    @Param('id', PositiveBigIntPipe) id: string,
    @Req() req: AuthRequest,
  ) {
    return {
      success: true,
      message: 'Stock Opname dibatalkan.',
      data: await this.service.cancelOpname(req.user.userId, id, this.ip(req)),
    };
  }
}
