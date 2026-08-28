import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Req,
  Ip,
  Headers,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { UserService, CurrentUserWithRole } from './user.service.js';
import {
  CreateUserDto,
  UpdateUserDto,
  ResetPasswordDto,
} from './dto/user.dto.js';
import { SessionGuard } from '../../../common/guards/session.guards.js';

interface AuthenticatedRequest extends Request {
  user: CurrentUserWithRole;
  cookies: Record<string, string | undefined>;
}

@Controller('users')
@UseGuards(SessionGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  private extractNetworkData(
    req: AuthenticatedRequest,
    ip: string | undefined,
    ua: string | undefined,
  ) {
    const safeIp = ip ?? req.socket.remoteAddress ?? 'UNKNOWN_IP';
    const safeUa = ua ?? 'UNKNOWN_BROWSER';
    return { safeIp, safeUa };
  }

  @Get()
  async getAll() {
    const users = await this.userService.getAllUsers();
    return { success: true, data: users };
  }

  @Post()
  async create(
    @Body() dto: CreateUserDto,
    @Req() req: AuthenticatedRequest,
    @Ip() ip: string | undefined,
    @Headers('user-agent') ua: string | undefined,
  ) {
    const { safeIp, safeUa } = this.extractNetworkData(req, ip, ua);
    const user = await this.userService.createUser(
      req.user,
      dto,
      safeIp,
      safeUa,
    );

    // PERBAIKAN: Menggunakan operator void untuk membungkam linter secara elegan
    const { passwordHash, ...safeUser } = user;
    void passwordHash;

    return { success: true, message: 'User berhasil dibuat', data: safeUser };
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Req() req: AuthenticatedRequest,
    @Ip() ip: string | undefined,
    @Headers('user-agent') ua: string | undefined,
  ) {
    const { safeIp, safeUa } = this.extractNetworkData(req, ip, ua);
    const user = await this.userService.updateUser(
      req.user,
      BigInt(id),
      dto,
      safeIp,
      safeUa,
    );

    // PERBAIKAN: Menggunakan operator void
    const { passwordHash, ...safeUser } = user;
    void passwordHash;

    return {
      success: true,
      message: 'User berhasil diperbarui',
      data: safeUser,
    };
  }

  @Post(':id/disable')
  async disable(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Ip() ip: string | undefined,
    @Headers('user-agent') ua: string | undefined,
  ) {
    const { safeIp, safeUa } = this.extractNetworkData(req, ip, ua);
    await this.userService.disableUser(req.user, BigInt(id), safeIp, safeUa);
    return { success: true, message: 'User berhasil dinonaktifkan' };
  }

  @Post(':id/reset-password')
  async resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
    @Req() req: AuthenticatedRequest,
    @Ip() ip: string | undefined,
    @Headers('user-agent') ua: string | undefined,
  ) {
    const { safeIp, safeUa } = this.extractNetworkData(req, ip, ua);
    await this.userService.resetPassword(
      req.user,
      BigInt(id),
      dto.newPassword,
      safeIp,
      safeUa,
    );
    return { success: true, message: 'Password berhasil di-reset' };
  }

  @Post(':id/force-logout')
  async forceLogout(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Ip() ip: string | undefined,
    @Headers('user-agent') ua: string | undefined,
  ) {
    const { safeIp, safeUa } = this.extractNetworkData(req, ip, ua);
    await this.userService.forceLogout(req.user, BigInt(id), safeIp, safeUa);
    return { success: true, message: 'User berhasil di-force logout' };
  }

  @Post(':id/unlock-session')
  async unlockSession(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Ip() ip: string | undefined,
    @Headers('user-agent') ua: string | undefined,
  ) {
    const { safeIp, safeUa } = this.extractNetworkData(req, ip, ua);
    await this.userService.unlockSession(req.user, BigInt(id), safeIp, safeUa);
    return { success: true, message: 'Session user berhasil dibuka' };
  }
}
