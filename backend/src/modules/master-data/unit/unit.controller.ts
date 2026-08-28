import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UnitService } from './unit.service.js';
import { CreateUnitDto, UpdateUnitDto, UnitQueryDto } from './dto/unit.dto.js';
import { SessionGuard } from '../../../common/guards/session.guards.js';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator.js';
import { PositiveBigIntPipe } from '../../../common/pipes/positive-bigint.pipe.js';
import type { Request } from 'express';

interface AuthRequest extends Request {
  user: { userId: bigint; role: { roleCode: string } };
}

@Controller('units')
@UseGuards(SessionGuard)
export class UnitController {
  constructor(private readonly unitService: UnitService) {}

  @Get()
  @RequirePermissions('UNIT_VIEW')
  async getAll(@Query() query: UnitQueryDto) {
    const result = await this.unitService.findAll(query);
    return { success: true, ...result };
  }

  @Post()
  @RequirePermissions('UNIT_CREATE')
  async create(@Body() dto: CreateUnitDto, @Req() req: AuthRequest) {
    const unit = await this.unitService.create(req.user.userId, dto);
    return {
      success: true,
      message: 'Unit berhasil ditambahkan.',
      data: { unitId: unit.unitId.toString() },
    };
  }

  @Put(':id')
  @RequirePermissions('UNIT_UPDATE')
  async update(
    @Param('id', PositiveBigIntPipe) id: string,
    @Body() dto: UpdateUnitDto,
    @Req() req: AuthRequest,
  ) {
    await this.unitService.update(req.user.userId, BigInt(id), dto);
    return { success: true, message: 'Unit berhasil diperbarui.' };
  }

  @Post(':id/inactivate')
  @RequirePermissions('UNIT_INACTIVATE')
  async inactivate(
    @Param('id', PositiveBigIntPipe) id: string,
    @Req() req: AuthRequest,
  ) {
    await this.unitService.inactivate(req.user.userId, BigInt(id));
    return { success: true, message: 'Unit berhasil dinonaktifkan.' };
  }

  @Post(':id/reactivate')
  @RequirePermissions('UNIT_REACTIVATE')
  async reactivate(
    @Param('id', PositiveBigIntPipe) id: string,
    @Req() req: AuthRequest,
  ) {
    await this.unitService.reactivate(req.user.userId, BigInt(id));
    return { success: true, message: 'Unit berhasil diaktifkan kembali.' };
  }
}
