import { Module } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { RolesGuard } from '../../../common/guards/roles.guard.js';
import { SystemLogController } from './system-log.controller.js';
import { SystemLogService } from './system-log.service.js';

@Module({
  controllers: [SystemLogController],
  providers: [SystemLogService, PrismaService, RolesGuard],
})
export class SystemLogModule {}
