import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '../../common/guards/session.guards.js';
import { PermissionGuard } from '../../common/guards/permissions.guard.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PERMISSIONS } from '../../common/authorization/permission-catalog.js';
import { PositiveBigIntPipe } from '../../common/pipes/positive-bigint.pipe.js';
import { AliasService } from './alias.service.js';
import {
  AliasQueryDto,
  CreateAliasesDto,
  ChangeAliasDto,
  DeleteAliasDto,
} from './dto/alias.dto.js';

@Controller('pricing/aliases')
@UseGuards(SessionGuard, PermissionGuard)
export class AliasController {
  constructor(private readonly aliases: AliasService) {}
  @Get()
  @RequirePermissions(PERMISSIONS.ALIAS_VIEW)
  list(@Query() query: AliasQueryDto) {
    return this.aliases.list(query);
  }
  @Get('targets')
  @RequirePermissions(PERMISSIONS.ALIAS_VIEW)
  targets(@Query() query: AliasQueryDto) {
    return this.aliases.targets(query);
  }
  @Post()
  @RequirePermissions(PERMISSIONS.ALIAS_VIEW, PERMISSIONS.ALIAS_MANAGE)
  create(
    @Req() req: { user: { userId: bigint } },
    @Body() dto: CreateAliasesDto,
  ) {
    return this.aliases.create(req.user.userId, dto);
  }
  @Put(':id')
  @RequirePermissions(PERMISSIONS.ALIAS_VIEW, PERMISSIONS.ALIAS_MANAGE)
  update(
    @Req() req: { user: { userId: bigint } },
    @Param('id', PositiveBigIntPipe) id: string,
    @Body() dto: ChangeAliasDto,
  ) {
    return this.aliases.change(req.user.userId, BigInt(id), dto);
  }
  @Delete(':id')
  @RequirePermissions(PERMISSIONS.ALIAS_VIEW, PERMISSIONS.ALIAS_MANAGE)
  remove(
    @Req() req: { user: { userId: bigint } },
    @Param('id', PositiveBigIntPipe) id: string,
    @Body() dto: DeleteAliasDto,
  ) {
    return this.aliases.change(req.user.userId, BigInt(id), dto);
  }
}
