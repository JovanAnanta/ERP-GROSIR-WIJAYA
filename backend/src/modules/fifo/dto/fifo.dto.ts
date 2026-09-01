import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { INVENTORY_ORIGIN_TYPES } from '../../../common/inventory/inventory-origin.js';

const ORIGIN_TYPES = Object.values(INVENTORY_ORIGIN_TYPES);

export class FifoLayerListQueryDto {
  @IsOptional() @Matches(/^[1-9]\d{0,8}$/) page?: string;
  @IsOptional() @Matches(/^(?:20|30|50|100)$/) limit?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @Matches(/^[1-9]\d*$/) productId?: string;
  @IsOptional() @Matches(/^[1-9]\d*$/) categoryId?: string;
  @IsOptional() @Matches(/^[1-9]\d*$/) brandId?: string;
  @IsOptional() @Matches(/^[1-9]\d*$/) supplierId?: string;
  @IsOptional() @IsIn(ORIGIN_TYPES) originType?: string;
  @IsOptional() @IsIn(['ACTIVE', 'DEPLETED', 'ALL']) status?:
    'ACTIVE' | 'DEPLETED' | 'ALL';
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsIn(['OLDEST', 'NEWEST']) sort?: 'OLDEST' | 'NEWEST';
}

export class FifoTimelineQueryDto {
  @IsOptional() @Matches(/^[1-9]\d{0,8}$/) page?: string;
  @IsOptional() @Matches(/^(?:20|30|50|100)$/) limit?: string;
}
