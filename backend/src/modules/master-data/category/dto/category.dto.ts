import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsBoolean,
  IsIn,
  Matches,
} from 'class-validator';

export class CreateCategoryDto {
  @IsNotEmpty({ message: 'Nama Category wajib diisi' })
  @IsString()
  categoryName!: string;

  @IsOptional()
  @IsBoolean()
  forceSave?: boolean;
}

export class UpdateCategoryDto {
  @IsNotEmpty({ message: 'Nama Category wajib diisi' })
  @IsString()
  categoryName!: string;

  @IsOptional()
  @IsBoolean()
  forceSave?: boolean;
}

export class CategoryQueryDto {
  @IsOptional() @IsString() @Matches(/^[1-9]\d{0,8}$/) page?: string;
  @IsOptional() @IsString() @Matches(/^(?:[1-9]|[1-9]\d|100)$/) limit?: string;
  @IsOptional() @IsString() search?: string;

  // PERBAIKAN: Menambahkan filter Status untuk FR List
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE', 'ALL']) status?: string;

  @IsOptional() @IsString() sortBy?: string;
  @IsOptional() @IsIn(['asc', 'desc']) sortDir?: 'asc' | 'desc';
}
