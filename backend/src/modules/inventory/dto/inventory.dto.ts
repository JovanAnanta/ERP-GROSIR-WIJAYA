import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class InventoryListQueryDto {
  @IsOptional() @Matches(/^[1-9]\d{0,8}$/) page?: string;
  @IsOptional() @Matches(/^(?:[1-9]|[1-9]\d|100)$/) limit?: string;
  @IsOptional() @IsIn(['ACTIVE', 'HISTORY']) tab?: 'ACTIVE' | 'HISTORY';
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @Matches(/^[1-9]\d*$/) categoryId?: string;
  @IsOptional() @Matches(/^[1-9]\d*$/) brandId?: string;
  @IsOptional() @Matches(/^[1-9]\d*$/) supplierId?: string;
}

export class AdjustmentItemDto {
  @Matches(/^[1-9]\d*$/) productUnitId!: string;
  @IsIn(['IN', 'OUT']) direction!: 'IN' | 'OUT';
  @Type(() => Number) @IsNumber() @Min(0.001) quantity!: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) unitCost?: number;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
}

export class SaveAdjustmentDto {
  @IsDateString() adjustmentDate!: string;
  @IsString() @IsNotEmpty() @MaxLength(255) reason!: string;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
  @IsIn(['DRAFT', 'APPROVED']) status!: 'DRAFT' | 'APPROVED';
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AdjustmentItemDto)
  @ArrayUnique((item: AdjustmentItemDto) => item.productUnitId)
  items!: AdjustmentItemDto[];
}

export class OpnameItemDto {
  @Matches(/^[1-9]\d*$/) productUnitId!: string;
  @Type(() => Number) @IsNumber() @Min(0) warehouseQty!: number;
  @Type(() => Number) @IsNumber() @Min(0) packedQty!: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) unitCost?: number;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
}

export class SaveOpnameDto {
  @IsDateString() opnameDate!: string;
  @IsOptional() @Matches(/^[1-9]\d*$/) supplierId?: string;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
  @IsIn(['DRAFT', 'APPROVED']) status!: 'DRAFT' | 'APPROVED';
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OpnameItemDto)
  @ArrayUnique((item: OpnameItemDto) => item.productUnitId)
  items!: OpnameItemDto[];
}

export class TransformationItemDto {
  @Matches(/^[1-9]\d*$/) sourceProductUnitId!: string;
  @Type(() => Number) @IsNumber() @Min(0.001) sourceQuantity!: number;
  @Matches(/^[1-9]\d*$/) resultProductUnitId!: string;
  @Type(() => Number) @IsNumber() @Min(0.001) resultQuantity!: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  appliedUnitCost?: number;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
}

export class SaveTransformationDto {
  @IsDateString() transformationDate!: string;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TransformationItemDto)
  items!: TransformationItemDto[];
}

export class MovementHistoryQueryDto extends InventoryListQueryDto {
  @IsOptional() @IsIn(['IN', 'OUT']) direction?: 'IN' | 'OUT';
  @IsOptional() @Matches(/^[1-9]\d*$/) productUnitId?: string;
}
