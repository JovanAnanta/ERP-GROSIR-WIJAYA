import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export const SALES_CHANNELS = [
  'MANUAL',
  'SRC',
  'WHATSAPP',
  'MARKETPLACE',
  'LAINNYA',
] as const;
export const PAYMENT_METHODS = [
  'CASH',
  'TRANSFER',
  'QRIS',
  'DEBIT_CARD',
  'CREDIT_CARD',
  'E_WALLET',
  'GIRO',
  'LAINNYA',
] as const;

export class SalesListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsIn(['ACTIVE', 'HISTORY']) tab: 'ACTIVE' | 'HISTORY' =
    'ACTIVE';
  @IsOptional() @IsString() @MaxLength(100) search?: string;
}

export class SalesItemDto {
  @IsString() productUnitId!: string;
  @IsOptional() @IsString() salesOrderDetailId?: string;
  @Type(() => Number) @IsNumber() @Min(0.001) quantity!: number;
  @Type(() => Number) @IsNumber() @Min(0) unitPrice!: number;
  @Type(() => Number) @IsNumber() @Min(0) discountAmount = 0;
  @Type(() => Number) @IsNumber() @Min(0) bonusQuantity = 0;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
}

export class InitialSalesPaymentDto {
  @IsString() financialAccountId!: string;
  @Type(() => Number) @IsNumber() @Min(0.01) paymentAmount!: number;
  @IsIn(PAYMENT_METHODS) paymentMethod!: (typeof PAYMENT_METHODS)[number];
  @ValidateIf(
    (item: InitialSalesPaymentDto) => item.paymentMethod === 'LAINNYA',
  )
  @IsString()
  @MaxLength(50)
  otherPaymentMethod?: string;
  @IsDateString() paymentDate!: string;
  @IsOptional() @IsString() @MaxLength(100) referenceNumber?: string;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
}

export class SaveSalesOrderDto {
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() @MaxLength(255) customerName?: string;
  @IsDateString() orderDate!: string;
  @IsIn(['DRAFT', 'READY']) status!: 'DRAFT' | 'READY';
  @IsIn(SALES_CHANNELS) salesChannel!: (typeof SALES_CHANNELS)[number];
  @Type(() => Number) @IsNumber() @Min(0) discountAmount = 0;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SalesItemDto)
  items!: SalesItemDto[];
}

export class SaveSalesInvoiceDto {
  @IsOptional() @IsString() salesOrderId?: string;
  @IsOptional() @IsString() customerId?: string;
  @IsIn(['CUSTOMER', 'GUEST']) partyType!: 'CUSTOMER' | 'GUEST';
  @IsOptional() @IsString() @MaxLength(255) customerName?: string;
  @IsIn(SALES_CHANNELS) salesChannel!: (typeof SALES_CHANNELS)[number];
  @IsIn(['CASH', 'CREDIT']) paymentType!: 'CASH' | 'CREDIT';
  @IsDateString() invoiceDate!: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @Type(() => Number) @IsNumber() @Min(0) discountAmount = 0;
  @IsIn(['DRAFT', 'READY', 'COMPLETED']) status!:
    'DRAFT' | 'READY' | 'COMPLETED';
  @IsIn(['MERGE', 'REWRITE', 'IGNORE']) snapshotMode!:
    'MERGE' | 'REWRITE' | 'IGNORE';
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SalesItemDto)
  items!: SalesItemDto[];
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalesItemDto)
  orderItems?: SalesItemDto[];
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InitialSalesPaymentDto)
  payments?: InitialSalesPaymentDto[];
}

export class ReceiveSalesPaymentDto extends InitialSalesPaymentDto {}

export class ChangeSalesInvoiceStatusDto {
  @IsIn(['DRAFT', 'READY', 'COMPLETED'])
  targetStatus!: 'DRAFT' | 'READY' | 'COMPLETED';

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class ProcessSalesInvoiceDto {
  @IsOptional()
  @IsIn(['DRAFT', 'READY', 'COMPLETED'])
  targetStatus?: 'DRAFT' | 'READY' | 'COMPLETED';

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => InitialSalesPaymentDto)
  payment?: InitialSalesPaymentDto;
}

export class CustomerOutstandingQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsIn(['OUTSTANDING_DESC', 'NAME_ASC', 'OVERDUE_FIRST'])
  sort: 'OUTSTANDING_DESC' | 'NAME_ASC' | 'OVERDUE_FIRST' = 'OUTSTANDING_DESC';
}

export class SalesReturnItemDto {
  @IsString() salesInvoiceDetailId!: string;
  @Type(() => Number) @IsNumber() @Min(0) quantity = 0;
  @Type(() => Number) @IsNumber() @Min(0) bonusQuantity = 0;
  @IsOptional() @IsString() @MaxLength(100) reason?: string;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
}

export class SaveSalesReturnDto {
  @IsDateString() returnDate!: string;
  @IsIn(['DRAFT', 'COMPLETED']) status!: 'DRAFT' | 'COMPLETED';
  @IsIn(['REFUND', 'REPLACEMENT']) resolutionType!: 'REFUND' | 'REPLACEMENT';
  @IsOptional() @IsString() financialAccountId?: string;
  @IsOptional() @IsIn(PAYMENT_METHODS)
  refundPaymentMethod?: (typeof PAYMENT_METHODS)[number];
  @IsOptional() @IsString() @MaxLength(50) otherRefundPaymentMethod?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true })
  @Type(() => SalesReturnItemDto)
  items!: SalesReturnItemDto[];
  @ValidateIf((value: SaveSalesReturnDto) => value.resolutionType === 'REPLACEMENT')
  @ValidateNested()
  @Type(() => SaveSalesInvoiceDto)
  replacementInvoice?: SaveSalesInvoiceDto;
}
