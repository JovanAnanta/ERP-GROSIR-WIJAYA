import { Module } from '@nestjs/common';
import { SystemConfigurationController } from './system-configuration.controller.js';
import { SystemConfigurationService } from './system-configuration.service.js';
import { PrismaService } from '../../../database/prisma.service.js';

@Module({
  controllers: [SystemConfigurationController],
  providers: [SystemConfigurationService, PrismaService],
})
export class SystemConfigurationModule {}
