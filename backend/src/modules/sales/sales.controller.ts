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
import { SalesService } from './sales.service.js';
import { WhatsappImportService } from './whatsapp-import.service.js';
import { SalesReturnService } from './sales-return.service.js';
import { WhatsappImportDto } from './dto/whatsapp-import.dto.js';
import {
  ChangeSalesInvoiceStatusDto,
  CustomerOutstandingQueryDto,
  ProcessSalesInvoiceDto,
  ReceiveSalesPaymentDto,
  SalesListQueryDto,
  SaveSalesInvoiceDto,
  SaveSalesOrderDto,
  SaveSalesReturnDto,
} from './dto/sales.dto.js';
import { SessionGuard } from '../../common/guards/session.guards.js';
import { PermissionGuard } from '../../common/guards/permissions.guard.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PERMISSIONS } from '../../common/authorization/permission-catalog.js';
import { PositiveBigIntPipe } from '../../common/pipes/positive-bigint.pipe.js';

interface AuthRequest extends Request {
  user: { userId: bigint };
}

@Controller('sales')
@UseGuards(SessionGuard, PermissionGuard)
export class SalesController {
  constructor(
    private readonly sales: SalesService,
    private readonly whatsapp: WhatsappImportService,
    private readonly returns: SalesReturnService,
  ) {}

  @Post('import/whatsapp')
  @RequirePermissions(PERMISSIONS.SALES_VIEW, PERMISSIONS.SALES_IMPORT)
  importWhatsapp(@Body() dto: WhatsappImportDto) {
    return this.whatsapp.parse(dto);
  }

  @Get('lookups/customers')
  @RequirePermissions(PERMISSIONS.SALES_VIEW)
  async customers() {
    return { success: true, data: await this.sales.lookupCustomers() };
  }

  @Get('lookups/products')
  @RequirePermissions(PERMISSIONS.SALES_VIEW)
  async products(@Query('customerId') customerId?: string) {
    return { success: true, data: await this.sales.lookupProducts(customerId) };
  }

  @Get('lookups/financial-accounts')
  @RequirePermissions(PERMISSIONS.SALES_VIEW)
  async accounts() {
    return { success: true, data: await this.sales.lookupAccounts() };
  }

  @Get('lookups/orders')
  @RequirePermissions(PERMISSIONS.SALES_VIEW)
  async readyOrders() {
    return { success: true, data: await this.sales.lookupReadyOrders() };
  }

  @Get('customer-financial')
  @RequirePermissions(PERMISSIONS.CUSTOMER_FINANCIAL_VIEW)
  async customerOutstanding(@Query() query: CustomerOutstandingQueryDto) {
    return { success: true, ...(await this.sales.listCustomerOutstanding(query)) };
  }

  @Get('customer-financial/:customerId/invoices')
  @RequirePermissions(PERMISSIONS.CUSTOMER_FINANCIAL_VIEW)
  async customerOutstandingInvoices(
    @Param('customerId', PositiveBigIntPipe) customerId: string,
  ) {
    return {
      success: true,
      data: await this.sales.listCustomerOutstandingInvoices(BigInt(customerId)),
    };
  }

  @Get('invoices/:id/return-context')
  @RequirePermissions(PERMISSIONS.SALES_RETURN_VIEW)
  async returnContext(@Param('id', PositiveBigIntPipe) id: string) {
    return { success: true, data: await this.returns.context(BigInt(id)) };
  }

  @Get('returns')
  @RequirePermissions(PERMISSIONS.SALES_RETURN_VIEW)
  async salesReturns(@Query('page') page?: string, @Query('limit') limit?: string) {
    return { success: true, ...(await this.returns.list(Number(page) || 1, Number(limit) || 20)) };
  }

  @Get('returns/:id')
  @RequirePermissions(PERMISSIONS.SALES_RETURN_VIEW)
  async salesReturn(@Param('id', PositiveBigIntPipe) id: string) {
    return { success: true, data: await this.returns.find(BigInt(id)) };
  }

  @Post('invoices/:id/returns')
  @RequirePermissions(PERMISSIONS.SALES_RETURN_CREATE)
  async createSalesReturn(
    @Param('id', PositiveBigIntPipe) id: string,
    @Body() dto: SaveSalesReturnDto,
    @Req() req: AuthRequest,
  ) {
    return { success: true, message: 'Sales Return berhasil dibuat.', data: await this.returns.create(req.user.userId, BigInt(id), dto) };
  }

  @Post('returns/:id/complete')
  @RequirePermissions(PERMISSIONS.SALES_RETURN_COMPLETE)
  async completeSalesReturn(
    @Param('id', PositiveBigIntPipe) id: string,
    @Body() dto: SaveSalesReturnDto,
    @Req() req: AuthRequest,
  ) {
    return { success: true, message: 'Sales Return berhasil diselesaikan.', data: await this.returns.complete(req.user.userId, BigInt(id), dto) };
  }

  @Get('orders')
  @RequirePermissions(PERMISSIONS.SALES_VIEW)
  async orders(@Query() query: SalesListQueryDto) {
    return { success: true, ...(await this.sales.listOrders(query)) };
  }

  @Get('orders/:id')
  @RequirePermissions(PERMISSIONS.SALES_VIEW)
  async order(@Param('id', PositiveBigIntPipe) id: string) {
    return { success: true, data: await this.sales.findOrderById(BigInt(id)) };
  }

  @Post('orders')
  @RequirePermissions(PERMISSIONS.SALES_CREATE)
  async createOrder(@Body() dto: SaveSalesOrderDto, @Req() req: AuthRequest) {
    return {
      success: true,
      message: 'Sales Order berhasil dibuat.',
      data: await this.sales.createOrder(req.user.userId, dto),
    };
  }

  @Put('orders/:id')
  @RequirePermissions(PERMISSIONS.SALES_UPDATE)
  async updateOrder(
    @Param('id', PositiveBigIntPipe) id: string,
    @Body() dto: SaveSalesOrderDto,
    @Req() req: AuthRequest,
  ) {
    return {
      success: true,
      message: 'Sales Order berhasil diperbarui.',
      data: await this.sales.updateOrder(req.user.userId, BigInt(id), dto),
    };
  }

  @Post('orders/:id/cancel')
  @RequirePermissions(PERMISSIONS.SALES_APPROVE)
  async cancelOrder(
    @Param('id', PositiveBigIntPipe) id: string,
    @Req() req: AuthRequest,
  ) {
    return {
      success: true,
      message: 'Sales Order dibatalkan.',
      data: await this.sales.cancelOrder(req.user.userId, BigInt(id)),
    };
  }

  @Get('invoices')
  @RequirePermissions(PERMISSIONS.SALES_VIEW)
  async invoices(@Query() query: SalesListQueryDto) {
    return { success: true, ...(await this.sales.listInvoices(query)) };
  }

  @Get('invoices/:id')
  @RequirePermissions(PERMISSIONS.SALES_VIEW)
  async invoice(@Param('id', PositiveBigIntPipe) id: string) {
    return {
      success: true,
      data: await this.sales.findInvoiceById(BigInt(id)),
    };
  }

  @Post('invoices')
  @RequirePermissions(PERMISSIONS.SALES_CREATE)
  async createInvoice(
    @Body() dto: SaveSalesInvoiceDto,
    @Req() req: AuthRequest,
  ) {
    return {
      success: true,
      message: 'Sales Invoice berhasil dibuat.',
      data: await this.sales.createInvoice(req.user.userId, dto),
    };
  }

  @Put('invoices/:id')
  @RequirePermissions(PERMISSIONS.SALES_UPDATE)
  async updateInvoice(
    @Param('id', PositiveBigIntPipe) id: string,
    @Body() dto: SaveSalesInvoiceDto,
    @Req() req: AuthRequest,
  ) {
    return {
      success: true,
      message: 'Sales Invoice berhasil diperbarui.',
      data: await this.sales.updateInvoice(req.user.userId, BigInt(id), dto),
    };
  }

  @Post('invoices/:id/complete')
  @RequirePermissions(PERMISSIONS.SALES_APPROVE)
  async completeInvoice(
    @Param('id', PositiveBigIntPipe) id: string,
    @Req() req: AuthRequest,
  ) {
    return {
      success: true,
      message: 'Sales Invoice selesai. Stok dan FIFO telah diproses.',
      data: await this.sales.completeInvoice(req.user.userId, BigInt(id)),
    };
  }

  @Post('invoices/:id/status')
  @RequirePermissions(PERMISSIONS.SALES_APPROVE)
  async changeInvoiceStatus(
    @Param('id', PositiveBigIntPipe) id: string,
    @Body() dto: ChangeSalesInvoiceStatusDto,
    @Req() req: AuthRequest,
  ) {
    return {
      success: true,
      message: 'Status Sales Invoice berhasil diperbarui.',
      data: await this.sales.changeInvoiceStatus(
        req.user.userId,
        BigInt(id),
        dto,
      ),
    };
  }

  @Post('invoices/:id/process')
  @RequirePermissions(
    PERMISSIONS.SALES_APPROVE,
    PERMISSIONS.SALES_RECEIVE_PAYMENT,
  )
  async processInvoice(
    @Param('id', PositiveBigIntPipe) id: string,
    @Body() dto: ProcessSalesInvoiceDto,
    @Req() req: AuthRequest,
  ) {
    return {
      success: true,
      message: 'Sales Invoice berhasil diproses.',
      data: await this.sales.processInvoice(req.user.userId, BigInt(id), dto),
    };
  }

  @Post('invoices/:id/cancel')
  @RequirePermissions(PERMISSIONS.SALES_APPROVE)
  async cancelInvoice(
    @Param('id', PositiveBigIntPipe) id: string,
    @Req() req: AuthRequest,
  ) {
    return {
      success: true,
      message: 'Sales Invoice dibatalkan.',
      data: await this.sales.cancelInvoice(req.user.userId, BigInt(id)),
    };
  }

  @Post('invoices/:id/payments')
  @RequirePermissions(PERMISSIONS.SALES_RECEIVE_PAYMENT)
  async receivePayment(
    @Param('id', PositiveBigIntPipe) id: string,
    @Body() dto: ReceiveSalesPaymentDto,
    @Req() req: AuthRequest,
  ) {
    return {
      success: true,
      message: 'Pembayaran berhasil dicatat.',
      data: await this.sales.receivePayment(req.user.userId, BigInt(id), dto),
    };
  }
}
