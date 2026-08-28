import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsBoolean,
  IsIn,
} from 'class-validator';

export class CreateBrandDto {
  @IsNotEmpty({ message: 'Nama Merek (Brand) wajib diisi' })
  @IsString()
  brandName!: string;

  @IsOptional()
  @IsBoolean()
  forceSave?: boolean;
}

export class UpdateBrandDto extends CreateBrandDto {}

export class BrandQueryDto {
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() limit?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE', 'ALL']) status?: string;
  @IsOptional() @IsString() sortBy?: string;
  @IsOptional() @IsIn(['asc', 'desc']) sortDir?: 'asc' | 'desc';
}
