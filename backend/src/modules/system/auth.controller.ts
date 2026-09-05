import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Res,
  Headers,
  HttpCode,
  Ip,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { LoginDto, UnlockSessionDto } from './auth/dto/auth.dto.js';
import { SessionGuard } from '../../common/guards/session.guards.js';
import {
  SESSION_ABSOLUTE_TTL_MS,
  SESSION_COOKIE_NAME,
} from './auth.constants.js';
import type { CurrentUserWithRole } from './user/user.service.js';

interface CookieRequest extends Request {
  cookies: Record<string, string | undefined>;
}

interface AuthenticatedRequest extends CookieRequest {
  user: CurrentUserWithRole;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Ip() ip: string | undefined,
    @Headers('user-agent') userAgent: string | undefined,
    @Headers('x-device-id') deviceId: string | undefined,
  ) {
    const safeDeviceId = deviceId ?? 'UNKNOWN_DEVICE';
    const safeIp = ip ?? req.socket.remoteAddress ?? 'UNKNOWN_IP';
    const safeUserAgent = userAgent ?? 'UNKNOWN';

    const result = await this.authService.login({
      username: dto.username,
      password: dto.password,
      ip: safeIp,
      userAgent: safeUserAgent,
      deviceId: safeDeviceId,
    });
    const permissions = await this.authService.getEffectivePermissions(
      result.user.userId,
    );

    res.cookie(SESSION_COOKIE_NAME, result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_ABSOLUTE_TTL_MS,
    });

    return {
      success: true,
      message: 'Login berhasil',
      data: {
        userId: result.user.userId.toString(),
        username: result.user.username,
        fullName: result.user.fullName,
        roleId: result.user.roleId.toString(),
        permissions,
      },
    };
  }

  @Get('me')
  @UseGuards(SessionGuard)
  async getCurrentUser(@Req() req: AuthenticatedRequest) {
    const permissions = await this.authService.getEffectivePermissions(
      req.user.userId,
    );
    return {
      userId: req.user.userId.toString(),
      username: req.user.username,
      fullName: req.user.fullName,
      roleId: req.user.roleId.toString(),
      permissions,
    };
  }

  @Post('activity')
  @UseGuards(SessionGuard)
  recordActivity() {
    return { acknowledged: true };
  }

  @Post('unlock')
  async unlock(
    @Body() dto: UnlockSessionDto,
    @Req() req: CookieRequest,
    @Ip() ip: string | undefined,
    @Headers('user-agent') userAgent: string | undefined,
  ) {
    const token = req.cookies[SESSION_COOKIE_NAME];

    if (!token) {
      return {
        success: false,
        category: 'Validation Error',
        message: 'Session tidak ditemukan.',
      };
    }

    const safeIp = ip ?? req.socket.remoteAddress ?? 'UNKNOWN_IP';
    const safeUserAgent = userAgent ?? 'UNKNOWN';

    await this.authService.unlockSession(
      token,
      dto.password,
      safeIp,
      safeUserAgent,
    );

    return { success: true, message: 'Session dilanjutkan.' };
  }

  @Post('logout')
  async logout(
    @Req() req: CookieRequest,
    @Res({ passthrough: true }) res: Response,
    @Ip() ip: string | undefined,
    @Headers('user-agent') userAgent: string | undefined,
  ) {
    const token = req.cookies[SESSION_COOKIE_NAME];

    if (token) {
      const safeIp = ip ?? req.socket.remoteAddress ?? 'UNKNOWN_IP';
      const safeUserAgent = userAgent ?? 'UNKNOWN';
      await this.authService.logout(token, safeIp, safeUserAgent);
    }

    res.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });

    return res.status(HttpStatus.OK).json({
      success: true,
      message: 'Berhasil logout.',
    });
  }
}
