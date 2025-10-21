import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class NewPasswordDto {
  @IsString()
  @MinLength(6, { message: 'Пароль має бути мінімум 6 символів' })
  @IsNotEmpty()
  password: string;
}
