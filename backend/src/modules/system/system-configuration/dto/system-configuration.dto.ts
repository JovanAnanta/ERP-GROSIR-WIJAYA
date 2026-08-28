import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class UpdateSystemConfigurationDto {
  @IsNotEmpty({ message: 'Nama Perusahaan wajib diisi' })
  @IsString()
  companyName!: string;

  @IsNotEmpty({ message: 'Alamat wajib diisi' })
  @IsString()
  address!: string;

  @IsNotEmpty({ message: 'Nomor Telepon wajib diisi' })
  @IsString()
  phone!: string;

  @IsOptional() @IsString() logoBase64?: string;

  @IsOptional() @IsString() receiptHeader1?: string;
  @IsOptional() @IsString() receiptHeader2?: string;
  @IsOptional() @IsString() receiptHeader3?: string;

  @IsOptional() @IsString() receiptFooter1?: string;
  @IsOptional() @IsString() receiptFooter2?: string;
  @IsOptional() @IsString() receiptFooter3?: string;
}
