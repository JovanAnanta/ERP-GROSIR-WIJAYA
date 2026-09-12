import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PERMISSIONS } from '../../common/authorization/permission-catalog.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PermissionGuard } from '../../common/guards/permissions.guard.js';
import { SessionGuard } from '../../common/guards/session.guards.js';
import { PositiveBigIntPipe } from '../../common/pipes/positive-bigint.pipe.js';
import {
  ChangeFinancialAccountStatusDto,
  CreateFinancialAccountDto,
  CreateManualFinanceDto,
  CreateTransferDto,
  FinanceListQueryDto,
  FinanceReportQueryDto,
  JournalListQueryDto,
  ProfitLossQueryDto,
  UpdateFinancialAccountDto,
} from './dto/finance.dto.js';
import { FinanceService } from './finance.service.js';

@Controller('finance')
@UseGuards(SessionGuard, PermissionGuard)
export class FinanceController {
  constructor(private readonly service: FinanceService) {}

  @Get('accounts')
  @RequirePermissions(PERMISSIONS.FINANCIAL_VIEW)
  async accounts() {
    return { success: true, data: await this.service.accounts() };
  }
  @Get('account-settings')
  @RequirePermissions(PERMISSIONS.FINANCIAL_VIEW)
  async accountSettings() {
    return { success: true, data: await this.service.accountSettings() };
  }
  @Post('accounts')
  @RequirePermissions(PERMISSIONS.FINANCIAL_ACCOUNT_MANAGE)
  async createAccount(
    @Req() req: { user: { userId: bigint } },
    @Body() dto: CreateFinancialAccountDto,
  ) {
    return {
      success: true,
      message: 'Akun kas/bank berhasil dibuat.',
      data: await this.service.createAccount(req.user.userId, dto),
    };
  }
  @Patch('accounts/:id')
  @RequirePermissions(PERMISSIONS.FINANCIAL_ACCOUNT_MANAGE)
  async updateAccount(
    @Req() req: { user: { userId: bigint } },
    @Param('id', PositiveBigIntPipe) id: string,
    @Body() dto: UpdateFinancialAccountDto,
  ) {
    return {
      success: true,
      message: 'Akun kas/bank berhasil diperbarui.',
      data: await this.service.updateAccount(req.user.userId, BigInt(id), dto),
    };
  }
  @Patch('accounts/:id/status')
  @RequirePermissions(PERMISSIONS.FINANCIAL_ACCOUNT_MANAGE)
  async changeAccountStatus(
    @Req() req: { user: { userId: bigint } },
    @Param('id', PositiveBigIntPipe) id: string,
    @Body() dto: ChangeFinancialAccountStatusDto,
  ) {
    return {
      success: true,
      message: `Akun berhasil ${dto.isActive ? 'diaktifkan' : 'dinonaktifkan'}.`,
      data: await this.service.changeAccountStatus(
        req.user.userId,
        BigInt(id),
        dto,
      ),
    };
  }
  @Post('accounts/:id/default')
  @RequirePermissions(PERMISSIONS.FINANCIAL_ACCOUNT_MANAGE)
  async setDefaultAccount(
    @Req() req: { user: { userId: bigint } },
    @Param('id', PositiveBigIntPipe) id: string,
  ) {
    return {
      success: true,
      message: 'Akun default berhasil diperbarui.',
      data: await this.service.setDefaultAccount(req.user.userId, BigInt(id)),
    };
  }
  @Get('chart-accounts')
  @RequirePermissions(PERMISSIONS.FINANCIAL_VIEW)
  async chartAccounts() {
    return { success: true, data: await this.service.chartAccounts() };
  }
  @Get('categories')
  @RequirePermissions(PERMISSIONS.FINANCIAL_VIEW)
  categories() {
    return { success: true, data: this.service.categories() };
  }
  @Get('transactions')
  @RequirePermissions(PERMISSIONS.FINANCIAL_VIEW)
  async transactions(@Query() query: FinanceListQueryDto) {
    return { success: true, ...(await this.service.list(query)) };
  }
  @Get('summary')
  @RequirePermissions(PERMISSIONS.FINANCIAL_VIEW)
  async summary(@Query() query: FinanceListQueryDto) {
    return { success: true, data: await this.service.summary(query) };
  }
  @Get('report')
  @RequirePermissions(PERMISSIONS.FINANCIAL_VIEW)
  async report(@Query() query: FinanceReportQueryDto) {
    return { success: true, data: await this.service.report(query) };
  }
  @Get('health')
  @RequirePermissions(PERMISSIONS.FINANCIAL_VIEW)
  async health() {
    return { success: true, data: await this.service.health() };
  }

  @Get('journals')
  @RequirePermissions(PERMISSIONS.FINANCIAL_VIEW)
  async journals(@Query() query: JournalListQueryDto) {
    return { success: true, ...(await this.service.journals(query)) };
  }

  @Get('profit-loss')
  @RequirePermissions(PERMISSIONS.FINANCIAL_VIEW)
  async profitLoss(@Query() query: ProfitLossQueryDto) {
    return { success: true, data: await this.service.profitLoss(query) };
  }

  @Post('transactions')
  @RequirePermissions(PERMISSIONS.FINANCIAL_CREATE)
  async create(
    @Req() req: { user: { userId: bigint } },
    @Body() dto: CreateManualFinanceDto,
  ) {
    return {
      success: true,
      message: 'Transaksi keuangan berhasil dicatat.',
      data: await this.service.createManual(req.user.userId, dto),
    };
  }
  @Post('transfers')
  @RequirePermissions(PERMISSIONS.FINANCIAL_TRANSFER)
  async transfer(
    @Req() req: { user: { userId: bigint } },
    @Body() dto: CreateTransferDto,
  ) {
    return {
      success: true,
      message: 'Transfer antar akun berhasil dicatat.',
      data: await this.service.transfer(req.user.userId, dto),
    };
  }
}
