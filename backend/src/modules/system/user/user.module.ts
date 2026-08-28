import { Module } from '@nestjs/common';
import { UserController } from './user.controller.js';
import { UserService } from './user.service.js';
import { PrismaService } from '../../../database/prisma.service.js';
import { RolesGuard } from '../../../common/guards/roles.guard.js';

@Module({
  controllers: [UserController],
  providers: [UserService, PrismaService, RolesGuard],
})
export class UserModule {}
