import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  Validate,
} from 'class-validator';
import { IsPasswordsMatchingConstraint } from 'src/libs/common/decorators/is-password-matching-constraint.decorator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  surname: string;

  @IsString()
  @IsNotEmpty()
  last_name: string;

  @IsString()
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6, {
    message: 'Пароль має бути більше 6 символів',
  })
  password: string;

  @Validate(IsPasswordsMatchingConstraint, {
    message: 'Паролі не співпадають',
  })
  passwordRepeat: string;
}
