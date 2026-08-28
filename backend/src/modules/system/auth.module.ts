import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PrismaService } from '../../database/prisma.service.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, PrismaService],
  exports: [AuthService], // Diekspor agar bisa digunakan oleh Session Guard nantinya
})
export class AuthModule {}
