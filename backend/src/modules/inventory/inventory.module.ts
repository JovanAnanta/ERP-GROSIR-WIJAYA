import { Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { InventoryController } from './inventory.controller.js';
import { InventoryService } from './inventory.service.js';
import { InventoryLoanController } from './inventory-loan.controller.js';
import { InventoryLoanService } from './inventory-loan.service.js';
import { SalesModule } from '../sales/sales.module.js';
import { PurchasingModule } from '../purchasing/purchasing.module.js';

@Module({
  imports: [SalesModule, PurchasingModule],
  controllers: [InventoryController, InventoryLoanController],
  providers: [InventoryService, InventoryLoanService, PrismaService],
  exports: [InventoryService],
})
export class InventoryModule {}
