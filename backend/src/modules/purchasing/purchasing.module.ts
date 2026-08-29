import { Module } from '@nestjs/common';
import { PurchasingController } from './purchasing.controller.js';
import { PurchaseOrderService } from './purchase-order.service.js';
import { PurchaseInvoiceService } from './purchase-invoice.service.js';
import { PurchaseReturnService } from './purchase-return.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';

@Module({
  controllers: [PurchasingController],
  providers: [
    PurchaseOrderService,
    PurchaseInvoiceService,
    PurchaseReturnService,
    PrismaService,
    RolesGuard,
  ],
})
export class PurchasingModule {}
