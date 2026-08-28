import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsBoolean,
  IsIn,
} from 'class-validator';

export class CreateCustomerDto {
  @IsNotEmpty({ message: 'Nama Customer wajib diisi' })
  @IsString()
  customerName!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  // Bendera pintar untuk melewati peringatan duplikat (FR-CUST-001)
  @IsOptional()
  @IsBoolean()
  forceSave?: boolean;
}

export class UpdateCustomerDto {
  @IsNotEmpty({ message: 'Nama Customer wajib diisi' })
  @IsString()
  customerName!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsBoolean()
  forceSave?: boolean;

  @IsNotEmpty({ message: 'Timestamp concurrency wajib dikirim' })
  @IsString()
  updatedAt!: string; // Optimistic Concurrency Control
}

export class CustomerQueryDto {
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() limit?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE', 'ALL']) status?: string;
  @IsOptional() @IsIn(['YES', 'NO', 'ALL']) hasOutstandingAr?: string;
  @IsOptional() @IsString() sortBy?: string;
  @IsOptional() @IsIn(['asc', 'desc']) sortDir?: 'asc' | 'desc';
}
