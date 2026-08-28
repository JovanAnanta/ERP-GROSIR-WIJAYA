import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsBoolean,
  IsIn,
} from 'class-validator';

export class CreateSupplierDto {
  @IsNotEmpty({ message: 'Nama Supplier wajib diisi' })
  @IsString()
  supplierName!: string;

  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() picName?: string;

  @IsOptional()
  @IsBoolean()
  forceSave?: boolean;
}

export class UpdateSupplierDto {
  @IsNotEmpty({ message: 'Nama Supplier wajib diisi' })
  @IsString()
  supplierName!: string;

  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() picName?: string;

  @IsOptional()
  @IsBoolean()
  forceSave?: boolean;

  @IsNotEmpty({ message: 'Timestamp concurrency wajib dikirim' })
  @IsString()
  updatedAt!: string;
}

export class SupplierQueryDto {
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() limit?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE', 'ALL']) status?: string;
  @IsOptional() @IsIn(['YES', 'NO', 'ALL']) hasOutstandingAp?: string;
  @IsOptional() @IsString() sortBy?: string;
  @IsOptional() @IsIn(['asc', 'desc']) sortDir?: 'asc' | 'desc';
}
