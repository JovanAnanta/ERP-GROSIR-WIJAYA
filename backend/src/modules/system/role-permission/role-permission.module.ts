import { Module } from '@nestjs/common';
import { RolePermissionController } from './role-permission.controller.js';
import { RolePermissionService } from './role-permission.service.js';
import { PrismaService } from '../../../database/prisma.service.js';
import { RolesGuard } from '../../../common/guards/roles.guard.js';

@Module({
  controllers: [RolePermissionController],
  providers: [RolePermissionService, PrismaService, RolesGuard],
})
export class RolePermissionModule {}
