import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsNotEmpty({ message: 'Username wajib diisi' })
  @IsString()
  username!: string;

  @IsNotEmpty({ message: 'Password wajib diisi' })
  @IsString()
  password!: string;
}

export class UnlockSessionDto {
  @IsNotEmpty({ message: 'Password wajib diisi untuk membuka sesi' })
  @IsString()
  password!: string;
}
