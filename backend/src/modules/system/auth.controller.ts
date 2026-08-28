import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  Headers,
  Ip,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { LoginDto, UnlockSessionDto } from './auth/dto/auth.dto.js';

interface CookieRequest extends Request {
  cookies: Record<string, string | undefined>;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
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

    res.cookie('erp_session', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 12 * 60 * 60 * 1000,
    });

    return res.status(HttpStatus.OK).json({
      success: true,
      message: 'Login berhasil',
      data: {
        userId: result.user.userId.toString(),
        username: result.user.username,
        fullName: result.user.fullName,
        roleId: result.user.roleId.toString(),
      },
    });
  }

  @Post('unlock')
  async unlock(
    @Body() dto: UnlockSessionDto,
    @Req() req: CookieRequest,
    @Ip() ip: string | undefined,
    @Headers('user-agent') userAgent: string | undefined,
  ) {
    const token = req.cookies['erp_session'];

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
    const token = req.cookies['erp_session'];

    if (token) {
      const safeIp = ip ?? req.socket.remoteAddress ?? 'UNKNOWN_IP';
      const safeUserAgent = userAgent ?? 'UNKNOWN';
      await this.authService.logout(token, safeIp, safeUserAgent);
    }

    res.clearCookie('erp_session');

    return res.status(HttpStatus.OK).json({
      success: true,
      message: 'Berhasil logout.',
    });
  }
}
