import {
  Controller,
  Post,
  Put,
  Param,
  Body,
  Req,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PurchaseOrderService } from './purchase-order.service.js';
import { PurchaseInvoiceService } from './purchase-invoice.service.js';
import { PurchaseReturnService } from './purchase-return.service.js';
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  CreatePurchaseInvoiceDto,
  UpdatePurchaseInvoiceDto,
  AddInvoicePaymentDto,
  PurchaseInvoiceListQueryDto,
  PurchaseOrderListQueryDto,
  CompletePurchaseReturnDto,
  SavePurchaseReturnDto,
} from './dto/purchasing.dto.js';
import { SessionGuard } from '../../common/guards/session.guards.js';
import { PermissionGuard } from '../../common/guards/permissions.guard.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PERMISSIONS } from '../../common/authorization/permission-catalog.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Request } from 'express';
import { PositiveBigIntPipe } from '../../common/pipes/positive-bigint.pipe.js';

interface AuthRequest extends Request {
  user: { userId: bigint; role: { roleCode: string } };
}

@Controller('purchasing')
@UseGuards(SessionGuard, PermissionGuard)
export class PurchasingController {
  constructor(
    private readonly poService: PurchaseOrderService,
    private readonly piService: PurchaseInvoiceService,
    private readonly returnService: PurchaseReturnService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('invoices/:id/return-context')
  @RequirePermissions(PERMISSIONS.PURCHASE_VIEW)
  async getReturnContext(@Param('id', PositiveBigIntPipe) id: string) {
    return {
      success: true,
      data: await this.returnService.getInvoiceContext(id),
    };
  }

  @Get('invoices/:id/returns')
  @RequirePermissions(PERMISSIONS.PURCHASE_VIEW)
  async getInvoiceReturns(@Param('id', PositiveBigIntPipe) id: string) {
    return { success: true, data: await this.returnService.findByInvoice(id) };
  }

  @Post('returns')
  @RequirePermissions(PERMISSIONS.PURCHASE_CREATE)
  async createReturn(
    @Body() dto: SavePurchaseReturnDto,
    @Req() req: AuthRequest,
  ) {
    return {
      success: true,
      message: 'Purchase Return berhasil disimpan.',
      data: await this.returnService.create(req.user.userId, dto),
    };
  }

  @Put('returns/:id')
  @RequirePermissions(PERMISSIONS.PURCHASE_UPDATE)
  async updateReturn(
    @Param('id', PositiveBigIntPipe) id: string,
    @Body() dto: SavePurchaseReturnDto,
    @Req() req: AuthRequest,
  ) {
    return {
      success: true,
      message: 'Purchase Return berhasil diperbarui.',
      data: await this.returnService.update(req.user.userId, id, dto),
    };
  }

  @Post('returns/:id/ready')
  @RequirePermissions(PERMISSIONS.PURCHASE_APPROVE)
  async readyReturn(
    @Param('id', PositiveBigIntPipe) id: string,
    @Req() req: AuthRequest,
  ) {
    return {
      success: true,
      message: 'Barang retur telah diambil.',
      data: await this.returnService.markReady(req.user.userId, id),
    };
  }

  @Post('returns/:id/complete')
  @RequirePermissions(PERMISSIONS.PURCHASE_APPROVE)
  async completeReturn(
    @Param('id', PositiveBigIntPipe) id: string,
    @Body() dto: CompletePurchaseReturnDto,
    @Req() req: AuthRequest,
  ) {
    return {
      success: true,
      message: 'Purchase Return telah diselesaikan.',
      data: await this.returnService.complete(req.user.userId, id, dto),
    };
  }

  @Post('returns/:id/cancel')
  @RequirePermissions(PERMISSIONS.PURCHASE_APPROVE)
  async cancelReturn(
    @Param('id', PositiveBigIntPipe) id: string,
    @Req() req: AuthRequest,
  ) {
    return {
      success: true,
      message: 'Purchase Return dibatalkan.',
      data: await this.returnService.cancel(req.user.userId, id),
    };
  }

  @Get('returns/:id')
  @RequirePermissions(PERMISSIONS.PURCHASE_VIEW)
  async getReturn(@Param('id', PositiveBigIntPipe) id: string) {
    return { success: true, data: await this.returnService.findById(id) };
  }

  @Get('returns/:id/completion-options')
  @RequirePermissions(PERMISSIONS.PURCHASE_VIEW)
  async getReturnCompletionOptions(
    @Param('id', PositiveBigIntPipe) id: string,
  ) {
    return {
      success: true,
      data: await this.returnService.getCompletionOptions(id),
    };
  }

  @Get('list/supplier-summaries')
  @RequirePermissions(PERMISSIONS.PURCHASE_VIEW)
  async getSupplierSummaries() {
    const data = await this.piService.getSupplierSummaries();
    return { success: true, data };
  }

  @Get('list/invoices')
  @RequirePermissions(PERMISSIONS.PURCHASE_VIEW)
  async getInvoices(@Query() query: PurchaseInvoiceListQueryDto) {
    const result = await this.piService.findAll(query);
    return { success: true, ...result };
  }

  @Get('list/invoices/:id')
  @RequirePermissions(PERMISSIONS.PURCHASE_VIEW)
  async getInvoiceDetail(@Param('id', PositiveBigIntPipe) id: string) {
    const data = await this.piService.findById(id);
    return { success: true, data };
  }

  @Post('orders')
  @RequirePermissions(PERMISSIONS.PURCHASE_CREATE)
  async createPO(@Body() dto: CreatePurchaseOrderDto, @Req() req: AuthRequest) {
    const result = await this.poService.create(req.user.userId, dto);
    return {
      success: true,
      message: 'Purchase Order berhasil dibuat',
      data: result,
    };
  }

  @Put('orders/:id')
  @RequirePermissions(PERMISSIONS.PURCHASE_UPDATE)
  async updatePO(
    @Param('id', PositiveBigIntPipe) id: string,
    @Body() dto: UpdatePurchaseOrderDto,
    @Req() req: AuthRequest,
  ) {
    const result = await this.poService.update(req.user.userId, id, dto);
    return {
      success: true,
      message: 'Purchase Order berhasil diperbarui',
      data: result,
    };
  }

  @Get('orders')
  @RequirePermissions(PERMISSIONS.PURCHASE_VIEW)
  async getPOs(@Query() query: PurchaseOrderListQueryDto) {
    const result = await this.poService.findAll(query);
    return { success: true, ...result };
  }

  @Get('orders/:id')
  @RequirePermissions(PERMISSIONS.PURCHASE_VIEW)
  async getPODetail(@Param('id', PositiveBigIntPipe) id: string) {
    const data = await this.poService.findById(id);
    return { success: true, data };
  }

  @Post('invoices')
  @RequirePermissions(PERMISSIONS.PURCHASE_CREATE)
  async createInvoice(
    @Body() dto: CreatePurchaseInvoiceDto,
    @Req() req: AuthRequest,
  ) {
    const result = await this.piService.create(req.user.userId, dto);
    return {
      success: true,
      message: `Purchase Invoice berhasil diproses`,
      data: result,
    };
  }

  @Put('invoices/:id')
  @RequirePermissions(PERMISSIONS.PURCHASE_UPDATE)
  async updateInvoice(
    @Param('id', PositiveBigIntPipe) id: string,
    @Body() dto: UpdatePurchaseInvoiceDto,
    @Req() req: AuthRequest,
  ) {
    const result = await this.piService.update(req.user.userId, id, dto);
    return {
      success: true,
      message: `Purchase Invoice berhasil diperbarui`,
      data: result,
    };
  }

  @Post('invoices/:id/payments')
  @RequirePermissions(PERMISSIONS.PURCHASE_UPDATE)
  async addInvoicePayment(
    @Param('id', PositiveBigIntPipe) id: string,
    @Body() dto: AddInvoicePaymentDto,
    @Req() req: AuthRequest,
  ) {
    const result = await this.piService.addPayment(req.user.userId, id, dto);
    return {
      success: true,
      message: `Pembayaran berhasil diproses`,
      data: result,
    };
  }

  @Get('lookups/ready-orders')
  @RequirePermissions(PERMISSIONS.PURCHASE_CREATE)
  async getReadyOrders() {
    const orders = await this.prisma.purchaseOrder.findMany({
      where: { status: 'READY' },
      include: {
        supplier: { select: { supplierName: true } },
        details: {
          include: { productUnit: { include: { product: true, unit: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      data: orders.map((o) => ({
        purchaseOrderId: o.purchaseOrderId.toString(),
        purchaseOrderNumber: o.purchaseOrderNumber,
        supplierId: o.supplierId.toString(),
        supplierName: o.supplier.supplierName,
        items: o.details.map((d) => ({
          productId: d.productUnit.productId.toString(),
          productUnitId: d.productUnitId.toString(),
          productName: d.productUnit.product.productName,
          unitName: d.productUnit.unit.unitName,
          quantity: Number(d.quantity),
        })),
      })),
    };
  }

  @Get('lookups/financial-accounts')
  @RequirePermissions(PERMISSIONS.PURCHASE_CREATE)
  async getFinancialAccounts() {
    const accounts = await this.prisma.financialAccount.findMany({
      where: { isActive: true },
    });
    return {
      success: true,
      data: accounts.map((a) => ({
        financialAccountId: a.financialAccountId.toString(),
        accountName: a.accountName,
        accountType: a.accountType,
        currentBalance: Number(a.currentBalance),
      })),
    };
  }

  @Get('lookups/suppliers')
  @RequirePermissions(PERMISSIONS.PURCHASE_CREATE)
  async getSuppliersLookup() {
    const suppliers = await this.prisma.supplier.findMany({
      where: { isActive: true },
      select: { supplierId: true, supplierName: true },
      orderBy: { supplierName: 'asc' },
    });
    return {
      success: true,
      data: suppliers.map((s) => ({
        supplierId: s.supplierId.toString(),
        supplierName: s.supplierName,
      })),
    };
  }

  @Get('lookups/products')
  @RequirePermissions(PERMISSIONS.PURCHASE_CREATE)
  async getProductsLookup() {
    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      include: {
        productUnits: {
          where: { isActive: true },
          include: { unit: true, inventoryStocks: true },
        },
      },
      orderBy: { productName: 'asc' },
    });

    return {
      success: true,
      data: products.map((p) => ({
        productId: p.productId.toString(),
        productName: p.productName,
        units: p.productUnits.map((pu) => ({
          productUnitId: pu.productUnitId.toString(),
          unitName: pu.unit.unitName,
          availableQty:
            pu.inventoryStocks.length > 0
              ? Number(pu.inventoryStocks[0].availableQty)
              : 0,
        })),
      })),
    };
  }

  @Get('lookups/supplier-catalog/:supplierId')
  @RequirePermissions(PERMISSIONS.PURCHASE_CREATE)
  async getSupplierCatalog(
    @Param('supplierId', PositiveBigIntPipe) supplierId: string,
  ) {
    const data = await this.prisma.productSupplier.findMany({
      where: { supplierId: BigInt(supplierId), isActive: true },
      include: {
        product: { include: { productUnits: { include: { unit: true } } } },
      },
    });
    return {
      success: true,
      data: data.map((d) => ({
        productId: d.productId.toString(),
        productName: d.product.productName,
        units: d.product.productUnits.map((u) => ({
          productUnitId: u.productUnitId.toString(),
          unitName: u.unit.unitName,
        })),
      })),
    };
  }

  @Get('lookups/supplier-history/:supplierId')
  @RequirePermissions(PERMISSIONS.PURCHASE_CREATE)
  async getSupplierHistory(
    @Param('supplierId', PositiveBigIntPipe) supplierId: string,
  ) {
    const data = await this.prisma.supplierSuggestedCost.findMany({
      where: { supplierId: BigInt(supplierId) },
      include: { productUnit: { include: { product: true, unit: true } } },
    });
    return {
      success: true,
      data: data.map((d) => ({
        productId: d.productUnit.productId.toString(),
        productUnitId: d.productUnitId.toString(),
        productName: d.productUnit.product.productName,
        unitName: d.productUnit.unit.unitName,
        suggestedCost: Number(d.suggestedCost),
      })),
    };
  }
}
