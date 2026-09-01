import { Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { FifoController } from './fifo.controller.js';
import { FifoService } from './fifo.service.js';

@Module({
  controllers: [FifoController],
  providers: [FifoService, PrismaService],
})
export class FifoModule {}
