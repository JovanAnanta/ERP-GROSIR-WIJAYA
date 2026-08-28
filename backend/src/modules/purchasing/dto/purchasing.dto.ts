import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  Min,
  IsNumber,
  IsIn,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

// ================== PURCHASE ORDER ==================
export class PurchaseOrderItemDto {
  @IsNotEmpty() @IsString() productUnitId!: string;
  @IsNumber() @Min(0.001) quantity!: number;
  @IsOptional() @IsString() note?: string;
}

export class CreatePurchaseOrderDto {
  @IsNotEmpty() @IsString() supplierId!: string;
  @IsOptional() @IsDateString() expectedDate?: string;
  @IsOptional() @IsString() note?: string;
  @IsIn(['DRAFT', 'READY']) status!: 'DRAFT' | 'READY';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items!: PurchaseOrderItemDto[];
}

export class UpdatePurchaseOrderDto extends CreatePurchaseOrderDto {}

// ================== PURCHASE INVOICE ==================
export class PurchaseInvoiceItemDto {
  @IsNotEmpty() @IsString() productUnitId!: string;
  @IsNumber() @Min(0.001) purchasedQty!: number;
  @IsOptional() @IsNumber() @Min(0) bonusQty?: number;
  @IsNumber() @Min(0) price!: number;
  @IsOptional() @IsString() note?: string;
}

export class PurchasePaymentDto {
  @IsNotEmpty() @IsString() financialAccountId!: string;
  @IsNumber() @Min(0) paymentAmount!: number;
  @IsIn(['CASH', 'TRANSFER']) paymentMethod!: 'CASH' | 'TRANSFER';
  @IsOptional() @IsString() referenceNumber?: string;
}

export class CreatePurchaseInvoiceDto {
  @IsNotEmpty() @IsString() supplierId!: string;
  @IsOptional() @IsString() purchaseOrderId?: string;
  @IsOptional() @IsString() supplierInvoiceNumber?: string;

  @IsNotEmpty() @IsDateString() invoiceDate!: string;
  @IsOptional() @IsDateString() dueDate?: string;

  @IsNumber() @Min(0) invoiceTotal!: number;
  @IsNumber() @Min(0) discountAmount!: number;

  @IsOptional() @IsString() note?: string;
  @IsIn(['DRAFT', 'COMPLETED']) status!: 'DRAFT' | 'COMPLETED';
  @IsIn(['MERGE', 'REWRITE', 'IGNORE']) priceHistoryAction!:
    'MERGE' | 'REWRITE' | 'IGNORE';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseInvoiceItemDto)
  items!: PurchaseInvoiceItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchasePaymentDto)
  payments?: PurchasePaymentDto[];
}

export class UpdatePurchaseInvoiceDto extends CreatePurchaseInvoiceDto {}

// ================== INVOICE PAYMENT (MODAL) ==================
export class AddInvoicePaymentDto {
  @IsNotEmpty() @IsString() financialAccountId!: string;
  @IsNumber() @Min(0.01) paymentAmount!: number;
  @IsIn(['CASH', 'TRANSFER']) paymentMethod!: 'CASH' | 'TRANSFER';
  @IsNotEmpty() @IsDateString() paymentDate!: string;
  @IsOptional() @IsString() referenceNumber?: string;
  @IsOptional() @IsString() note?: string;
}
