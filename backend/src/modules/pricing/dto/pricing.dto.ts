import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  Min,
  IsNumber,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PriceQueryDto {
  @IsOptional() @IsString() @Matches(/^[1-9]\d{0,8}$/) page?: string;
  @IsOptional() @IsString() @Matches(/^(?:[1-9]|[1-9]\d|100)$/) limit?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() @Matches(/^[1-9]\d*$/) categoryId?: string;
  @IsOptional() @IsString() @Matches(/^[1-9]\d*$/) brandId?: string;
}

export class PriceUpdateItemDto {
  @IsNotEmpty() @IsString() @Matches(/^[1-9]\d*$/) productUnitId!: string;

  @IsNumber()
  @Min(0, { message: 'Harga tidak boleh negatif' })
  price!: number;
}

export class UpdatePriceDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PriceUpdateItemDto)
  updates!: PriceUpdateItemDto[];
}
