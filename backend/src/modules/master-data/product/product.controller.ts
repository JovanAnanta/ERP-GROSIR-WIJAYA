import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ProductService } from './product.service.js';
import {
  CreateProductDto,
  UpdateProductDto,
  ProductQueryDto,
  ImportProductsPayloadDto,
} from './dto/product.dto.js';
import { SessionGuard } from '../../../common/guards/session.guards.js';
import { PermissionGuard } from '../../../common/guards/permissions.guard.js';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator.js';
import { PERMISSIONS } from '../../../common/authorization/permission-catalog.js';
import { PositiveBigIntPipe } from '../../../common/pipes/positive-bigint.pipe.js';
import type { Request } from 'express';

interface AuthRequest extends Request {
  user: { userId: bigint; role: { roleCode: string } };
}

@Controller('products')
@UseGuards(SessionGuard, PermissionGuard)
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.MASTER_VIEW)
  async getAll(@Query() query: ProductQueryDto) {
    const result = await this.productService.findAll(query);
    return { success: true, ...result };
  }

  // TAMBAHAN: Rute Lookup Options untuk Form
  @Get('options/lookup')
  @RequirePermissions(PERMISSIONS.MASTER_VIEW)
  async getLookupOptions() {
    const data = await this.productService.getLookupOptions();
    return { success: true, data };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.MASTER_CREATE)
  async create(@Body() dto: CreateProductDto, @Req() req: AuthRequest) {
    const product = await this.productService.create(req.user.userId, dto);
    return {
      success: true,
      message: 'Produk berhasil ditambahkan.',
      data: { productId: product.productId.toString() },
    };
  }

  @Put(':id')
  @RequirePermissions(PERMISSIONS.MASTER_UPDATE)
  async update(
    @Param('id', PositiveBigIntPipe) id: string,
    @Body() dto: UpdateProductDto,
    @Req() req: AuthRequest,
  ) {
    await this.productService.update(req.user.userId, BigInt(id), dto);
    return { success: true, message: 'Produk berhasil diperbarui.' };
  }

  @Post(':id/inactivate')
  @RequirePermissions(PERMISSIONS.MASTER_UPDATE)
  async inactivate(
    @Param('id', PositiveBigIntPipe) id: string,
    @Req() req: AuthRequest,
  ) {
    await this.productService.toggleStatus(req.user.userId, BigInt(id), false);
    return { success: true, message: 'Produk berhasil dinonaktifkan.' };
  }

  @Post(':id/reactivate')
  @RequirePermissions(PERMISSIONS.MASTER_UPDATE)
  async reactivate(
    @Param('id', PositiveBigIntPipe) id: string,
    @Req() req: AuthRequest,
  ) {
    await this.productService.toggleStatus(req.user.userId, BigInt(id), true);
    return { success: true, message: 'Produk berhasil diaktifkan kembali.' };
  }

  @Post('import')
  @RequirePermissions(PERMISSIONS.MASTER_CREATE, PERMISSIONS.MASTER_UPDATE)
  async massImport(
    @Body() dto: ImportProductsPayloadDto,
    @Req() req: AuthRequest,
  ) {
    const result = await this.productService.massImport(req.user.userId, dto);
    return {
      success: true,
      message: `Proses import sukses! ${result.createdCount} produk dibuat dan ${result.updatedCount} produk diperbarui.`,
      data: result,
    };
  }
}
