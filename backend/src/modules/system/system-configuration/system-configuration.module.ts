import { Module } from '@nestjs/common';
import { SystemConfigurationController } from './system-configuration.controller.js';
import { SystemConfigurationService } from './system-configuration.service.js';
import { PrismaService } from '../../../database/prisma.service.js';
import { RolesGuard } from '../../../common/guards/roles.guard.js';

@Module({
  controllers: [SystemConfigurationController],
  providers: [SystemConfigurationService, PrismaService, RolesGuard],
})
export class SystemConfigurationModule {}
