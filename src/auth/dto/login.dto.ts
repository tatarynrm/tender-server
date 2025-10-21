import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @IsString()
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6, {
    message: 'Пароль має бути більше 6 символів',
  })
  password: string;

  @IsOptional()
  @IsString()
  code: string;
}
