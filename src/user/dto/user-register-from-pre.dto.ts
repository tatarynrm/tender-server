import { IsString, IsNotEmpty, IsEmail, IsOptional, IsNumber, IsPhoneNumber, Min } from 'class-validator';

export class UserRegisterFromPreDto {
  @IsString()
  @IsNotEmpty({ message: 'Ім’я обов’язкове' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'По-батькові обов’язкове' })
  last_name: string;

  @IsString()
  @IsNotEmpty({ message: 'Прізвище обов’язкове' })
  surname: string;

  @IsEmail({}, { message: 'Невірний email' })
  email: string;

  @IsString()
  @IsOptional()
  @IsPhoneNumber('UA', { message: 'Невірний номер телефону' })
  phone?: string;

  @IsNumber({}, { message: 'id_company має бути числом' })
  @Min(1)
  id_company: number;

  @IsNumber({}, { message: 'id_usr_pre_register має бути числом' })
  @Min(1)
  id_usr_pre_register: number;
}
