import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class WhatsappImportDto {
  @IsString() @MinLength(1) @MaxLength(20000) text!: string;
  @IsOptional() @Matches(/^[1-9]\d{0,18}$/) customerId?: string;
}
