import { IsArray, IsString } from 'class-validator';

export class UpdateRolePermissionDto {
  @IsArray({ message: 'Daftar permission lama harus berupa array' })
  @IsString({
    each: true,
    message: 'Isi array permission lama harus berupa string ID',
  })
  oldPermissionIds!: string[];

  @IsArray({ message: 'Daftar permission baru harus berupa array' })
  @IsString({
    each: true,
    message: 'Isi array permission baru harus berupa string ID',
  })
  newPermissionIds!: string[];
}
