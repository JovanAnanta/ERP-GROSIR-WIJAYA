import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsIn,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateCustomerOpeningBalanceDto {
  @Matches(/^[1-9]\d*$/) customerId!: string;
  @IsDateString() openingBalanceDate!: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount!: number;
  @IsOptional() @IsString() @MaxLength(100) referenceNumber?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class CreateSupplierOpeningBalanceDto {
  @Matches(/^[1-9]\d*$/) supplierId!: string;
  @IsDateString() openingBalanceDate!: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount!: number;
  @IsOptional() @IsString() @MaxLength(100) referenceNumber?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class InventoryOpeningBalanceLineDto {
  @IsInt() @Min(1) lineNumber!: number;
  @Matches(/^[1-9]\d*$/) productId!: string;
  @Matches(/^[1-9]\d*$/) selectedProductUnitId!: string;
  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0) inputQuantity!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) inputUnitCost!: number;
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  guestSuggestedPrice?: number;
}

export class SaveInventoryOpeningBalanceDto {
  @IsDateString() openingBalanceDate!: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsArray()
  @ArrayMaxSize(10000)
  @ValidateNested({ each: true })
  @Type(() => InventoryOpeningBalanceLineDto)
  lines!: InventoryOpeningBalanceLineDto[];
}

export class OpeningBalanceCatalogQueryDto {
  @IsOptional() @Matches(/^[1-9]\d{0,8}$/) page?: string;
  @IsOptional() @Matches(/^(?:20|30|50|100|ALL)$/) limit?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsIn(['ELIGIBLE', 'HISTORY']) scope?: 'ELIGIBLE' | 'HISTORY';
}
