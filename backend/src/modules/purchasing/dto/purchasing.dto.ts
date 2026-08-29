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
  Matches,
  ArrayNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

// ================== PURCHASE ORDER ==================
export class PurchaseOrderItemDto {
  @IsNotEmpty() @IsString() @Matches(/^[1-9]\d*$/) productUnitId!: string;
  @IsNumber() @Min(0.001) quantity!: number;
  @IsOptional() @IsString() note?: string;
}

export class CreatePurchaseOrderDto {
  @IsNotEmpty() @IsString() @Matches(/^[1-9]\d*$/) supplierId!: string;
  @IsOptional() @IsDateString() expectedDate?: string;
  @IsOptional() @IsString() note?: string;
  @IsIn(['DRAFT', 'READY']) status!: 'DRAFT' | 'READY';

  @IsArray()
  @ArrayNotEmpty({ message: 'Item Purchase Order tidak boleh kosong' })
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items!: PurchaseOrderItemDto[];
}

export class UpdatePurchaseOrderDto extends CreatePurchaseOrderDto {}

export class PurchaseOrderListQueryDto {
  @IsOptional() @IsString() @Matches(/^[1-9]\d*$/) supplierId?: string;
  @IsOptional() @IsIn(['ACTIVE', 'HISTORY']) tab?: 'ACTIVE' | 'HISTORY';
  @IsOptional() @IsString() @Matches(/^[1-9]\d{0,8}$/) page?: string;
  @IsOptional() @IsString() @Matches(/^(?:[1-9]|[1-9]\d|100)$/) limit?: string;
}

// ================== PURCHASE INVOICE ==================
export class PurchaseInvoiceItemDto {
  @IsNotEmpty() @IsString() @Matches(/^[1-9]\d*$/) productUnitId!: string;
  @IsNumber() @Min(0.001) purchasedQty!: number;
  @IsOptional() @IsNumber() @Min(0) bonusQty?: number;
  @IsNumber() @Min(0) price!: number;
  @IsOptional() @IsString() note?: string;
}

export class PurchasePaymentDto {
  @IsNotEmpty() @IsString() @Matches(/^[1-9]\d*$/) financialAccountId!: string;
  @IsNumber() @Min(0.01) paymentAmount!: number;
  @IsIn(['CASH', 'TRANSFER']) paymentMethod!: 'CASH' | 'TRANSFER';
  @IsOptional() @IsString() referenceNumber?: string;
}

export class CreatePurchaseInvoiceDto {
  @IsNotEmpty() @IsString() @Matches(/^[1-9]\d*$/) supplierId!: string;
  @IsOptional() @IsString() @Matches(/^[1-9]\d*$/) purchaseOrderId?: string;
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
  @ArrayNotEmpty({ message: 'Item Purchase Invoice tidak boleh kosong' })
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

export class PurchaseInvoiceListQueryDto {
  @IsOptional() @IsString() @Matches(/^[1-9]\d*$/) supplierId?: string;
  @IsOptional() @IsIn(['ACTIVE', 'COMPLETED']) tab?: 'ACTIVE' | 'COMPLETED';
  @IsOptional() @IsString() @Matches(/^[1-9]\d{0,8}$/) page?: string;
  @IsOptional() @IsString() @Matches(/^(?:[1-9]|[1-9]\d|100)$/) limit?: string;
}

// ================== INVOICE PAYMENT (MODAL) ==================
export class AddInvoicePaymentDto {
  @IsNotEmpty() @IsString() @Matches(/^[1-9]\d*$/) financialAccountId!: string;
  @IsNumber() @Min(0.01) paymentAmount!: number;
  @IsIn(['CASH', 'TRANSFER']) paymentMethod!: 'CASH' | 'TRANSFER';
  @IsNotEmpty() @IsDateString() paymentDate!: string;
  @IsOptional() @IsString() referenceNumber?: string;
  @IsOptional() @IsString() note?: string;
}

// ================== PURCHASE RETURN ==================
export const PURCHASE_RETURN_RESOLUTION_TYPES = [
  'REPLACEMENT',
  'CURRENT_INVOICE_DEDUCTION',
  'NEXT_INVOICE_DEDUCTION',
  'CASHBACK',
] as const;

export type PurchaseReturnResolutionTypeInput =
  (typeof PURCHASE_RETURN_RESOLUTION_TYPES)[number];

export class PurchaseReturnItemDto {
  @IsNotEmpty()
  @IsString()
  @Matches(/^[1-9]\d*$/)
  purchaseInvoiceDetailId!: string;
  @IsNotEmpty() @IsString() @Matches(/^[1-9]\d*$/) productUnitId!: string;
  @IsNumber() @Min(0.001) quantity!: number;
  @IsNumber() @Min(0.01) unitCost!: number;
}

export class SavePurchaseReturnDto {
  @IsNotEmpty() @IsString() @Matches(/^[1-9]\d*$/) purchaseInvoiceId!: string;
  @IsDateString() returnDate!: string;
  @IsOptional() @IsDateString() expectedResolutionDate?: string;
  @IsIn(PURCHASE_RETURN_RESOLUTION_TYPES)
  resolutionType!: PurchaseReturnResolutionTypeInput;
  @IsIn(['DRAFT', 'READY']) status!: 'DRAFT' | 'READY';
  @IsNotEmpty() @IsString() reason!: string;
  @IsOptional() @IsString() note?: string;

  @IsArray()
  @ArrayNotEmpty({ message: 'Minimal satu item harus diretur' })
  @ValidateNested({ each: true })
  @Type(() => PurchaseReturnItemDto)
  items!: PurchaseReturnItemDto[];
}

export class CompletePurchaseReturnDto {
  @IsOptional() @IsString() @Matches(/^[1-9]\d*$/) financialAccountId?: string;
  @IsOptional()
  @IsIn(['CASH', 'TRANSFER'])
  paymentMethod?: 'CASH' | 'TRANSFER';
  @IsOptional()
  @IsString()
  @Matches(/^[1-9]\d*$/)
  appliedPurchaseInvoiceId?: string;
}
