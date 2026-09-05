import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class AliasQueryDto {
  @IsIn(['PRODUCT', 'UNIT']) kind: 'PRODUCT' | 'UNIT' = 'PRODUCT';
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @Matches(/^[1-9]\d{0,18}$/) targetId?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(1000000) page = 1;
  @Type(() => Number) @IsInt() @IsIn([20, 30, 50, 100]) limit = 20;
}

export class CreateAliasesDto {
  @IsIn(['PRODUCT', 'UNIT']) kind!: 'PRODUCT' | 'UNIT';
  @Matches(/^[1-9]\d{0,18}$/) targetId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  aliases!: string[];
}

export class ChangeAliasDto {
  @IsIn(['PRODUCT', 'UNIT']) kind!: 'PRODUCT' | 'UNIT';
  @IsString() @MaxLength(255) originalName!: string;
  @IsString() @MaxLength(255) aliasName!: string;
}

export class DeleteAliasDto {
  @IsIn(['PRODUCT', 'UNIT']) kind!: 'PRODUCT' | 'UNIT';
  @IsString() @MaxLength(255) originalName!: string;
}
