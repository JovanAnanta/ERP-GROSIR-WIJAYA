import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { PERMISSIONS } from '../../common/authorization/permission-catalog.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PermissionGuard } from '../../common/guards/permissions.guard.js';
import { SessionGuard } from '../../common/guards/session.guards.js';
import { PositiveBigIntPipe } from '../../common/pipes/positive-bigint.pipe.js';
import { FifoLayerListQueryDto, FifoTimelineQueryDto } from './dto/fifo.dto.js';
import { FifoService } from './fifo.service.js';

@Controller('fifo')
@UseGuards(SessionGuard, PermissionGuard)
@RequirePermissions(PERMISSIONS.FIFO_VIEW)
export class FifoController {
  constructor(private readonly service: FifoService) {}

  @Get('lookups/filters')
  async filters() {
    return { success: true, data: await this.service.getFilters() };
  }

  @Get('cost-analysis')
  async costAnalysis(@Query() query: FifoLayerListQueryDto) {
    return {
      success: true,
      ...((await this.service.listCostAnalysis(query)) as object),
    };
  }

  @Get('layers')
  async layers(@Query() query: FifoLayerListQueryDto) {
    return {
      success: true,
      ...((await this.service.listHistory(query)) as object),
    };
  }

  @Get('layers/:id')
  async layer(
    @Param('id', PositiveBigIntPipe) id: string,
    @Query() query: FifoTimelineQueryDto,
  ) {
    return {
      success: true,
      data: await this.service.getLayerDetail(id, query),
    };
  }
}
