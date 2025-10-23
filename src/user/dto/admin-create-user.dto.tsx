import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsString,
  ValidateNested,
  IsArray,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

class PhoneDto {
  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsBoolean()
  @IsOptional()
  is_viber?: boolean;

  @IsBoolean()
  @IsOptional()
  is_telegram?: boolean;

  @IsBoolean()
  @IsOptional()
  is_whatsapp?: boolean;
}

export class CreateUserFromCompany {
  @IsString()
  @IsNotEmpty()
  surname: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  last_name: string;

  @IsString()
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsBoolean()
  is_admin: boolean;

  @IsBoolean()
  is_manager: boolean;

  @IsBoolean()
  is_accountant: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PhoneDto)
  @IsOptional()
  usr_phone: PhoneDto[];
}
