import { ArrayUnique, IsArray, IsString, Matches } from 'class-validator';

export class UpdateRolePermissionDto {
  @IsArray({ message: 'Daftar permission lama harus berupa array' })
  @IsString({
    each: true,
    message: 'Isi array permission lama harus berupa string ID',
  })
  @Matches(/^[1-9]\d*$/, { each: true, message: 'Permission ID tidak valid' })
  @ArrayUnique({ message: 'Permission lama tidak boleh duplikat' })
  oldPermissionIds!: string[];

  @IsArray({ message: 'Daftar permission baru harus berupa array' })
  @IsString({
    each: true,
    message: 'Isi array permission baru harus berupa string ID',
  })
  @Matches(/^[1-9]\d*$/, { each: true, message: 'Permission ID tidak valid' })
  @ArrayUnique({ message: 'Permission baru tidak boleh duplikat' })
  newPermissionIds!: string[];
}
