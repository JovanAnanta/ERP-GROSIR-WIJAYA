import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { PERMISSIONS } from '../../common/authorization/permission-catalog.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PermissionGuard } from '../../common/guards/permissions.guard.js';
import { SessionGuard } from '../../common/guards/session.guards.js';
import { DashboardService } from './dashboard.service.js';
import { DashboardRangeQueryDto } from './dto/dashboard.dto.js';

type DashboardRequest = {
  user: { userId: bigint; roleId: bigint; role: { roleCode: string } };
};

@Controller('dashboard')
@UseGuards(SessionGuard, PermissionGuard)
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('overview')
  @RequirePermissions(PERMISSIONS.DASHBOARD_VIEW)
  async overview(
    @Req() request: DashboardRequest,
    @Query() query: DashboardRangeQueryDto,
  ) {
    return {
      success: true,
      data: await this.service.overview(request.user, query),
    };
  }

  @Get('sales')
  @RequirePermissions(PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.SALES_VIEW)
  async sales(@Query() query: DashboardRangeQueryDto) {
    return { success: true, data: await this.service.sales(query) };
  }

  @Get('inventory')
  @RequirePermissions(PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.INVENTORY_VIEW)
  async inventory(@Query() query: DashboardRangeQueryDto) {
    return { success: true, data: await this.service.inventory(query) };
  }

  @Get('finance')
  @RequirePermissions(PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.FINANCIAL_VIEW)
  async finance(@Query() query: DashboardRangeQueryDto) {
    return { success: true, data: await this.service.finance(query) };
  }

  @Get('partners')
  @RequirePermissions(PERMISSIONS.DASHBOARD_VIEW)
  async partners(
    @Req() request: DashboardRequest,
    @Query() query: DashboardRangeQueryDto,
  ) {
    return {
      success: true,
      data: await this.service.partners(request.user, query),
    };
  }
}
