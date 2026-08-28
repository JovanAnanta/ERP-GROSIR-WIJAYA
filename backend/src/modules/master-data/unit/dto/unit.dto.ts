import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsBoolean,
  IsIn,
} from 'class-validator';

export class CreateUnitDto {
  @IsNotEmpty({ message: 'Nama Unit wajib diisi' })
  @IsString()
  unitName!: string;

  @IsOptional()
  @IsBoolean()
  forceSave?: boolean;
}

// PERBAIKAN: Menggunakan Class Extends, BUKAN Type Alias.
// Dengan begini NestJS bisa membacanya saat proses validasi Runtime.
export class UpdateUnitDto extends CreateUnitDto {}

export class UnitQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE', 'ALL']) status?: string;
  @IsOptional() @IsString() sortBy?: string;
  @IsOptional() @IsIn(['asc', 'desc']) sortDir?: 'asc' | 'desc';
}
