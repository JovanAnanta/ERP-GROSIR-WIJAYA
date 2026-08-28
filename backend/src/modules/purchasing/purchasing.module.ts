import { Module } from '@nestjs/common';
import { PurchasingController } from './purchasing.controller.js';
import { PurchaseOrderService } from './purchase-order.service.js';
import { PurchaseInvoiceService } from './purchase-invoice.service.js';
import { PrismaService } from '../../database/prisma.service.js';

@Module({
  controllers: [PurchasingController],
  providers: [PurchaseOrderService, PurchaseInvoiceService, PrismaService],
})
export class PurchasingModule {}
