import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { PermissionGuard } from '../guards/permissions.guard.js';

@Global()
@Module({
  providers: [PrismaService, PermissionGuard],
  exports: [PermissionGuard],
})
export class AuthorizationModule {}
