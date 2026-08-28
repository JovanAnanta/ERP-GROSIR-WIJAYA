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
import { RequirePermissions } from '../../../common/decorators/permissions.decorator.js';
import type { Request } from 'express';

interface AuthRequest extends Request {
  user: { userId: bigint; role: { roleCode: string } };
}

@Controller('products')
@UseGuards(SessionGuard)
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  @RequirePermissions('PRODUCT_VIEW')
  async getAll(@Query() query: ProductQueryDto) {
    const result = await this.productService.findAll(query);
    return { success: true, ...result };
  }

  // TAMBAHAN: Rute Lookup Options untuk Form
  @Get('options/lookup')
  @RequirePermissions('PRODUCT_VIEW')
  async getLookupOptions() {
    const data = await this.productService.getLookupOptions();
    return { success: true, data };
  }

  @Post()
  @RequirePermissions('PRODUCT_CREATE')
  async create(@Body() dto: CreateProductDto, @Req() req: AuthRequest) {
    const product = await this.productService.create(req.user.userId, dto);
    return {
      success: true,
      message: 'Produk berhasil ditambahkan.',
      data: { productId: product.productId.toString() },
    };
  }

  @Put(':id')
  @RequirePermissions('PRODUCT_UPDATE')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @Req() req: AuthRequest,
  ) {
    await this.productService.update(req.user.userId, BigInt(id), dto);
    return { success: true, message: 'Produk berhasil diperbarui.' };
  }

  @Post(':id/inactivate')
  @RequirePermissions('PRODUCT_INACTIVATE')
  async inactivate(@Param('id') id: string, @Req() req: AuthRequest) {
    await this.productService.toggleStatus(req.user.userId, BigInt(id), false);
    return { success: true, message: 'Produk berhasil dinonaktifkan.' };
  }

  @Post(':id/reactivate')
  @RequirePermissions('PRODUCT_REACTIVATE')
  async reactivate(@Param('id') id: string, @Req() req: AuthRequest) {
    await this.productService.toggleStatus(req.user.userId, BigInt(id), true);
    return { success: true, message: 'Produk berhasil diaktifkan kembali.' };
  }

  @Post('import')
  @RequirePermissions('PRODUCT_CREATE') // Mengikuti hak akses membuat produk
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
