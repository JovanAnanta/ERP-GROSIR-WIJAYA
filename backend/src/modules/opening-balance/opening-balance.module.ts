import { Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { OpeningBalanceController } from './opening-balance.controller.js';
import { OpeningBalanceService } from './opening-balance.service.js';

@Module({
  controllers: [OpeningBalanceController],
  providers: [OpeningBalanceService, PrismaService],
})
export class OpeningBalanceModule {}
