import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsBoolean,
  IsIn,
  IsNumber,
  ValidateNested,
  IsArray,
  Min,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ProductUnitInputDto {
  @IsOptional() @IsString() @Matches(/^[1-9]\d*$/) productUnitId?: string;
  @IsOptional() @IsString() @Matches(/^[1-9]\d*$/) unitId?: string;
  @IsOptional() @IsString() newUnitName?: string;

  @IsNumber() @Min(0.000001) conversionFactor!: number;
  @IsNumber() displayOrder!: number;
  @IsBoolean() isParent!: boolean;

  // Menerima status aktif/nonaktif dari Frontend
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateProductDto {
  @IsNotEmpty({ message: 'Nama Produk wajib diisi' })
  @IsString()
  productName!: string;

  @IsOptional() @IsString() @Matches(/^[1-9]\d*$/) categoryId?: string;
  @IsOptional() @IsString() newCategoryName?: string;

  @IsOptional() @IsString() @Matches(/^[1-9]\d*$/) brandId?: string;
  @IsOptional() @IsString() newBrandName?: string;

  @IsNumber()
  @Min(0)
  minimumInventoryQty!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductUnitInputDto)
  units!: ProductUnitInputDto[];
}

export class UpdateProductDto {
  @IsNotEmpty({ message: 'Nama Produk wajib diisi' })
  @IsString()
  productName!: string;

  @IsOptional() @IsString() @Matches(/^[1-9]\d*$/) categoryId?: string;
  @IsOptional() @IsString() newCategoryName?: string;

  @IsOptional() @IsString() @Matches(/^[1-9]\d*$/) brandId?: string;
  @IsOptional() @IsString() newBrandName?: string;

  @IsNumber()
  @Min(0)
  minimumInventoryQty!: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductUnitInputDto)
  units?: ProductUnitInputDto[];
}

export class ProductQueryDto {
  @IsOptional() @IsString() @Matches(/^[1-9]\d{0,8}$/) page?: string;
  @IsOptional() @IsString() @Matches(/^(?:[1-9]|[1-9]\d|100)$/) limit?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE', 'ALL']) status?: string;
  @IsOptional() @IsString() @Matches(/^[1-9]\d*$/) categoryId?: string;
  @IsOptional() @IsString() @Matches(/^[1-9]\d*$/) brandId?: string;
  @IsOptional() @IsString() sortBy?: string;
  @IsOptional() @IsIn(['asc', 'desc']) sortDir?: 'asc' | 'desc';
}

// =======================================================================
// DTO TAMBAHAN: UNTUK IMPORT MASSAL (FR-PRICE-008 V2)
// =======================================================================

export class ImportUnitDto {
  @IsNotEmpty() @IsString() unitName!: string;
  @IsNumber() @Min(0.000001) conversionFactor!: number;
  @IsBoolean() isParent!: boolean;
}

export class ImportProductItemDto {
  @IsNotEmpty({ message: 'Nama Produk wajib diisi' })
  @IsString()
  productName!: string;

  @IsNotEmpty({ message: 'Kategori wajib diisi' })
  @IsString()
  categoryName!: string;

  @IsOptional() @IsString() brandName?: string;

  @IsNumber() @Min(0) minimumInventoryQty!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportUnitDto)
  units!: ImportUnitDto[];
}

export class ImportProductsPayloadDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportProductItemDto)
  products!: ImportProductItemDto[];
}
