import { Module } from '@nestjs/common';
import { SupplierController } from './supplier.controller.js';
import { SupplierService } from './supplier.service.js';
import { PrismaService } from '../../database/prisma.service.js';

@Module({
  controllers: [SupplierController],
  providers: [SupplierService, PrismaService],
})
export class SupplierModule {}
