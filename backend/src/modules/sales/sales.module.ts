import { Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { SalesController } from './sales.controller.js';
import { SalesService } from './sales.service.js';
import { WhatsappImportService } from './whatsapp-import.service.js';
import { SalesReturnService } from './sales-return.service.js';

@Module({
  controllers: [SalesController],
  providers: [SalesService, SalesReturnService, PrismaService, WhatsappImportService],
})
export class SalesModule {}
