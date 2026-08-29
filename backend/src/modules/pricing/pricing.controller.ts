import {
  Controller,
  Get,
  Put,
  Query,
  Body,
  Req,
  Ip,
  Headers,
  UseGuards,
} from '@nestjs/common';
import { PricingService } from './pricing.service.js';
import { PriceQueryDto, UpdatePriceDto } from './dto/pricing.dto.js';
import { SessionGuard } from '../../common/guards/session.guards.js';
import { PermissionGuard } from '../../common/guards/permissions.guard.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PERMISSIONS } from '../../common/authorization/permission-catalog.js';
import type { Request } from 'express';

interface AuthRequest extends Request {
  user: { userId: bigint; role: { roleCode: string } };
}

@Controller('pricing')
@UseGuards(SessionGuard, PermissionGuard)
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Get('guest')
  @RequirePermissions(PERMISSIONS.PRICING_VIEW)
  async getGuestPrices(@Query() query: PriceQueryDto) {
    const result = await this.pricingService.getGuestPrices(query);
    return { success: true, ...result };
  }

  @Put('guest')
  @RequirePermissions(PERMISSIONS.PRICING_UPDATE)
  async updateGuestPrices(
    @Body() dto: UpdatePriceDto,
    @Req() req: AuthRequest,
    @Ip() ip: string | undefined,
    @Headers('user-agent') ua: string | undefined,
  ) {
    const safeIp = ip ?? req.socket.remoteAddress ?? 'UNKNOWN_IP';
    const result = await this.pricingService.updateGuestPrices(
      req.user.userId,
      dto,
      safeIp,
      ua ?? 'UNKNOWN_BROWSER',
    );
    return {
      success: true,
      message: `${result.updatedCount} harga berhasil diperbarui.`,
    };
  }

  @Get('brochure')
  @RequirePermissions(PERMISSIONS.PRICING_EXPORT)
  async getBrochureData() {
    const data = await this.pricingService.getBrochureData();
    return { success: true, data };
  }
}
