import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class BaseLogQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsDateString() fromDate?: string;
  @IsOptional() @IsDateString() untilDate?: string;
  @IsOptional() @IsString() @Matches(/^[1-9]\d*$/) userId?: string;
  @IsOptional() @IsString() search?: string;
}

export class ActivityLogQueryDto extends BaseLogQueryDto {
  @IsOptional() @IsString() module?: string;
  @IsOptional()
  @IsIn([
    'LOGIN',
    'LOGOUT',
    'CREATE',
    'UPDATE',
    'DELETE',
    'IMPORT',
    'RESET_PASSWORD',
    'CHANGE_CONFIGURATION',
  ])
  activityType?: string;
}

export class AuditLogQueryDto extends BaseLogQueryDto {
  @IsOptional() @IsString() module?: string;
  @IsOptional() @IsString() entity?: string;
  @IsOptional() @IsIn(['CREATE', 'UPDATE', 'DELETE']) operation?: string;
}

export class SecurityLogQueryDto extends BaseLogQueryDto {
  @IsOptional()
  @IsIn([
    'LOGIN_FAILED',
    'ACCOUNT_LOCKED',
    'PASSWORD_RESET',
    'USER_INACTIVATED',
    'FORCED_LOGOUT',
    'CONCURRENT_LOGIN',
    'PERMISSION_DENIED',
    'UNAUTHORIZED_API_ACCESS',
  ])
  event?: string;
}
