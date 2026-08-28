import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  Min,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PriceQueryDto {
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() limit?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() brandId?: string;
}

export class PriceUpdateItemDto {
  @IsNotEmpty() @IsString() productUnitId!: string;

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
