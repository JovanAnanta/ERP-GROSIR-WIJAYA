import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { RequireRoles } from '../../../common/decorators/roles.decorator.js';
import { PositiveBigIntPipe } from '../../../common/pipes/positive-bigint.pipe.js';
import { RolesGuard } from '../../../common/guards/roles.guard.js';
import { SessionGuard } from '../../../common/guards/session.guards.js';
import {
  ActivityLogQueryDto,
  AuditLogQueryDto,
  SecurityLogQueryDto,
} from './dto/log-query.dto.js';
import { SystemLogService } from './system-log.service.js';

@Controller('system/logs')
@RequireRoles('SUPER_OWNER', 'OWNER')
@UseGuards(SessionGuard, RolesGuard)
export class SystemLogController {
  constructor(private readonly logs: SystemLogService) {}
  @Get('activity') activity(@Query() query: ActivityLogQueryDto) {
    return this.logs.activity(query);
  }
  @Get('activity/:id') activityDetail(
    @Param('id', PositiveBigIntPipe) id: string,
  ) {
    return this.logs.activityDetail(BigInt(id));
  }
  @Get('audit') audit(@Query() query: AuditLogQueryDto) {
    return this.logs.audit(query);
  }
  @Get('audit/:id') auditDetail(@Param('id', PositiveBigIntPipe) id: string) {
    return this.logs.auditDetail(BigInt(id));
  }
  @Get('security') security(@Query() query: SecurityLogQueryDto) {
    return this.logs.security(query);
  }
  @Get('security/:id') securityDetail(
    @Param('id', PositiveBigIntPipe) id: string,
  ) {
    return this.logs.securityDetail(BigInt(id));
  }
}
