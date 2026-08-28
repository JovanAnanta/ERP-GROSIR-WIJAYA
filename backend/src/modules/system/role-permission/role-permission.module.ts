import { Module } from '@nestjs/common';
import { RolePermissionController } from './role-permission.controller.js';
import { RolePermissionService } from './role-permission.service.js';
import { PrismaService } from '../../../database/prisma.service.js';

@Module({
  controllers: [RolePermissionController],
  providers: [RolePermissionService, PrismaService],
})
export class RolePermissionModule {}
