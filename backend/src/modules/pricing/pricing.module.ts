import { Module } from '@nestjs/common';
import { PricingController } from './pricing.controller.js';
import { PricingService } from './pricing.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AliasController } from './alias.controller.js';
import { AliasService } from './alias.service.js';

@Module({
  controllers: [PricingController, AliasController],
  providers: [PricingService, PrismaService, AliasService],
})
export class PricingModule {}
