import { Module } from '@nestjs/common';
import { PricingController } from './pricing.controller.js';
import { PricingService } from './pricing.service.js';
import { PrismaService } from '../../database/prisma.service.js';

@Module({
  controllers: [PricingController],
  providers: [PricingService, PrismaService],
})
export class PricingModule {}
