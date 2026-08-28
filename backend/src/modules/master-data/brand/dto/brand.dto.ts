import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsBoolean,
  IsIn,
  Matches,
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
  @IsOptional() @IsString() @Matches(/^[1-9]\d{0,8}$/) page?: string;
  @IsOptional() @IsString() @Matches(/^(?:[1-9]|[1-9]\d|100)$/) limit?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE', 'ALL']) status?: string;
  @IsOptional() @IsString() sortBy?: string;
  @IsOptional() @IsIn(['asc', 'desc']) sortDir?: 'asc' | 'desc';
}
