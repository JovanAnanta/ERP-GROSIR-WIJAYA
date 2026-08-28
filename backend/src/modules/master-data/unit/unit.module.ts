import { Module } from '@nestjs/common';
import { UnitController } from './unit.controller.js';
import { UnitService } from './unit.service.js';
import { PrismaService } from '../../../database/prisma.service.js';

@Module({
  controllers: [UnitController],
  providers: [UnitService, PrismaService],
})
export class UnitModule {}
