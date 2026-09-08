import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class InventoryLoanListQueryDto {
  @IsOptional() @Matches(/^[1-9]\d{0,8}$/) page?: string;
  @IsOptional() @Matches(/^(?:[1-9]|[1-9]\d|100)$/) limit?: string;
  @IsOptional() @IsIn(['ACTIVE', 'HISTORY']) tab?: 'ACTIVE' | 'HISTORY';
  @IsOptional() @IsIn(['OUTGOING', 'INCOMING']) direction?:
    'OUTGOING' | 'INCOMING';
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
}

export class InventoryLoanItemDto {
  @Matches(/^[1-9]\d*$/) productUnitId!: string;
  @Type(() => Number) @IsNumber() @Min(0.001) quantity!: number;
  @Type(() => Number) @IsNumber() @Min(0) provisionalUnitCost!: number;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
}

export class SaveInventoryLoanDto {
  @IsIn(['OUTGOING', 'INCOMING']) direction!: 'OUTGOING' | 'INCOMING';
  @IsOptional() @Matches(/^[1-9]\d*$/) customerId?: string;
  @IsOptional() @Matches(/^[1-9]\d*$/) supplierId?: string;
  @IsDateString() loanDate!: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InventoryLoanItemDto)
  items!: InventoryLoanItemDto[];
}

export class InventoryLoanResolutionItemDto {
  @Matches(/^[1-9]\d*$/) inventoryLoanDetailId!: string;
  @IsIn([
    'SAME_PRODUCT_RETURN',
    'REPLACEMENT_PRODUCT',
    'INVOICE_CONVERSION',
    'WRITE_OFF',
  ])
  resolutionType!:
    | 'SAME_PRODUCT_RETURN'
    | 'REPLACEMENT_PRODUCT'
    | 'INVOICE_CONVERSION'
    | 'WRITE_OFF';
  @Type(() => Number) @IsNumber() @Min(0.001) sourceQuantity!: number;
  @IsOptional() @Matches(/^[1-9]\d*$/) replacementProductUnitId?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  replacementQuantity?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  invoiceUnitPrice?: number;
  @IsOptional() @Matches(/^[1-9]\d*$/) recoveredWriteOffDetailId?: string;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
}

export class CompleteInventoryLoanResolutionDto {
  @IsDateString() resolutionDate!: string;
  @IsOptional() @IsDateString() invoiceDueDate?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InventoryLoanResolutionItemDto)
  items!: InventoryLoanResolutionItemDto[];
}
