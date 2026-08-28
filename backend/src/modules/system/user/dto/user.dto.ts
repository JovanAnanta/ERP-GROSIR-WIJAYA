import {
  IsNotEmpty,
  IsString,
  IsBoolean,
  MinLength,
  Matches,
} from 'class-validator';

export class CreateUserDto {
  @IsNotEmpty({ message: 'Nama wajib diisi' })
  @IsString()
  fullName!: string;

  @IsNotEmpty({ message: 'Username wajib diisi' })
  @IsString()
  username!: string;

  @IsNotEmpty({ message: 'Password wajib diisi' })
  @IsString()
  @MinLength(8, { message: 'Password minimal 8 karakter' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/, {
    message: 'Password wajib mengandung huruf dan angka',
  })
  password!: string;

  @IsNotEmpty({ message: 'Role wajib diisi' })
  @IsString()
  @Matches(/^[1-9]\d*$/, { message: 'Role ID tidak valid' })
  roleId!: string;
}

export class UpdateUserDto {
  @IsNotEmpty({ message: 'Nama wajib diisi' })
  @IsString()
  fullName!: string;

  @IsNotEmpty({ message: 'Role wajib diisi' })
  @IsString()
  @Matches(/^[1-9]\d*$/, { message: 'Role ID tidak valid' })
  roleId!: string;

  @IsNotEmpty({ message: 'Status wajib diisi' })
  @IsBoolean()
  isActive!: boolean;

  @IsNotEmpty({ message: 'Timestamp concurrency wajib dikirim' })
  @IsString()
  updatedAt!: string; // Untuk Optimistic Concurrency
}

export class ResetPasswordDto {
  @IsNotEmpty({ message: 'Password baru wajib diisi' })
  @IsString()
  @MinLength(8, { message: 'Password minimal 8 karakter' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/, {
    message: 'Password wajib mengandung huruf dan angka',
  })
  newPassword!: string;
}
