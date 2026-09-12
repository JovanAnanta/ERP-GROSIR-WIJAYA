import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateFinancialAccountDto {
  @IsString() @MaxLength(100) accountName!: string;
  @IsIn(['CASH', 'BANK']) accountType!: 'CASH' | 'BANK';
  @IsOptional() @IsString() @MaxLength(100) bankName?: string;
  @IsOptional() @IsString() @MaxLength(100) accountNumber?: string;
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  openingBalance!: number;
  @IsOptional() @IsDateString() openingBalanceDate?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class UpdateFinancialAccountDto {
  @IsString() @MaxLength(100) accountName!: string;
  @IsOptional() @IsString() @MaxLength(100) bankName?: string;
  @IsOptional() @IsString() @MaxLength(100) accountNumber?: string;
}

export class ChangeFinancialAccountStatusDto {
  @IsBoolean() isActive!: boolean;
}

export class FinanceListQueryDto {
  @IsOptional() @Matches(/^[1-9]\d{0,8}$/) page?: string;
  @IsOptional() @Matches(/^(?:20|30|50|100)$/) limit?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @Matches(/^[1-9]\d*$/) accountId?: string;
  @IsOptional() @IsIn(['IN', 'OUT']) direction?: 'IN' | 'OUT';
  @IsOptional() @IsString() @MaxLength(50) sourceModule?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
}

export class CreateManualFinanceDto {
  @Matches(/^[1-9]\d*$/) financialAccountId!: string;
  @IsIn(['IN', 'OUT']) direction!: 'IN' | 'OUT';
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;
  @IsDateString() transactionDate!: string;
  @IsString() @MaxLength(50) source!: string;
  @IsString() @MaxLength(255) description!: string;
  @IsOptional() @IsString() @MaxLength(100) referenceNumber?: string;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
}

export class CreateTransferDto {
  @Matches(/^[1-9]\d*$/) sourceAccountId!: string;
  @Matches(/^[1-9]\d*$/) destinationAccountId!: string;
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;
  @IsDateString() transactionDate!: string;
  @IsOptional() @IsString() @MaxLength(100) referenceNumber?: string;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
}

export class VoidFinancialTransactionDto {
  @IsString() @MaxLength(255) reason!: string;
}

export class FinanceReportQueryDto {
  @IsDateString() dateFrom!: string;
  @IsDateString() dateTo!: string;
  @IsOptional() @IsIn(['DAY', 'WEEK', 'MONTH']) groupBy?:
    'DAY' | 'WEEK' | 'MONTH';
  @IsOptional()
  @Matches(/^[1-9]\d*$/)
  accountId?: string;
}

export class JournalListQueryDto {
  @IsOptional() @Matches(/^[1-9]\d{0,8}$/) page?: string;
  @IsOptional() @Matches(/^(?:20|30|50|100)$/) limit?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @Matches(/^[1-9]\d*$/) chartAccountId?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
}

export class ProfitLossQueryDto {
  @IsDateString() dateFrom!: string;
  @IsDateString() dateTo!: string;
}
